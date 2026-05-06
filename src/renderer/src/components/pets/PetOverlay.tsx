import { useCallback, useEffect, useRef, useState } from 'react';
import { SpriteAnimator } from 'codex-pets-react';
import type { PetSettings, PendingPermission } from '@shared/types';
import {
  agentStatusToAnimation,
  forgePetAtlas,
  getPetSpritesheetUrl,
  type ForgePetAnimationName,
} from './pet-registry';
import { PetApprovalPopup } from './PetApprovalPopup';

// ── Random-walk constants (same as PetWidget) ──
const WANDER_INTERVAL_MIN = 5_000;
const WANDER_INTERVAL_MAX = 12_000;
const WANDER_DISTANCE_MIN = 30;
const WANDER_DISTANCE_MAX = 80;
const WANDER_STEP_DURATION = 1_200;

/**
 * Standalone pet overlay for the transparent pet window.
 *
 * Architecture:
 *  - The Electron window is exactly the size of one sprite frame
 *  - SpriteAnimator renders the animation inside it (no PetWidget / position:fixed)
 *  - Dragging the sprite moves the Electron window itself via IPC
 *  - No fullscreen overlay, so nothing blocks interaction with other windows
 *
 * Agent lifecycle integration:
 *  - Receives agent status updates via IPC from the main process
 *  - Maps status → animation (working → running, review → review, permission → waving)
 *  - Drag gestures override agent status animations; status resumes after drag ends
 *
 * Permission approval:
 *  - When a PermissionRequest arrives, the pet window expands to show an approval popup
 *  - Allow/Deny buttons send the decision back to the main process via IPC
 *  - The Electron window size adjusts dynamically to fit the popup
 *
 * Random movement:
 *  - When allowRandomMove is enabled and agent is idle, the pet overlay window
 *    periodically moves itself to a random nearby screen position.
 */
