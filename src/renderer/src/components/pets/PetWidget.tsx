import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  PetWidget as CodexPetWidget,
  usePetController,
  usePetDragGestureAnimations,
  type PetAction,
  type PetDragGestureAnimationMap,
} from 'codex-pets-react';
import { useAppStore } from '@renderer/store/app-store';
import type { AgentStatus } from '@shared/agent-lifecycle';
import {
  agentStatusToAnimation,
  forgePetAtlas,
  getPetSpritesheetUrl,
  type ForgePetAnimationName,
} from './pet-registry';
import { PetApprovalPopup } from './PetApprovalPopup';

/** Priority for each agent status — higher = more urgent. */
const STATUS_PRIORITY: Record<AgentStatus, number> = {
  idle: 0,
  working: 1,
  review: 2,
  permission: 3,
};

// ── Random-walk constants ──
const WANDER_INTERVAL_MIN = 5_000; // min ms between wanders
const WANDER_INTERVAL_MAX = 12_000; // max ms between wanders
const WANDER_DISTANCE_MIN = 40; // min px per wander step
const WANDER_DISTANCE_MAX = 120; // max px per wander step
const WANDER_STEP_DURATION = 1_200; // ms to play the walk animation before stopping

/**
 * Renders the desktop pet overlay using codex-pets-react.
 * Reads pet settings from the Zustand store to decide which pet,
 * size, and whether it's enabled.
 *
 * The pet animation is driven by the active agent tab's lifecycle status:
 *   idle       → idle (then waiting after 8s timeout)
 *   working    → running
 *   review     → review
 *   permission → waving
 *
 * When "Random Movement" is enabled and the agent is idle, the pet
 * will periodically wander to a random nearby position on its own.
 *
 * Drag gestures take priority over everything else.
 */
