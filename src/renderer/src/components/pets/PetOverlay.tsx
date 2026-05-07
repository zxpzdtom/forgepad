import { useCallback, useEffect, useRef, useState } from 'react';
import { SpriteAnimator } from 'codex-pets-react';
import type { PendingPermission, PetSettings, PetStageRect, PetStageSnapshot, PetStageWindow } from '@shared/types';
import {
  agentStatusToAnimation,
  forgePetAtlas,
  getPetSpritesheetUrl,
  type ForgePetAnimationName,
} from './pet-registry';
import { PetApprovalPopup } from './PetApprovalPopup';

const BASE_SPRITE_WIDTH = 192;
const BASE_SPRITE_HEIGHT = 208;
const EDGE_MARGIN = 8;

type MotionPoint = { x: number; y: number };
type MotionAction = 'stroll' | 'hop' | 'stairs' | 'portal' | 'windowTop';
type PortalPhase = 'enter' | 'exit' | null;

const PLAY_MODE_INTERVALS: Record<PetSettings['petPlayMode'], { min: number; max: number }> = {
  cozy: { min: 8_000, max: 16_000 },
  playful: { min: 4_500, max: 10_000 },
  adventure: { min: 3_000, max: 7_000 },
};

const PLAY_MODE_WEIGHTS: Record<PetSettings['petPlayMode'], Array<{ action: MotionAction; weight: number }>> = {
  cozy: [
    { action: 'stroll', weight: 45 },
    { action: 'hop', weight: 24 },
    { action: 'stairs', weight: 16 },
    { action: 'portal', weight: 8 },
    { action: 'windowTop', weight: 7 },
  ],
  playful: [
    { action: 'stroll', weight: 24 },
    { action: 'hop', weight: 24 },
    { action: 'stairs', weight: 20 },
    { action: 'portal', weight: 15 },
    { action: 'windowTop', weight: 17 },
  ],
  adventure: [
    { action: 'stroll', weight: 12 },
    { action: 'hop', weight: 20 },
    { action: 'stairs', weight: 22 },
    { action: 'portal', weight: 21 },
    { action: 'windowTop', weight: 25 },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function chooseWeighted<T extends string>(choices: Array<{ action: T; weight: number }>): T {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let roll = Math.random() * total;
  for (const choice of choices) {
    roll -= choice.weight;
    if (roll <= 0) return choice.action;
  }
  return choices[choices.length - 1].action;
}

function animationForDelta(dx: number): ForgePetAnimationName {
  if (Math.abs(dx) < 10) return 'jumping';
  return dx < 0 ? 'running-left' : 'running-right';
}

function spriteSize(settings: PetSettings | null): { width: number; height: number } {
  const scale = settings?.petSize ?? 0.8;
  return {
    width: Math.round(BASE_SPRITE_WIDTH * scale),
    height: Math.round(BASE_SPRITE_HEIGHT * scale),
  };
}

function fallbackStage(): PetStageSnapshot {
  const screenAny = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    capturedAt: Date.now(),
    workArea: {
      x: screenAny.availLeft ?? 0,
      y: screenAny.availTop ?? 0,
      width: screenAny.availWidth,
      height: screenAny.availHeight,
    },
    displays: [
      {
        x: screenAny.availLeft ?? 0,
        y: screenAny.availTop ?? 0,
        width: screenAny.availWidth,
        height: screenAny.availHeight,
      },
    ],
    windows: [],
  };
}

function nearestDisplay(stage: PetStageSnapshot, point: MotionPoint): PetStageRect {
  const displays = stage.displays.length > 0 ? stage.displays : [stage.workArea];
  const containing = displays.find(
    (display) =>
      point.x >= display.x &&
      point.x <= display.x + display.width &&
      point.y >= display.y &&
      point.y <= display.y + display.height,
  );
  if (containing) return containing;

  return displays.reduce((best, display) => {
    const bestCenter = { x: best.x + best.width / 2, y: best.y + best.height / 2 };
    const displayCenter = { x: display.x + display.width / 2, y: display.y + display.height / 2 };
    const bestDistance = (bestCenter.x - point.x) ** 2 + (bestCenter.y - point.y) ** 2;
    const displayDistance = (displayCenter.x - point.x) ** 2 + (displayCenter.y - point.y) ** 2;
    return displayDistance < bestDistance ? display : best;
  }, displays[0]);
}

function clampToStage(stage: PetStageSnapshot, point: MotionPoint, size: { width: number; height: number }): MotionPoint {
  const area = nearestDisplay(stage, point);
  return {
    x: clamp(point.x, area.x + EDGE_MARGIN, area.x + area.width - size.width - EDGE_MARGIN),
    y: clamp(point.y, area.y + EDGE_MARGIN, area.y + area.height - size.height - EDGE_MARGIN),
  };
}

function desktopY(stage: PetStageSnapshot, x: number, size: { height: number }): number {
  const area = nearestDisplay(stage, { x, y: window.screenY });
  return area.y + area.height - size.height - EDGE_MARGIN;
}

function pickWindow(stage: PetStageSnapshot, size: { width: number; height: number }): PetStageWindow | null {
  const usable = stage.windows.filter((win) => win.width > size.width + 80 && win.height > size.height * 0.7);
  if (usable.length === 0) return null;

  const current = { x: window.screenX, y: window.screenY };
  const nearby = usable
    .map((win) => {
      const cx = win.x + win.width / 2;
      const cy = win.y + win.height / 2;
      return { win, distance: (cx - current.x) ** 2 + (cy - current.y) ** 2 };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);

  return nearby[Math.floor(Math.random() * nearby.length)]?.win ?? usable[0];
}

function randomDesktopPoint(stage: PetStageSnapshot, size: { width: number; height: number }): MotionPoint {
  const area = nearestDisplay(stage, { x: window.screenX, y: window.screenY });
  return {
    x: randomBetween(area.x + EDGE_MARGIN, area.x + area.width - size.width - EDGE_MARGIN),
    y: randomBetween(area.y + 48, area.y + area.height - size.height - EDGE_MARGIN),
  };
}

/**
 * Standalone pet overlay for the transparent pet window.
 *
 * The Electron window is sprite-sized and non-blocking. Autonomous play is
 * therefore expressed by moving the window across the screen: short strolls,
 * jumps, stair-step climbs, portal hops, and occasional walks along visible
 * app window tops. Any agent notification state cancels play immediately.
 */
export function PetOverlay() {
  const [petSettings, setPetSettings] = useState<PetSettings | null>(null);
  const [animation, setAnimation] = useState<ForgePetAnimationName>('idle');
  const [dragging, setDragging] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [isPermissionStatus, setIsPermissionStatus] = useState(false);
  const [portalPhase, setPortalPhase] = useState<PortalPhase>(null);

  const dragOffset = useRef({ x: 0, y: 0 });
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDragMove = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const frameRef = useRef<number>();
  const scheduleNextRef = useRef<(delayOverride?: number) => void>(() => {});

  const agentStatusRef = useRef<string>('idle');
  const isPermissionStatusRef = useRef(false);
  const isWanderingRef = useRef(false);
  const draggingRef = useRef(false);
  const petSettingsRef = useRef<PetSettings | null>(null);
  const pendingPermissionRef = useRef<PendingPermission | null>(null);
  const stageRef = useRef<PetStageSnapshot | null>(null);
  const motionRunIdRef = useRef(0);
  const positionRef = useRef<MotionPoint>({ x: window.screenX, y: window.screenY });

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (agentStatusRef.current === 'idle' && !isWanderingRef.current && !draggingRef.current) {
        setAnimation('waiting');
      }
    }, 8000);
  }, []);

  const isAutonomousAllowed = useCallback(() => {
    const settings = petSettingsRef.current;
    return Boolean(
      settings?.enabled &&
        (settings.allowRandomMove ?? true) &&
        agentStatusRef.current === 'idle' &&
        !isPermissionStatusRef.current &&
        !pendingPermissionRef.current &&
        !draggingRef.current,
    );
  }, []);

  const clearAutonomousTimers = useCallback(() => {
    clearTimeout(wanderTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
  }, []);

  const restoreStatusAnimation = useCallback(() => {
    if (draggingRef.current) return;
    setAnimation(agentStatusToAnimation(agentStatusRef.current));
    if (agentStatusRef.current === 'idle') {
      resetIdleTimer();
    }
  }, [resetIdleTimer]);

  const cancelAutonomousMotion = useCallback(() => {
    motionRunIdRef.current += 1;
    isWanderingRef.current = false;
    setPortalPhase(null);
    clearAutonomousTimers();
    restoreStatusAnimation();
  }, [clearAutonomousTimers, restoreStatusAnimation]);

  const moveWindowTo = useCallback((point: MotionPoint) => {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    positionRef.current = { x, y };
    window.forgepadPet?.moveWindow(x, y);
  }, []);

  const readStage = useCallback(async () => {
    try {
      const stage = (await window.forgepadPet?.getStage?.()) ?? fallbackStage();
      stageRef.current = stage;
      return stage;
    } catch {
      const stage = fallbackStage();
      stageRef.current = stage;
      return stage;
    }
  }, []);

  const scaledDuration = useCallback((baseMs: number) => {
    const speed = clamp(petSettingsRef.current?.petSpeed ?? 2, 0.5, 5);
    return baseMs / Math.sqrt(speed / 2);
  }, []);

  const pause = useCallback(
    (ms: number, runId: number) =>
      new Promise<boolean>((resolve) => {
        pauseTimerRef.current = setTimeout(() => {
          resolve(runId === motionRunIdRef.current && isAutonomousAllowed());
        }, scaledDuration(ms));
      }),
    [isAutonomousAllowed, scaledDuration],
  );

  const animateTo = useCallback(
    (
      target: MotionPoint,
      options: {
        runId: number;
        duration: number;
        jumpHeight?: number;
        animation?: ForgePetAnimationName;
        fall?: boolean;
      },
    ) =>
      new Promise<boolean>((resolve) => {
        const stage = stageRef.current ?? fallbackStage();
        const size = spriteSize(petSettingsRef.current);
        const from = { ...positionRef.current };
        const to = clampToStage(stage, target, size);
        const startedAt = performance.now();
        const duration = Math.max(80, scaledDuration(options.duration));
        setAnimation(options.animation ?? animationForDelta(to.x - from.x));

        const step = (now: number) => {
          if (options.runId !== motionRunIdRef.current || !isAutonomousAllowed()) {
            resolve(false);
            return;
          }

          const t = clamp((now - startedAt) / duration, 0, 1);
          const eased = options.fall ? easeOut(t) : easeInOut(t);
          const x = from.x + (to.x - from.x) * eased;
          let y = from.y + (to.y - from.y) * (options.fall ? t * t : eased);
          if (options.jumpHeight && !options.fall) {
            y -= Math.sin(Math.PI * t) * options.jumpHeight;
          }
          moveWindowTo(clampToStage(stage, { x, y }, size));

          if (t < 1) {
            frameRef.current = requestAnimationFrame(step);
            return;
          }
          frameRef.current = undefined;
          resolve(true);
        };

        frameRef.current = requestAnimationFrame(step);
      }),
    [isAutonomousAllowed, moveWindowTo, scaledDuration],
  );

  const doStroll = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const direction = Math.random() < 0.5 ? -1 : 1;
      const distance = randomBetween(45, 130);
      const target = clampToStage(stage, {
        x: positionRef.current.x + direction * distance,
        y: positionRef.current.y + randomBetween(-22, 18),
      }, size);
      await animateTo(target, {
        runId,
        duration: 850 + distance * 4,
        animation: direction < 0 ? 'running-left' : 'running-right',
      });
    },
    [animateTo],
  );

  const doHop = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const target = clampToStage(stage, {
        x: positionRef.current.x + randomBetween(-190, 190),
        y: positionRef.current.y + randomBetween(-90, 80),
      }, size);
      await animateTo(target, {
        runId,
        duration: 760,
        jumpHeight: randomBetween(52, 104),
        animation: 'jumping',
      });
    },
    [animateTo],
  );

  const doStairs = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const direction = Math.random() < 0.5 ? -1 : 1;
      const climbing = Math.random() < 0.58;
      const steps = randomInt(4, 7);
      for (let i = 0; i < steps; i += 1) {
        if (!isAutonomousAllowed()) return;
        const size = spriteSize(petSettingsRef.current);
        const target = clampToStage(stage, {
          x: positionRef.current.x + direction * randomBetween(22, 36),
          y: positionRef.current.y + (climbing ? -randomBetween(10, 16) : randomBetween(10, 15)),
        }, size);
        const ok = await animateTo(target, {
          runId,
          duration: 210,
          jumpHeight: 16,
          animation: 'jumping',
        });
        if (!ok) return;
      }
      await pause(220, runId);
    },
    [animateTo, isAutonomousAllowed, pause],
  );

  const doPortal = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const win = Math.random() < 0.58 ? pickWindow(stage, size) : null;
      const target = win
        ? {
            x: randomBetween(win.x + EDGE_MARGIN, win.x + win.width - size.width - EDGE_MARGIN),
            y: Math.max(nearestDisplay(stage, win).y + EDGE_MARGIN, win.y - size.height + 6),
          }
        : randomDesktopPoint(stage, size);

      setAnimation('waving');
      setPortalPhase('enter');
      if (!(await pause(420, runId))) return;
      moveWindowTo(clampToStage(stage, target, size));
      setPortalPhase('exit');
      setAnimation('jumping');
      await pause(520, runId);
      setPortalPhase(null);
    },
    [moveWindowTo, pause],
  );

  const doWindowTopWalk = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const win = pickWindow(stage, size);
      if (!win) {
        await doHop(stage, runId);
        return;
      }

      const display = nearestDisplay(stage, win);
      const sideWalk = Math.random() < 0.28;
      if (sideWalk) {
        const onLeft = Math.random() < 0.5;
        const sideX = onLeft
          ? Math.max(display.x + EDGE_MARGIN, win.x - size.width + 6)
          : Math.min(display.x + display.width - size.width - EDGE_MARGIN, win.x + win.width - 6);
        const minY = clamp(win.y + 24, display.y + EDGE_MARGIN, display.y + display.height - size.height - EDGE_MARGIN);
        const maxY = clamp(win.y + win.height - size.height - 24, display.y + EDGE_MARGIN, display.y + display.height - size.height - EDGE_MARGIN);
        const startY = randomBetween(Math.min(minY, maxY), Math.max(minY, maxY));
        const entered = await animateTo(
          { x: sideX, y: startY },
          {
            runId,
            duration: 940,
            jumpHeight: randomBetween(54, 96),
            animation: 'jumping',
          },
        );
        if (!entered) return;

        const edgeDirection = Math.random() < 0.5 ? -1 : 1;
        const endY = clamp(startY + edgeDirection * randomBetween(70, 180), Math.min(minY, maxY), Math.max(minY, maxY));
        const edgeWalked = await animateTo(
          { x: sideX, y: endY },
          {
            runId,
            duration: 880 + Math.abs(endY - startY) * 3.2,
            animation: onLeft ? 'running-right' : 'running-left',
          },
        );
        if (!edgeWalked) return;

        const landingX = clamp(
          sideX + (onLeft ? -1 : 1) * randomBetween(42, 92),
          display.x + EDGE_MARGIN,
          display.x + display.width - size.width - EDGE_MARGIN,
        );
        await animateTo(
          { x: landingX, y: desktopY(stage, landingX, size) },
          {
            runId,
            duration: 820,
            animation: 'jumping',
            fall: true,
          },
        );
        setAnimation('waving');
        await pause(240, runId);
        return;
      }

      const minX = win.x + EDGE_MARGIN;
      const maxX = win.x + win.width - size.width - EDGE_MARGIN;
      const startX = randomBetween(minX, maxX);
      const topY = Math.max(display.y + EDGE_MARGIN, win.y - size.height + 6);
      const ok = await animateTo(
        { x: startX, y: topY },
        {
          runId,
          duration: 980,
          jumpHeight: randomBetween(68, 112),
          animation: 'jumping',
        },
      );
      if (!ok) return;

      const direction = Math.random() < 0.5 ? -1 : 1;
      const walkDistance = randomBetween(Math.min(90, win.width * 0.18), Math.min(260, win.width * 0.55));
      const endX = clamp(startX + direction * walkDistance, minX, maxX);
      const walked = await animateTo(
        { x: endX, y: topY },
        {
          runId,
          duration: 1_000 + Math.abs(endX - startX) * 3.5,
          animation: direction < 0 ? 'running-left' : 'running-right',
        },
      );
      if (!walked) return;

      if (Math.random() < 0.78) {
        const landingX = clamp(endX + randomBetween(-70, 70), display.x + EDGE_MARGIN, display.x + display.width - size.width - EDGE_MARGIN);
        await animateTo(
          { x: landingX, y: desktopY(stage, landingX, size) },
          {
            runId,
            duration: 880,
            animation: 'jumping',
            fall: true,
          },
        );
        setAnimation('waving');
        await pause(260, runId);
      }
    },
    [animateTo, doHop, pause],
  );

  const runAutonomousAction = useCallback(async () => {
    if (!isAutonomousAllowed()) return;

    const runId = motionRunIdRef.current + 1;
    motionRunIdRef.current = runId;
    isWanderingRef.current = true;
    clearTimeout(idleTimer.current);
    positionRef.current = { x: window.screenX, y: window.screenY };

    try {
      const stage = await readStage();
      if (runId !== motionRunIdRef.current || !isAutonomousAllowed()) return;

      const mode = petSettingsRef.current?.petPlayMode ?? 'playful';
      const weights = stage.windows.length > 0
        ? PLAY_MODE_WEIGHTS[mode]
        : PLAY_MODE_WEIGHTS[mode].map((choice) =>
            choice.action === 'windowTop'
              ? { ...choice, action: 'hop' as const }
              : choice,
          );
      const action = chooseWeighted(weights);

      if (action === 'stroll') await doStroll(stage, runId);
      if (action === 'hop') await doHop(stage, runId);
      if (action === 'stairs') await doStairs(stage, runId);
      if (action === 'portal') await doPortal(stage, runId);
      if (action === 'windowTop') await doWindowTopWalk(stage, runId);
    } finally {
      if (runId === motionRunIdRef.current) {
        isWanderingRef.current = false;
        setPortalPhase(null);
        restoreStatusAnimation();
        scheduleNextRef.current();
      }
    }
  }, [
    doHop,
    doPortal,
    doStairs,
    doStroll,
    doWindowTopWalk,
    isAutonomousAllowed,
    readStage,
    restoreStatusAnimation,
  ]);

  const scheduleNextAutonomous = useCallback(
    (delayOverride?: number) => {
      clearTimeout(wanderTimerRef.current);
      if (!isAutonomousAllowed()) return;

      const mode = petSettingsRef.current?.petPlayMode ?? 'playful';
      const interval = PLAY_MODE_INTERVALS[mode];
      const speed = clamp(petSettingsRef.current?.petSpeed ?? 2, 0.5, 5);
      const delay = delayOverride ?? randomBetween(interval.min, interval.max) / Math.sqrt(speed / 2);
      wanderTimerRef.current = setTimeout(() => {
        void runAutonomousAction();
      }, delay);
    },
    [isAutonomousAllowed, runAutonomousAction],
  );

  useEffect(() => {
    scheduleNextRef.current = scheduleNextAutonomous;
  }, [scheduleNextAutonomous]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api) return;
    return api.onSettingsChanged((settings) => {
      petSettingsRef.current = settings;
      setPetSettings(settings);
      if (!settings.enabled || !(settings.allowRandomMove ?? true)) {
        cancelAutonomousMotion();
      } else {
        scheduleNextRef.current(900);
      }
    });
  }, [cancelAutonomousMotion]);

  useEffect(() => {
    pendingPermissionRef.current = pendingPermission;
    if (pendingPermission) cancelAutonomousMotion();
  }, [cancelAutonomousMotion, pendingPermission]);

  useEffect(() => {
    draggingRef.current = dragging;
    if (dragging) cancelAutonomousMotion();
    if (!dragging && isAutonomousAllowed()) scheduleNextRef.current(900);
  }, [cancelAutonomousMotion, dragging, isAutonomousAllowed]);

  useEffect(() => {
    isPermissionStatusRef.current = isPermissionStatus;
    if (isPermissionStatus) cancelAutonomousMotion();
  }, [cancelAutonomousMotion, isPermissionStatus]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      clearTimeout(idleTimer.current);
      clearAutonomousTimers();
    };
  }, [clearAutonomousTimers, resetIdleTimer]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onAgentStatusUpdate) return;
    return api.onAgentStatusUpdate((status) => {
      agentStatusRef.current = status;
      setIsPermissionStatus(status === 'permission');
      if (status !== 'permission') {
        pendingPermissionRef.current = null;
        setPendingPermission(null);
      }

      if (status === 'idle') {
        restoreStatusAnimation();
        scheduleNextRef.current(900);
      } else {
        cancelAutonomousMotion();
        setAnimation(agentStatusToAnimation(status));
        clearTimeout(idleTimer.current);
      }
    });
  }, [cancelAutonomousMotion, restoreStatusAnimation]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onPermissionRequest) return;
    return api.onPermissionRequest((data) => {
      if (!data.toolName) {
        pendingPermissionRef.current = null;
        setPendingPermission(null);
        return;
      }
      pendingPermissionRef.current = data;
      setPendingPermission(data);
      cancelAutonomousMotion();
    });
  }, [cancelAutonomousMotion]);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      pointerDownPos.current = { x: e.screenX, y: e.screenY };
      didDragMove.current = false;
      dragOffset.current = { x: e.clientX, y: e.clientY };
      positionRef.current = { x: e.screenX - e.clientX, y: e.screenY - e.clientY };

      draggingRef.current = true;
      cancelAutonomousMotion();
      setDragging(true);
      setAnimation('idle');
      resetIdleTimer();
    },
    [cancelAutonomousMotion, resetIdleTimer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      if (pointerDownPos.current) {
        const dx = e.screenX - pointerDownPos.current.x;
        const dy = e.screenY - pointerDownPos.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragMove.current = true;
      }

      const newX = e.screenX - dragOffset.current.x;
      const newY = e.screenY - dragOffset.current.y;
      moveWindowTo({ x: newX, y: newY });

      if (e.movementX > 2) setAnimation('running-right');
      else if (e.movementX < -2) setAnimation('running-left');
      else if (e.movementY < -2) setAnimation('jumping');
    },
    [moveWindowTo],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      draggingRef.current = false;
      setDragging(false);

      if (pointerDownPos.current && !didDragMove.current) {
        const dx = e.screenX - pointerDownPos.current.x;
        const dy = e.screenY - pointerDownPos.current.y;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          window.forgepadPet?.focusAgent();
        }
      }
      pointerDownPos.current = null;

      restoreStatusAnimation();
      if (isAutonomousAllowed()) scheduleNextRef.current(900);
    },
    [isAutonomousAllowed, restoreStatusAnimation],
  );

  const showApproval = isPermissionStatus && pendingPermission !== null;
  const prevShowApproval = useRef(false);

  useEffect(() => {
    if (!petSettings) return;
    const api = window.forgepadPet;
    if (!api?.resizeWindow) return;

    const scale = petSettings.petSize;
    const spriteW = Math.round(BASE_SPRITE_WIDTH * scale);
    const spriteH = Math.round(BASE_SPRITE_HEIGHT * scale);

    if (showApproval && !prevShowApproval.current) {
      const isQuestion = pendingPermission?.questions && pendingPermission.questions.length > 0;
      const optionCount = isQuestion ? (pendingPermission.questions![0].options.length ?? 0) : 0;
      const hasDescription = isQuestion && pendingPermission.questions![0].options.some((o) => o.description);
      const optionItemH = hasDescription ? 48 : 34;
      const popupH = isQuestion ? 106 + optionCount * optionItemH : 120;
      const totalW = Math.max(spriteW, isQuestion ? 320 : 280);
      const totalH = spriteH + popupH;
      api.resizeWindow(totalW, totalH);
    } else if (!showApproval && prevShowApproval.current) {
      api.resizeWindow(spriteW, spriteH);
    }
    prevShowApproval.current = showApproval;
  }, [showApproval, petSettings, pendingPermission]);

  if (!petSettings?.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {portalPhase && (
        <style>
          {`
            @keyframes petPortalPulse {
              from { opacity: 0.45; transform: scale(0.74) rotate(0deg); }
              to { opacity: 0.95; transform: scale(1.08) rotate(16deg); }
            }
          `}
        </style>
      )}
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
          position: 'relative',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {portalPhase && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: `${Math.round(112 * petSettings.petSize)}px`,
                height: `${Math.round(112 * petSettings.petSize)}px`,
                borderRadius: '999px',
                border: '2px solid rgba(125, 211, 252, 0.95)',
                boxShadow:
                  portalPhase === 'enter'
                    ? '0 0 16px rgba(125, 211, 252, 0.9), inset 0 0 18px rgba(168, 85, 247, 0.45)'
                    : '0 0 18px rgba(250, 204, 21, 0.75), inset 0 0 16px rgba(125, 211, 252, 0.55)',
                animation: 'petPortalPulse 420ms ease-in-out infinite alternate',
              }}
            />
          </div>
        )}
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