export function PetOverlay() {
  const [petSettings, setPetSettings] = useState<PetSettings | null>(null);
  const [animation, setAnimation] = useState<ForgePetAnimationName>('idle');
  const [dragging, setDragging] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [isPermissionStatus, setIsPermissionStatus] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Track the current agent status so we can restore the correct animation
  // after drag ends (instead of always falling back to 'idle').
  const agentStatusRef = useRef<string>('idle');
  const isWanderingRef = useRef(false);
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const wanderStepTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Listen for settings changes from the main process
  useEffect(() => {
    const api = window.forgepadPet;
    if (!api) return;
    return api.onSettingsChanged((settings) => {
      setPetSettings(settings);
    });
  }, []);

  // Idle → waiting after 8s of no interaction (only when agent is idle)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      // Only switch to waiting if agent is idle; otherwise the agent-driven
      // animation should stay visible.
      if (agentStatusRef.current === 'idle') {
        setAnimation('waiting');
      }
    }, 8000);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    return () => clearTimeout(idleTimer.current);
  }, [resetIdleTimer]);

  // ── Agent status → animation ──
  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onAgentStatusUpdate) return;
    return api.onAgentStatusUpdate((status) => {
      agentStatusRef.current = status;
      setIsPermissionStatus(status === 'permission');
      // Clear pending permission when status changes away from 'permission'
      if (status !== 'permission') {
        setPendingPermission(null);
      }
      // Don't override drag-gesture or wander animations
      if (dragging || isWanderingRef.current) return;
      const anim = agentStatusToAnimation(status);
      setAnimation(anim);
      // Reset or cancel idle timer based on status
      if (status === 'idle') {
        resetIdleTimer();
      } else {
        clearTimeout(idleTimer.current);
      }
    });
  }, [dragging, resetIdleTimer]);

  // ── Permission request → approval popup ──
  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onPermissionRequest) return;
    return api.onPermissionRequest((data) => {
      // If toolName is empty, it's a clear signal
      if (!data.toolName) {
        setPendingPermission(null);
        return;
      }
      setPendingPermission(data);
    });
  }, []);

  const handleApprove = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, 'allow');
    setPendingPermission(null);
  }, [pendingPermission]);

  const handleAllowAlways = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, 'allowAlways');
    setPendingPermission(null);
  }, [pendingPermission]);

  const handleAnswer = useCallback(
    (answers: Record<string, string>) => {
      if (!pendingPermission) return;
      window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, 'answer', answers);
      setPendingPermission(null);
    },
    [pendingPermission],
  );

  const handleDeny = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, 'deny');
    setPendingPermission(null);
  }, [pendingPermission]);

  // ── Random walk for PetOverlay (moves the Electron window) ──
  useEffect(() => {
    const allowRandom = petSettings?.allowRandomMove ?? true;
    const enabled = petSettings?.enabled ?? false;
    if (!allowRandom || !enabled || agentStatusRef.current !== 'idle') {
      clearTimeout(wanderTimerRef.current);
      clearTimeout(wanderStepTimerRef.current);
      isWanderingRef.current = false;
      return;
    }

    // We need the current window position to compute offsets.
    // For the overlay, screenX/screenY of the window is tracked via
    // pointer events, but we can get it from window.screenX/screenY.
    const scheduleWander = () => {
      const delay = WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
      wanderTimerRef.current = setTimeout(() => {
        if (dragging) {
          scheduleWander();
          return;
        }

        const distance = WANDER_DISTANCE_MIN + Math.random() * (WANDER_DISTANCE_MAX - WANDER_DISTANCE_MIN);
        const direction = Math.random();
        let dx = 0;
        let dy = 0;
        let walkAnim: ForgePetAnimationName;

        if (direction < 0.2) {
          // Go left
          dx = -distance;
          dy = (Math.random() - 0.5) * 20;
          walkAnim = 'running-left';
        } else if (direction < 0.4) {
          // Go right
          dx = distance;
          dy = (Math.random() - 0.5) * 20;
          walkAnim = 'running-right';
        } else if (direction < 0.5) {
          // Jump up
          dy = -(distance * 0.5);
          dx = (Math.random() - 0.5) * 30;
          walkAnim = 'jumping';
        } else if (direction < 0.6) {
          // Move down
          dy = distance * 0.5;
          dx = (Math.random() - 0.5) * 30;
          walkAnim = 'waving';
        } else if (direction < 0.7) {
          // Diagonal upper-left
          dx = -distance * 0.7;
          dy = -distance * 0.4;
          walkAnim = 'running-left';
        } else if (direction < 0.8) {
          // Diagonal upper-right
          dx = distance * 0.7;
          dy = -distance * 0.4;
          walkAnim = 'running-right';
        } else if (direction < 0.9) {
          // Diagonal lower-left
          dx = -distance * 0.7;
          dy = distance * 0.4;
          walkAnim = 'running-left';
        } else {
          // Diagonal lower-right
          dx = distance * 0.7;
          dy = distance * 0.4;
          walkAnim = 'running-right';
        }

        isWanderingRef.current = true;
        setAnimation(walkAnim);

        // Move the Electron window, clamped to screen work area
        const rawX = window.screenX + dx;
        const rawY = window.screenY + dy;
        const sw = window.screen.availWidth;
        const sh = window.screen.availHeight;
        const sl = window.screen.availLeft ?? 0;
        const st = window.screen.availTop ?? 0;
        const winW = window.outerWidth;
        const winH = window.outerHeight;
        const newX = Math.max(sl, Math.min(sl + sw - winW, rawX));
        const newY = Math.max(st, Math.min(st + sh - winH, rawY));
        window.forgepadPet?.moveWindow(Math.round(newX), Math.round(newY));

        wanderStepTimerRef.current = setTimeout(() => {
          isWanderingRef.current = false;
          if (!dragging) {
            const anim = agentStatusToAnimation(agentStatusRef.current);
            setAnimation(anim);
          }
          scheduleWander();
        }, WANDER_STEP_DURATION);
      }, delay);
    };

    scheduleWander();

    return () => {
      clearTimeout(wanderTimerRef.current);
      clearTimeout(wanderStepTimerRef.current);
      isWanderingRef.current = false;
    };
  }, [petSettings?.allowRandomMove, petSettings?.enabled, dragging]);

  // ── Click vs drag detection ──
  // Track pointer-down position to distinguish click from drag.
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDragMove = useRef(false);

  // Drag handling — moves the Electron window
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      pointerDownPos.current = { x: e.screenX, y: e.screenY };
      didDragMove.current = false;

      // Get current window position on screen
      // screenX/screenY of the event minus clientX/clientY gives window origin
      const winX = e.screenX - e.clientX;
      const winY = e.screenY - e.clientY;
      dragOffset.current = {
        x: e.screenX - winX,
        y: e.screenY - winY,
      };

      // Cancel any in-progress wander
      clearTimeout(wanderStepTimerRef.current);
      isWanderingRef.current = false;

      setDragging(true);
      setAnimation('idle');
      resetIdleTimer();
    },
    [resetIdleTimer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      didDragMove.current = true;
      const newX = e.screenX - dragOffset.current.x;
      const newY = e.screenY - dragOffset.current.y;
      window.forgepadPet?.moveWindow(newX, newY);

      // Determine drag direction for animation
      const dx = e.movementX;
      if (dx > 2) setAnimation('running-right');
      else if (dx < -2) setAnimation('running-left');
    },
    [dragging],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);

      // Click detection: if pointer barely moved, treat as click
      // → focus the main ForgePad window and jump to the most urgent agent tab
      if (pointerDownPos.current && !didDragMove.current) {
        const dx = e.screenX - pointerDownPos.current.x;
        const dy = e.screenY - pointerDownPos.current.y;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          window.forgepadPet?.focusAgent();
        }
      }
      pointerDownPos.current = null;

      // Restore animation to match current agent status (not always idle)
      const anim = agentStatusToAnimation(agentStatusRef.current);
      setAnimation(anim);
      if (agentStatusRef.current === 'idle') {
        resetIdleTimer();
      }
    },
    [dragging, resetIdleTimer],
  );

  // ── Resize Electron window when approval popup appears/disappears ──
  const showApproval = isPermissionStatus && pendingPermission !== null;
  const prevShowApproval = useRef(false);

  useEffect(() => {
    if (!petSettings) return;
    const api = window.forgepadPet;
    if (!api?.resizeWindow) return;

    const scale = petSettings.petSize;
    const spriteW = Math.round(192 * scale);
    const spriteH = Math.round(208 * scale);

    if (showApproval && !prevShowApproval.current) {
      // Expand window upward to fit popup.
      // Questions with options need more vertical space than simple approval.
      const isQuestion = pendingPermission?.questions && pendingPermission.questions.length > 0;
      const optionCount = isQuestion ? (pendingPermission.questions![0].options.length ?? 0) : 0;
      const hasDescription = isQuestion && pendingPermission.questions![0].options.some((o) => o.description);
      // Each option button: ~30px + 4px gap; with description: ~44px + 4px gap
      // Header ~20px + question text ~30px + bottom buttons ~32px + padding ~24px
      const optionItemH = hasDescription ? 48 : 34;
      const popupH = isQuestion ? 106 + optionCount * optionItemH : 120;
      const totalW = Math.max(spriteW, isQuestion ? 320 : 280);
      const totalH = spriteH + popupH;
      api.resizeWindow(totalW, totalH);
    } else if (!showApproval && prevShowApproval.current) {
      // Shrink back to sprite size
      api.resizeWindow(spriteW, spriteH);
    }
    prevShowApproval.current = showApproval;
  }, [showApproval, petSettings, pendingPermission]);

  if (!petSettings || !petSettings.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Approval popup above the pet sprite */}
      {showApproval && pendingPermission && (
        <PetApprovalPopup
          permission={pendingPermission}
          onAllow={handleApprove}
          onAllowAlways={handleAllowAlways}
          onDeny={handleDeny}
          onAnswer={handleAnswer}
          variant="overlay"
        />
      )}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <SpriteAnimator<ForgePetAnimationName>
          src={src}
          atlas={forgePetAtlas}
          animation={animation}
          scale={petSettings.petSize}
          imageRendering="pixelated"
          ariaLabel="Desktop Pet"
        />
      </div>
    </div>
  );
}