export function PetWidget() {
  const petSettings = useAppStore((s) => s.settings.pets);

  // ── Agent status → pet animation ──
  const activeAgentTabId = useAppStore((s) => s.activeAgentTabId);
  const tabs = useAppStore((s) => s.tabs);
  const agentStatuses = useAppStore((s) => s.agentStatuses);

  const pendingPermission = useAppStore((s) => s.pendingPermission);

  const activeAgentStatus = useMemo(() => {
    const tab = tabs.find((t) => t.id === activeAgentTabId);
    if (tab?.type === 'terminal' && tab.ptyId) {
      return agentStatuses[tab.ptyId] ?? 'idle';
    }
    return 'idle';
  }, [tabs, activeAgentTabId, agentStatuses]);

  const { pet, petDispatch } = usePetController<ForgePetAnimationName>({
    initialState: {
      animation: { name: 'idle', mode: 'loop' },
      pin: 'bottom-right',
      position: { x: 200, y: 200 },
    },
    defaultAnimation: 'idle',
    waitingAnimation: 'waiting',
    // Only auto-switch to waiting when agent is idle; agent-driven
    // animations (running/review/waving) are set via the effect below.
    waitingAfterMs: 8000,
  });

  // Track whether the user is actively dragging so we don't override
  // drag-gesture animations with agent status changes mid-drag.
  const isDraggingRef = useRef(false);
  // Track whether a random-walk step is in progress so agent-status
  // changes don't interrupt the walk animation mid-step.
  const isWanderingRef = useRef(false);

  // When agent status changes, update the pet animation (unless dragging/wandering).
  useEffect(() => {
    if (isDraggingRef.current || isWanderingRef.current) return;
    const anim = agentStatusToAnimation(activeAgentStatus);
    petDispatch({ type: 'setAnimation', animation: { name: anim, mode: 'loop' } });
  }, [activeAgentStatus, petDispatch]);

  // ── Random walk (only when idle + allowRandomMove) ──
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const wanderStepTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const allowRandom = petSettings.allowRandomMove ?? true;
    if (!allowRandom || !petSettings.enabled || activeAgentStatus !== 'idle') {
      clearTimeout(wanderTimerRef.current);
      clearTimeout(wanderStepTimerRef.current);
      isWanderingRef.current = false;
      return;
    }

    const scheduleWander = () => {
      const delay = WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
      wanderTimerRef.current = setTimeout(() => {
        if (isDraggingRef.current) {
          scheduleWander();
          return;
        }

        // Pick a random direction: left, right, up, down, or diagonal
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

        // Clamp position to stay within viewport bounds
        const spriteW = 192 * petSettings.petSize;
        const spriteH = 208 * petSettings.petSize;
        const margin = 8;
        const newX = Math.max(margin, Math.min(window.innerWidth - spriteW - margin, pet.position.x + dx));
        const newY = Math.max(40, Math.min(window.innerHeight - spriteH - margin, pet.position.y + dy));

        // Start walk animation
        isWanderingRef.current = true;
        petDispatch({ type: 'setAnimation', animation: { name: walkAnim, mode: 'loop' } });

        // Move position
        petDispatch({
          type: 'setPosition',
          position: {
            x: newX,
            y: newY,
          },
        });

        // After the step completes, go back to idle/status animation
        wanderStepTimerRef.current = setTimeout(() => {
          isWanderingRef.current = false;
          if (!isDraggingRef.current) {
            const anim = agentStatusToAnimation(activeAgentStatus);
            petDispatch({ type: 'setAnimation', animation: { name: anim, mode: 'loop' } });
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
    // pet.position is intentionally omitted to avoid re-scheduling on every position change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petSettings.allowRandomMove, petSettings.enabled, activeAgentStatus, petDispatch]);

  const dragGestureAnimations = useMemo(
    () =>
      ({
        left: 'running-left',
        right: 'running-right',
        up: 'jumping',
        down: 'waving',
      }) satisfies PetDragGestureAnimationMap<ForgePetAnimationName>,
    [],
  );

  const commitAction = useCallback(
    (action: PetAction<ForgePetAnimationName>) => {
      petDispatch(action);
    },
    [petDispatch],
  );

  // After a drag ends, restore the animation that matches the current
  // agent status instead of always falling back to 'idle'.
  const restAnimation = agentStatusToAnimation(activeAgentStatus);

  const observeDragGesture = usePetDragGestureAnimations<ForgePetAnimationName>({
    enabled: true,
    animations: dragGestureAnimations,
    restAnimation,
    restDelayMs: 140,
    minimumDistance: 16,
    axisBias: 1.12,
    onGestureAction: commitAction,
  });

  // ── Click → jump to most urgent agent tab ──
  // We distinguish click vs drag: record pointer-down position, and on
  // pointer-up if the pointer barely moved, treat it as a click.
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const handlePetClick = useCallback(() => {
    const state = useAppStore.getState();
    const agentTabs = state.tabs.filter(
      (t) => t.type === 'terminal' && t.isAgent && t.workspaceId === state.activeWorkspaceId,
    );
    if (agentTabs.length === 0) return;

    // Find the agent tab with the most urgent status
    // (permission > review > working > idle), falling back to the active agent tab.
    let bestTab = agentTabs[0];
    let bestPriority = -1;
    for (const t of agentTabs) {
      if (t.type !== 'terminal') continue;
      const status = state.agentStatuses[t.ptyId] ?? 'idle';
      const pri = STATUS_PRIORITY[status] ?? 0;
      if (pri > bestPriority) {
        bestPriority = pri;
        bestTab = t;
      }
    }

    state.setActiveTab(bestTab.id);
    if (bestTab.workspaceId !== state.activeWorkspaceId) {
      state.setActiveWorkspace(bestTab.workspaceId);
    }
  }, []);

  const dispatchAction = useCallback(
    (action: PetAction<ForgePetAnimationName>) => {
      // Track drag state so agent-status & wander effects don't fight gestures.
      if (action.type === 'dragStart') {
        isDraggingRef.current = true;
        didDragRef.current = true;
        // Cancel any in-progress wander step
        clearTimeout(wanderStepTimerRef.current);
        isWanderingRef.current = false;
      }
      if (action.type === 'dragEnd' || action.type === 'drop') isDraggingRef.current = false;

      commitAction(action);
      observeDragGesture(action);
    },
    [commitAction, observeDragGesture],
  );

  // ── Permission approval handlers ──
  const showApproval = activeAgentStatus === 'permission' && pendingPermission !== null;

  const handleApprove = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepad.agent.sendPermissionDecision(pendingPermission.ptyId, 'allow');
    useAppStore.getState().setPendingPermission(null);
  }, [pendingPermission]);

  const handleAllowAlways = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepad.agent.sendPermissionDecision(pendingPermission.ptyId, 'allowAlways');
    useAppStore.getState().setPendingPermission(null);
  }, [pendingPermission]);

  const handleAnswer = useCallback(
    (answers: Record<string, string>) => {
      if (!pendingPermission) return;
      window.forgepad.agent.sendPermissionDecision(pendingPermission.ptyId, 'answer', answers);
      useAppStore.getState().setPendingPermission(null);
    },
    [pendingPermission],
  );

  const handleDeny = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepad.agent.sendPermissionDecision(pendingPermission.ptyId, 'deny');
    useAppStore.getState().setPendingPermission(null);
  }, [pendingPermission]);

  if (!petSettings.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);

  return (
    <div
      onPointerDown={(e) => {
        pointerDownPos.current = { x: e.clientX, y: e.clientY };
        didDragRef.current = false;
      }}
      onPointerUp={(e) => {
        // Only treat as click if pointer barely moved (< 5px) and no drag occurred
        if (pointerDownPos.current && !didDragRef.current) {
          const dx = e.clientX - pointerDownPos.current.x;
          const dy = e.clientY - pointerDownPos.current.y;
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
            handlePetClick();
          }
        }
        pointerDownPos.current = null;
      }}
      style={{ position: 'relative' }}
    >
      {/* Approval popup positioned above the pet */}
      {showApproval && pendingPermission && (
        <PetApprovalPopup
          permission={pendingPermission}
          onAllow={handleApprove}
          onAllowAlways={handleAllowAlways}
          onDeny={handleDeny}
          onAnswer={handleAnswer}
          variant="widget"
        />
      )}
      <CodexPetWidget
        src={src}
        atlas={forgePetAtlas}
        animation={pet.animation}
        position={pet.position}
        pin={pet.pin}
        draggable
        scale={petSettings.petSize}
        boundsPadding={{ top: 40, right: 8, bottom: 8, left: 8 }}
        zIndex={50}
        imageRendering="pixelated"
        ariaLabel="Desktop Pet – click to jump to agent"
        onAction={dispatchAction}
      />
    </div>
  );
}
