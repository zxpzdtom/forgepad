import { useCallback, useEffect, useRef, useState } from "react";
import { SpriteAnimator } from "codex-pets-react";
import type { AgentStatus, AgentStatusUpdate } from "@shared/agent-lifecycle";
import type {
  CompletionCard,
  PendingPermission,
  PetCommand,
  PetNudgeDirection,
  PetPlayAction,
  PetSettings,
  PetStageRect,
  PetStageSnapshot,
  PetStageWindow,
} from "@shared/types";
import {
  agentStatusToAnimation,
  forgePetAtlas,
  getPetSpritesheetUrl,
  type ForgePetAnimationName,
} from "./pet-registry";
import { PetApprovalPopup } from "./PetApprovalPopup";
import { PetCompletionCard, type WorkingAgentSummary } from "./PetCompletionCard";

const BASE_SPRITE_WIDTH = 192;
const BASE_SPRITE_HEIGHT = 208;
const EDGE_MARGIN = 8;

type MotionPoint = { x: number; y: number };
type MotionAction = PetPlayAction;
type PortalPhase = "enter" | "exit" | "close";
type PortalEffect = { phase: PortalPhase; seed: number } | null;
type PropEffect = { kind: "springPad" | "balloon" | "rocket" | "sparkTrail"; seed: number } | null;
type MotionLayout = {
  width: number;
  height: number;
  spriteOffsetX: number;
  spriteOffsetY: number;
};
type PetDebugAction = MotionAction | "random";
type AgentMessagePreview = { userPrompt?: string; aiResponse?: string };

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  idle: 0,
  working: 1,
  review: 2,
  permission: 3,
};

const DEBUG_ACTIONS: MotionAction[] = [
  "stroll",
  "hop",
  "stairs",
  "portal",
  "windowTop",
  "zigzag",
  "spring",
  "peek",
  "balloon",
  "rocket",
];

function highestAgentStatus(statuses: Record<string, AgentStatus>): AgentStatus {
  let highest: AgentStatus = "idle";
  for (const status of Object.values(statuses)) {
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[highest]) {
      highest = status;
    }
  }
  return highest;
}

const PLAY_MODE_INTERVALS: Record<PetSettings["petPlayMode"], { min: number; max: number }> = {
  cozy: { min: 8_000, max: 16_000 },
  playful: { min: 4_500, max: 10_000 },
  adventure: { min: 3_000, max: 7_000 },
};

const PLAY_MODE_WEIGHTS: Record<
  PetSettings["petPlayMode"],
  Array<{ action: MotionAction; weight: number }>
> = {
  cozy: [
    { action: "stroll", weight: 32 },
    { action: "hop", weight: 18 },
    { action: "stairs", weight: 12 },
    { action: "portal", weight: 7 },
    { action: "windowTop", weight: 7 },
    { action: "zigzag", weight: 8 },
    { action: "spring", weight: 10 },
    { action: "peek", weight: 6 },
    { action: "balloon", weight: 5 },
    { action: "rocket", weight: 2 },
  ],
  playful: [
    { action: "stroll", weight: 16 },
    { action: "hop", weight: 17 },
    { action: "stairs", weight: 15 },
    { action: "portal", weight: 14 },
    { action: "windowTop", weight: 16 },
    { action: "zigzag", weight: 9 },
    { action: "spring", weight: 8 },
    { action: "peek", weight: 5 },
    { action: "balloon", weight: 7 },
    { action: "rocket", weight: 4 },
  ],
  adventure: [
    { action: "stroll", weight: 8 },
    { action: "hop", weight: 14 },
    { action: "stairs", weight: 16 },
    { action: "portal", weight: 18 },
    { action: "windowTop", weight: 18 },
    { action: "zigzag", weight: 10 },
    { action: "spring", weight: 8 },
    { action: "peek", weight: 8 },
    { action: "balloon", weight: 7 },
    { action: "rocket", weight: 6 },
  ],
};

const PORTAL_DOOR_CSS = `
@keyframes petDoorStageIn {
  from { opacity: 0; transform: scale(0.74) translateY(8px); filter: blur(2px); }
  to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
}
@keyframes petDoorStageOut {
  from { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
  to { opacity: 0; transform: scale(0.82) translateY(-8px); filter: blur(2px); }
}
@keyframes petDoorOpen {
  0% { transform: rotateY(0deg); }
  34% { transform: rotateY(-74deg); }
  100% { transform: rotateY(-82deg); }
}
@keyframes petDoorClose {
  0% { transform: rotateY(-82deg); }
  58% { transform: rotateY(-14deg); }
  100% { transform: rotateY(0deg); }
}
@keyframes petDoorSpaceFlow {
  from { transform: translate3d(-18%, -12%, 0) rotate(0deg) scale(1); }
  to { transform: translate3d(6%, 8%, 0) rotate(16deg) scale(1.18); }
}
@keyframes petDoorSpark {
  0%, 100% { opacity: 0.22; transform: translateY(5px) scale(0.8); }
  42% { opacity: 0.9; transform: translateY(-8px) scale(1.08); }
}
.pet-portal-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  z-index: 2;
}
.pet-portal-stage.enter {
  animation: petDoorStageIn 260ms ease-out both;
}
.pet-portal-stage.exit {
  animation: petDoorStageIn 220ms ease-out both;
}
.pet-portal-stage.close {
  animation: petDoorStageOut 260ms ease-in both;
}
.pet-door {
  position: relative;
  transform-style: preserve-3d;
  perspective: 360px;
  translate: 0 5%;
}
.pet-door__aura {
  position: absolute;
  inset: 7% -16% -8%;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 46%, rgba(125, 211, 252, 0.68), transparent 48%),
    radial-gradient(circle at 48% 54%, rgba(251, 113, 133, 0.46), transparent 62%);
  filter: blur(8px);
  opacity: 0.9;
}
.pet-door__space {
  position: absolute;
  inset: 8% 10% 10%;
  overflow: hidden;
  border-radius: 7px 7px 5px 5px;
  background:
    radial-gradient(circle at 30% 28%, rgba(254, 240, 138, 0.88), transparent 12%),
    radial-gradient(circle at 72% 58%, rgba(192, 132, 252, 0.82), transparent 15%),
    linear-gradient(135deg, rgba(14, 165, 233, 0.95), rgba(99, 102, 241, 0.72) 50%, rgba(244, 114, 182, 0.9));
  box-shadow: inset 0 0 18px rgba(15, 23, 42, 0.42);
}
.pet-door__space::before {
  position: absolute;
  inset: -24%;
  content: "";
  background:
    repeating-conic-gradient(from 18deg, rgba(255,255,255,0.38) 0 8deg, transparent 8deg 20deg),
    radial-gradient(circle, rgba(255,255,255,0.34), transparent 56%);
  mix-blend-mode: screen;
  animation: petDoorSpaceFlow 720ms ease-in-out infinite alternate;
}
.pet-door__frame {
  position: absolute;
  inset: 0;
  border: 4px solid rgba(244, 114, 182, 0.96);
  border-bottom-width: 6px;
  border-radius: 9px 9px 6px 6px;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.72),
    0 8px 16px rgba(15, 23, 42, 0.24),
    0 0 18px rgba(244, 114, 182, 0.54);
}
.pet-door__panel {
  position: absolute;
  inset: 9% 12% 11% 12%;
  transform-origin: left center;
  border-radius: 7px 6px 5px 7px;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.34), transparent 20%),
    linear-gradient(145deg, #ff8ab3, #fb7185 56%, #f43f5e);
  border: 2px solid rgba(190, 24, 93, 0.46);
  box-shadow: 8px 0 10px rgba(15, 23, 42, 0.2);
  animation: petDoorOpen 520ms cubic-bezier(.2,.82,.18,1) both;
}
.pet-portal-stage.close .pet-door__panel {
  animation: petDoorClose 260ms cubic-bezier(.2,.82,.18,1) both;
}
.pet-door__panel::after {
  position: absolute;
  top: 49%;
  right: 14%;
  width: 9%;
  aspect-ratio: 1;
  content: "";
  border-radius: 999px;
  background: radial-gradient(circle at 35% 35%, #fff7ad, #facc15 58%, #b45309);
  box-shadow: 0 0 6px rgba(250, 204, 21, 0.9);
}
.pet-door__spark {
  position: absolute;
  width: 8%;
  aspect-ratio: 1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.95);
  animation: petDoorSpark 780ms ease-in-out infinite;
}
.pet-door__spark.one { left: -8%; top: 18%; }
.pet-door__spark.two { right: -11%; top: 38%; animation-delay: 160ms; }
.pet-door__spark.three { left: 14%; bottom: -6%; animation-delay: 320ms; }
`;

const PROP_EFFECT_CSS = `
@keyframes petPadSquash {
  0%, 100% { transform: translateX(-50%) scaleX(1) scaleY(1); }
  45% { transform: translateX(-50%) scaleX(1.18) scaleY(0.72); }
}
@keyframes petBalloonBob {
  0%, 100% { transform: translate(-50%, 0) rotate(-3deg); }
  50% { transform: translate(-50%, -8px) rotate(4deg); }
}
@keyframes petRocketFlame {
  0%, 100% { transform: scaleY(0.72); opacity: 0.72; }
  45% { transform: scaleY(1.2); opacity: 1; }
}
@keyframes petSparkTwinkle {
  0%, 100% { opacity: 0.18; transform: scale(0.55) rotate(0deg); }
  48% { opacity: 0.95; transform: scale(1.1) rotate(36deg); }
}
.pet-prop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.pet-prop__spring {
  position: absolute;
  left: 50%;
  bottom: -6%;
  width: 48%;
  height: 18%;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.65), transparent 38%),
    repeating-linear-gradient(90deg, #38bdf8 0 12%, #facc15 12% 24%);
  border: 2px solid rgba(15, 23, 42, 0.28);
  box-shadow: 0 5px 10px rgba(15, 23, 42, 0.26);
  animation: petPadSquash 420ms ease-in-out infinite;
}
.pet-prop__spring::before {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 64%;
  height: 58%;
  content: "";
  border: 3px solid rgba(56, 189, 248, 0.95);
  border-top: 0;
  border-radius: 0 0 999px 999px;
  box-shadow: 0 8px 0 rgba(56, 189, 248, 0.62), 0 16px 0 rgba(56, 189, 248, 0.38);
}
.pet-prop__balloon {
  position: absolute;
  left: 50%;
  top: -44%;
  width: 38%;
  aspect-ratio: 0.82;
  border-radius: 58% 58% 52% 52%;
  background:
    radial-gradient(circle at 34% 25%, rgba(255,255,255,0.92), transparent 14%),
    linear-gradient(145deg, #f472b6, #fb7185 52%, #e11d48);
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.22), 0 0 18px rgba(244, 114, 182, 0.38);
  animation: petBalloonBob 920ms ease-in-out infinite;
}
.pet-prop__balloon::before {
  position: absolute;
  left: 50%;
  top: 95%;
  width: 2px;
  height: 80%;
  content: "";
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(148, 163, 184, 0.4));
  transform: translateX(-50%);
}
.pet-prop__rocket {
  position: absolute;
  right: 58%;
  bottom: 32%;
  width: 25%;
  height: 34%;
  transform: rotate(-32deg);
  border-radius: 999px 999px 42% 42%;
  background:
    radial-gradient(circle at 50% 28%, #bae6fd 0 16%, transparent 17%),
    linear-gradient(135deg, #e5e7eb, #94a3b8 50%, #475569);
  border: 2px solid rgba(15, 23, 42, 0.22);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.24);
}
.pet-prop__rocket::before {
  position: absolute;
  left: 50%;
  bottom: -39%;
  width: 42%;
  height: 46%;
  content: "";
  transform: translateX(-50%);
  transform-origin: top center;
  border-radius: 0 0 999px 999px;
  background: linear-gradient(180deg, #fde68a, #fb923c 48%, rgba(239, 68, 68, 0));
  filter: blur(0.5px);
  animation: petRocketFlame 120ms ease-in-out infinite;
}
.pet-prop__spark {
  position: absolute;
  width: 9%;
  aspect-ratio: 1;
  clip-path: polygon(50% 0, 61% 34%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 34%);
  background: #fde68a;
  filter: drop-shadow(0 0 5px rgba(250, 204, 21, 0.9));
  animation: petSparkTwinkle 560ms ease-in-out infinite;
}
.pet-prop__spark.one { left: 3%; top: 30%; }
.pet-prop__spark.two { left: 15%; bottom: 18%; animation-delay: 120ms; }
.pet-prop__spark.three { right: 10%; top: 18%; animation-delay: 240ms; }
.pet-prop__spark.four { right: 3%; bottom: 36%; animation-delay: 360ms; }
`;

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

function choosePlayModeAction(
  stage: PetStageSnapshot,
  mode: PetSettings["petPlayMode"],
): MotionAction {
  const weights =
    stage.windows.length > 0
      ? PLAY_MODE_WEIGHTS[mode]
      : PLAY_MODE_WEIGHTS[mode].map((choice) =>
          choice.action === "windowTop" || choice.action === "peek"
            ? { ...choice, action: "spring" as const }
            : choice,
        );
  return chooseWeighted(weights);
}

function animationForDelta(dx: number): ForgePetAnimationName {
  if (Math.abs(dx) < 10) return "jumping";
  return dx < 0 ? "running-left" : "running-right";
}

function spriteSize(settings: PetSettings | null): { width: number; height: number } {
  const scale = settings?.petSize ?? 0.8;
  return {
    width: Math.round(BASE_SPRITE_WIDTH * scale),
    height: Math.round(BASE_SPRITE_HEIGHT * scale),
  };
}

function normalMotionLayout(settings: PetSettings | null): MotionLayout {
  const size = spriteSize(settings);
  return {
    width: size.width,
    height: size.height,
    spriteOffsetX: 0,
    spriteOffsetY: 0,
  };
}

function paddedMotionLayout(
  settings: PetSettings | null,
  padding: { left: number; top: number; right: number; bottom: number },
): MotionLayout {
  const size = spriteSize(settings);
  const scale = settings?.petSize ?? 0.8;
  const left = Math.round(padding.left * scale);
  const top = Math.round(padding.top * scale);
  const right = Math.round(padding.right * scale);
  const bottom = Math.round(padding.bottom * scale);
  return {
    width: size.width + left + right,
    height: size.height + top + bottom,
    spriteOffsetX: left,
    spriteOffsetY: top,
  };
}

function propMotionLayout(
  settings: PetSettings | null,
  kind: "portal" | "spring" | "balloon" | "rocket" | "spark",
): MotionLayout {
  if (kind === "portal")
    return paddedMotionLayout(settings, { left: 38, top: 68, right: 38, bottom: 24 });
  if (kind === "spring")
    return paddedMotionLayout(settings, { left: 42, top: 58, right: 42, bottom: 36 });
  if (kind === "balloon")
    return paddedMotionLayout(settings, { left: 58, top: 150, right: 58, bottom: 36 });
  if (kind === "rocket")
    return paddedMotionLayout(settings, { left: 92, top: 78, right: 54, bottom: 48 });
  return paddedMotionLayout(settings, { left: 42, top: 48, right: 42, bottom: 30 });
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

function clampToStage(
  stage: PetStageSnapshot,
  point: MotionPoint,
  size: { width: number; height: number },
): MotionPoint {
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

function pickWindow(
  stage: PetStageSnapshot,
  size: { width: number; height: number },
): PetStageWindow | null {
  const usable = stage.windows.filter(
    (win) => win.width > size.width + 80 && win.height > size.height * 0.7,
  );
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

function randomDesktopPoint(
  stage: PetStageSnapshot,
  size: { width: number; height: number },
): MotionPoint {
  const area = nearestDisplay(stage, { x: window.screenX, y: window.screenY });
  return {
    x: randomBetween(area.x + EDGE_MARGIN, area.x + area.width - size.width - EDGE_MARGIN),
    y: randomBetween(area.y + 48, area.y + area.height - size.height - EDGE_MARGIN),
  };
}

function PortalDoorEffect({ effect, scale }: { effect: NonNullable<PortalEffect>; scale: number }) {
  const doorWidth = Math.round(154 * scale);
  const doorHeight = Math.round(214 * scale);
  const hue = Math.round(effect.seed * 18);

  return (
    <div className={`pet-portal-stage ${effect.phase}`} aria-hidden>
      <div
        className="pet-door"
        style={{
          width: `${doorWidth}px`,
          height: `${doorHeight}px`,
          filter: `hue-rotate(${hue}deg)`,
        }}
      >
        <div className="pet-door__aura" />
        <div className="pet-door__space" />
        <div className="pet-door__frame" />
        <div className="pet-door__panel" />
        <div className="pet-door__spark one" />
        <div className="pet-door__spark two" />
        <div className="pet-door__spark three" />
      </div>
    </div>
  );
}

function PropEffectView({ effect }: { effect: NonNullable<PropEffect> }) {
  return (
    <div className="pet-prop" aria-hidden>
      {effect.kind === "springPad" && <div className="pet-prop__spring" />}
      {effect.kind === "balloon" && <div className="pet-prop__balloon" />}
      {effect.kind === "rocket" && <div className="pet-prop__rocket" />}
      {(effect.kind === "sparkTrail" || effect.kind === "rocket") && (
        <>
          <div className="pet-prop__spark one" />
          <div className="pet-prop__spark two" />
          <div className="pet-prop__spark three" />
          <div className="pet-prop__spark four" />
        </>
      )}
    </div>
  );
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
  const [animation, setAnimation] = useState<ForgePetAnimationName>("idle");
  const [dragging, setDragging] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [isPermissionStatus, setIsPermissionStatus] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [agentMessages, setAgentMessages] = useState<Record<string, AgentMessagePreview>>({});
  const [completionCards, setCompletionCards] = useState<CompletionCard[]>([]);
  const [completionHovered, setCompletionHovered] = useState(false);
  const [portalEffect, setPortalEffect] = useState<PortalEffect>(null);
  const [propEffect, setPropEffect] = useState<PropEffect>(null);
  const [petHidden, setPetHidden] = useState(false);
  const [motionLayout, setMotionLayout] = useState<MotionLayout>(() => normalMotionLayout(null));

  const dragOffset = useRef({ x: 0, y: 0 });
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDragMove = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const wheelCooldownRef = useRef(0);
  const frameRef = useRef<number>();
  const scheduleNextRef = useRef<(delayOverride?: number) => void>(() => {});

  const agentStatusRef = useRef<AgentStatus>("idle");
  const isPermissionStatusRef = useRef(false);
  const isWanderingRef = useRef(false);
  const draggingRef = useRef(false);
  const petSettingsRef = useRef<PetSettings | null>(null);
  const pendingPermissionRef = useRef<PendingPermission | null>(null);
  const agentStatusesRef = useRef<Record<string, AgentStatus>>({});
  const agentMessagesRef = useRef<Record<string, AgentMessagePreview>>({});
  const stageRef = useRef<PetStageSnapshot | null>(null);
  const motionLayoutRef = useRef<MotionLayout>(normalMotionLayout(null));
  const motionRunIdRef = useRef(0);
  const positionRef = useRef<MotionPoint>({ x: window.screenX, y: window.screenY });

  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (agentStatusRef.current === "idle" && !isWanderingRef.current && !draggingRef.current) {
        setAnimation("waiting");
      }
    }, 8000);
  }, []);

  const isMotionAllowed = useCallback(() => {
    const settings = petSettingsRef.current;
    return Boolean(
      settings?.enabled &&
        agentStatusRef.current === "idle" &&
        !isPermissionStatusRef.current &&
        !pendingPermissionRef.current &&
        !draggingRef.current,
    );
  }, []);

  const isAutonomousAllowed = useCallback(() => {
    const settings = petSettingsRef.current;
    return Boolean(isMotionAllowed() && (settings?.allowRandomMove ?? true));
  }, [isMotionAllowed]);

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
    if (agentStatusRef.current === "idle") {
      resetIdleTimer();
    }
  }, [resetIdleTimer]);

  const applyMotionLayout = useCallback((layout: MotionLayout) => {
    motionLayoutRef.current = layout;
    setMotionLayout(layout);
    window.forgepadPet?.resizeWindow(Math.round(layout.width), Math.round(layout.height));
    window.forgepadPet?.moveWindow(
      Math.round(positionRef.current.x - layout.spriteOffsetX),
      Math.round(positionRef.current.y - layout.spriteOffsetY),
    );
  }, []);

  const resetMotionLayout = useCallback(() => {
    applyMotionLayout(normalMotionLayout(petSettingsRef.current));
  }, [applyMotionLayout]);

  const cancelAutonomousMotion = useCallback(() => {
    motionRunIdRef.current += 1;
    isWanderingRef.current = false;
    setPortalEffect(null);
    setPropEffect(null);
    setPetHidden(false);
    clearAutonomousTimers();
    resetMotionLayout();
    restoreStatusAnimation();
  }, [clearAutonomousTimers, resetMotionLayout, restoreStatusAnimation]);

  const applyAgentStatusUpdate = useCallback(
    (update: AgentStatusUpdate) => {
      const currentStatus = agentStatusesRef.current[update.ptyId];
      const effectiveStatus =
        currentStatus === "permission" && (update.status === "working" || update.status === "idle")
          ? currentStatus
          : update.status;
      const nextStatuses = {
        ...agentStatusesRef.current,
        [update.ptyId]: effectiveStatus,
      };
      agentStatusesRef.current = nextStatuses;
      setAgentStatuses(nextStatuses);

      const primaryStatus = highestAgentStatus(nextStatuses);
      agentStatusRef.current = primaryStatus;
      setIsPermissionStatus(primaryStatus === "permission");

      if (primaryStatus === "idle") {
        restoreStatusAnimation();
        scheduleNextRef.current(900);
      } else {
        cancelAutonomousMotion();
        setAnimation(agentStatusToAnimation(primaryStatus));
        clearTimeout(idleTimer.current);
      }
    },
    [cancelAutonomousMotion, restoreStatusAnimation],
  );

  const moveWindowTo = useCallback((point: MotionPoint) => {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const layout = motionLayoutRef.current;
    positionRef.current = { x, y };
    window.forgepadPet?.moveWindow(
      Math.round(x - layout.spriteOffsetX),
      Math.round(y - layout.spriteOffsetY),
    );
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
          resolve(runId === motionRunIdRef.current && isMotionAllowed());
        }, scaledDuration(ms));
      }),
    [isMotionAllowed, scaledDuration],
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
          if (options.runId !== motionRunIdRef.current || !isMotionAllowed()) {
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
    [isMotionAllowed, moveWindowTo, scaledDuration],
  );

  const doStroll = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const direction = Math.random() < 0.5 ? -1 : 1;
      const distance = randomBetween(45, 130);
      const target = clampToStage(
        stage,
        {
          x: positionRef.current.x + direction * distance,
          y: positionRef.current.y + randomBetween(-22, 18),
        },
        size,
      );
      await animateTo(target, {
        runId,
        duration: 850 + distance * 4,
        animation: direction < 0 ? "running-left" : "running-right",
      });
    },
    [animateTo],
  );

  const doHop = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const target = clampToStage(
        stage,
        {
          x: positionRef.current.x + randomBetween(-190, 190),
          y: positionRef.current.y + randomBetween(-90, 80),
        },
        size,
      );
      await animateTo(target, {
        runId,
        duration: 760,
        jumpHeight: randomBetween(52, 104),
        animation: "jumping",
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
        if (!isMotionAllowed()) return;
        const size = spriteSize(petSettingsRef.current);
        const target = clampToStage(
          stage,
          {
            x: positionRef.current.x + direction * randomBetween(22, 36),
            y: positionRef.current.y + (climbing ? -randomBetween(10, 16) : randomBetween(10, 15)),
          },
          size,
        );
        const ok = await animateTo(target, {
          runId,
          duration: 210,
          jumpHeight: 16,
          animation: "jumping",
        });
        if (!ok) return;
      }
      await pause(220, runId);
    },
    [animateTo, isMotionAllowed, pause],
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

      applyMotionLayout(propMotionLayout(petSettingsRef.current, "portal"));
      setAnimation("waving");
      const enterSeed = Math.random();
      const exitSeed = Math.random();
      setPortalEffect({ phase: "enter", seed: enterSeed });
      if (!(await pause(500, runId))) return;
      setPetHidden(true);
      if (!(await pause(90, runId))) return;
      moveWindowTo(clampToStage(stage, target, size));
      setPortalEffect({ phase: "exit", seed: exitSeed });
      setAnimation("jumping");
      if (!(await pause(180, runId))) return;
      setPetHidden(false);
      if (!(await pause(420, runId))) return;
      setPortalEffect({ phase: "close", seed: exitSeed });
      await pause(280, runId);
      setPortalEffect(null);
    },
    [applyMotionLayout, moveWindowTo, pause],
  );

  const doZigzag = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      applyMotionLayout(propMotionLayout(petSettingsRef.current, "spark"));
      setPropEffect({ kind: "sparkTrail", seed: Math.random() });
      let direction = Math.random() < 0.5 ? -1 : 1;
      const steps = randomInt(3, 5);
      for (let i = 0; i < steps; i += 1) {
        if (!isMotionAllowed()) return;
        const size = spriteSize(petSettingsRef.current);
        const target = clampToStage(
          stage,
          {
            x: positionRef.current.x + direction * randomBetween(44, 86),
            y: positionRef.current.y + (i % 2 === 0 ? -1 : 1) * randomBetween(18, 42),
          },
          size,
        );
        const ok = await animateTo(target, {
          runId,
          duration: 230,
          jumpHeight: 10,
          animation: direction < 0 ? "running-left" : "running-right",
        });
        if (!ok) return;
        direction *= -1;
      }
      await pause(160, runId);
      setPropEffect(null);
    },
    [animateTo, applyMotionLayout, isMotionAllowed, pause],
  );

  const doSpring = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      applyMotionLayout(propMotionLayout(petSettingsRef.current, "spring"));
      setPropEffect({ kind: "springPad", seed: Math.random() });
      const size = spriteSize(petSettingsRef.current);
      const direction = Math.random() < 0.5 ? -1 : 1;
      const crouch = clampToStage(
        stage,
        {
          x: positionRef.current.x,
          y: positionRef.current.y + 12,
        },
        size,
      );
      setAnimation("waving");
      if (!(await pause(160, runId))) return;
      if (!(await animateTo(crouch, { runId, duration: 140, animation: "waving" }))) return;
      const rebound = clampToStage(
        stage,
        {
          x: positionRef.current.x - direction * randomBetween(18, 32),
          y: positionRef.current.y - randomBetween(8, 18),
        },
        size,
      );
      if (
        !(await animateTo(rebound, { runId, duration: 180, jumpHeight: 26, animation: "jumping" }))
      )
        return;
      const target = clampToStage(
        stage,
        {
          x: positionRef.current.x + direction * randomBetween(135, 260),
          y: positionRef.current.y + randomBetween(-110, 70),
        },
        size,
      );
      await animateTo(target, {
        runId,
        duration: 820,
        jumpHeight: randomBetween(112, 168),
        animation: "jumping",
      });
      setPropEffect(null);
    },
    [animateTo, applyMotionLayout, pause],
  );

  const doPeek = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      const size = spriteSize(petSettingsRef.current);
      const win = pickWindow(stage, size);
      if (!win) {
        await doSpring(stage, runId);
        return;
      }

      const display = nearestDisplay(stage, win);
      const fromLeft = Math.random() < 0.5;
      const topPeek = Math.random() < 0.62;
      const target = topPeek
        ? {
            x: clamp(
              (fromLeft ? win.x + 18 : win.x + win.width - size.width - 18) +
                randomBetween(-18, 18),
              win.x + EDGE_MARGIN,
              win.x + win.width - size.width - EDGE_MARGIN,
            ),
            y: Math.max(display.y + EDGE_MARGIN, win.y - size.height + 6),
          }
        : {
            x: fromLeft
              ? Math.max(display.x + EDGE_MARGIN, win.x - size.width + 8)
              : Math.min(
                  display.x + display.width - size.width - EDGE_MARGIN,
                  win.x + win.width - 8,
                ),
            y: clamp(
              win.y + randomBetween(42, Math.max(58, win.height - size.height * 0.5)),
              display.y + EDGE_MARGIN,
              display.y + display.height - size.height - EDGE_MARGIN,
            ),
          };

      if (
        !(await animateTo(target, {
          runId,
          duration: 880,
          jumpHeight: topPeek ? randomBetween(68, 104) : randomBetween(42, 76),
          animation: "jumping",
        }))
      ) {
        return;
      }

      setAnimation("waving");
      if (!(await pause(520, runId))) return;

      const nudge = topPeek
        ? { x: target.x + (fromLeft ? 1 : -1) * randomBetween(22, 42), y: target.y }
        : { x: target.x, y: target.y + randomBetween(-36, 36) };
      if (
        !(await animateTo(nudge, {
          runId,
          duration: 260,
          animation: fromLeft ? "running-right" : "running-left",
        }))
      ) {
        return;
      }

      const landingX = clamp(
        nudge.x + (fromLeft ? -1 : 1) * randomBetween(52, 106),
        display.x + EDGE_MARGIN,
        display.x + display.width - size.width - EDGE_MARGIN,
      );
      await animateTo(
        { x: landingX, y: desktopY(stage, landingX, size) },
        {
          runId,
          duration: 780,
          animation: "jumping",
          fall: true,
        },
      );
    },
    [animateTo, doSpring, pause],
  );

  const doBalloon = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      applyMotionLayout(propMotionLayout(petSettingsRef.current, "balloon"));
      setPropEffect({ kind: "balloon", seed: Math.random() });
      setAnimation("waving");
      if (!(await pause(360, runId))) return;

      const size = spriteSize(petSettingsRef.current);
      const drift = Math.random() < 0.5 ? -1 : 1;
      const lift = clampToStage(
        stage,
        {
          x: positionRef.current.x + drift * randomBetween(36, 82),
          y: positionRef.current.y - randomBetween(110, 180),
        },
        size,
      );
      if (
        !(await animateTo(lift, {
          runId,
          duration: 1_120,
          jumpHeight: 18,
          animation: "jumping",
        }))
      ) {
        return;
      }

      const glide = clampToStage(
        stage,
        {
          x: positionRef.current.x + drift * randomBetween(96, 180),
          y: positionRef.current.y + randomBetween(-20, 42),
        },
        size,
      );
      if (
        !(await animateTo(glide, {
          runId,
          duration: 1_060,
          animation: drift < 0 ? "running-left" : "running-right",
        }))
      ) {
        return;
      }

      setPropEffect(null);
      const landingX = clamp(
        glide.x + drift * randomBetween(20, 64),
        nearestDisplay(stage, glide).x + EDGE_MARGIN,
        nearestDisplay(stage, glide).x +
          nearestDisplay(stage, glide).width -
          size.width -
          EDGE_MARGIN,
      );
      await animateTo(
        { x: landingX, y: desktopY(stage, landingX, size) },
        {
          runId,
          duration: 740,
          animation: "jumping",
          fall: true,
        },
      );
    },
    [animateTo, applyMotionLayout, pause],
  );

  const doRocket = useCallback(
    async (stage: PetStageSnapshot, runId: number) => {
      applyMotionLayout(propMotionLayout(petSettingsRef.current, "rocket"));
      setPropEffect({ kind: "rocket", seed: Math.random() });
      setAnimation("running-right");
      if (!(await pause(220, runId))) return;

      const size = spriteSize(petSettingsRef.current);
      const direction = Math.random() < 0.5 ? -1 : 1;
      const launch = clampToStage(
        stage,
        {
          x: positionRef.current.x + direction * randomBetween(210, 360),
          y: positionRef.current.y - randomBetween(80, 150),
        },
        size,
      );
      if (
        !(await animateTo(launch, {
          runId,
          duration: 520,
          jumpHeight: randomBetween(44, 82),
          animation: direction < 0 ? "running-left" : "running-right",
        }))
      ) {
        return;
      }

      const landingX = clamp(
        positionRef.current.x + direction * randomBetween(42, 92),
        nearestDisplay(stage, positionRef.current).x + EDGE_MARGIN,
        nearestDisplay(stage, positionRef.current).x +
          nearestDisplay(stage, positionRef.current).width -
          size.width -
          EDGE_MARGIN,
      );
      setPropEffect({ kind: "sparkTrail", seed: Math.random() });
      await animateTo(
        { x: landingX, y: desktopY(stage, landingX, size) },
        {
          runId,
          duration: 760,
          animation: "jumping",
          fall: true,
        },
      );
      setPropEffect(null);
    },
    [animateTo, applyMotionLayout, pause],
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
        const minY = clamp(
          win.y + 24,
          display.y + EDGE_MARGIN,
          display.y + display.height - size.height - EDGE_MARGIN,
        );
        const maxY = clamp(
          win.y + win.height - size.height - 24,
          display.y + EDGE_MARGIN,
          display.y + display.height - size.height - EDGE_MARGIN,
        );
        const startY = randomBetween(Math.min(minY, maxY), Math.max(minY, maxY));
        const entered = await animateTo(
          { x: sideX, y: startY },
          {
            runId,
            duration: 940,
            jumpHeight: randomBetween(54, 96),
            animation: "jumping",
          },
        );
        if (!entered) return;

        const edgeDirection = Math.random() < 0.5 ? -1 : 1;
        const endY = clamp(
          startY + edgeDirection * randomBetween(70, 180),
          Math.min(minY, maxY),
          Math.max(minY, maxY),
        );
        const edgeWalked = await animateTo(
          { x: sideX, y: endY },
          {
            runId,
            duration: 880 + Math.abs(endY - startY) * 3.2,
            animation: onLeft ? "running-right" : "running-left",
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
            animation: "jumping",
            fall: true,
          },
        );
        setAnimation("waving");
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
          animation: "jumping",
        },
      );
      if (!ok) return;

      const direction = Math.random() < 0.5 ? -1 : 1;
      const walkDistance = randomBetween(
        Math.min(90, win.width * 0.18),
        Math.min(260, win.width * 0.55),
      );
      const endX = clamp(startX + direction * walkDistance, minX, maxX);
      const walked = await animateTo(
        { x: endX, y: topY },
        {
          runId,
          duration: 1_000 + Math.abs(endX - startX) * 3.5,
          animation: direction < 0 ? "running-left" : "running-right",
        },
      );
      if (!walked) return;

      const nextWindow = stage.windows
        .filter((candidate) => candidate.id !== win.id && candidate.width > size.width + 80)
        .sort(() => Math.random() - 0.5)[0];
      if (nextWindow && Math.random() < 0.34) {
        const nextDisplay = nearestDisplay(stage, nextWindow);
        const nextX = randomBetween(
          nextWindow.x + EDGE_MARGIN,
          nextWindow.x + nextWindow.width - size.width - EDGE_MARGIN,
        );
        const nextY = Math.max(nextDisplay.y + EDGE_MARGIN, nextWindow.y - size.height + 6);
        const landed = await animateTo(
          { x: nextX, y: nextY },
          {
            runId,
            duration: 1_040,
            jumpHeight: randomBetween(98, 152),
            animation: "jumping",
          },
        );
        if (!landed) return;
        setAnimation("waving");
        await pause(360, runId);
      }

      if (Math.random() < 0.78) {
        const landingDisplay = nearestDisplay(stage, positionRef.current);
        const landingX = clamp(
          positionRef.current.x + randomBetween(-70, 70),
          landingDisplay.x + EDGE_MARGIN,
          landingDisplay.x + landingDisplay.width - size.width - EDGE_MARGIN,
        );
        await animateTo(
          { x: landingX, y: desktopY(stage, landingX, size) },
          {
            runId,
            duration: 880,
            animation: "jumping",
            fall: true,
          },
        );
        setAnimation("waving");
        await pause(260, runId);
      }
    },
    [animateTo, doHop, pause],
  );

  const playMotionAction = useCallback(
    async (action: MotionAction, stage: PetStageSnapshot, runId: number) => {
      if (action === "stroll") await doStroll(stage, runId);
      if (action === "hop") await doHop(stage, runId);
      if (action === "stairs") await doStairs(stage, runId);
      if (action === "portal") await doPortal(stage, runId);
      if (action === "windowTop") await doWindowTopWalk(stage, runId);
      if (action === "zigzag") await doZigzag(stage, runId);
      if (action === "spring") await doSpring(stage, runId);
      if (action === "peek") await doPeek(stage, runId);
      if (action === "balloon") await doBalloon(stage, runId);
      if (action === "rocket") await doRocket(stage, runId);
    },
    [
      doHop,
      doPortal,
      doStairs,
      doStroll,
      doWindowTopWalk,
      doBalloon,
      doPeek,
      doRocket,
      doSpring,
      doZigzag,
    ],
  );

  const runAutonomousAction = useCallback(async () => {
    if (!isAutonomousAllowed()) return;

    const runId = motionRunIdRef.current + 1;
    motionRunIdRef.current = runId;
    isWanderingRef.current = true;
    clearTimeout(idleTimer.current);
    positionRef.current = {
      x: window.screenX + motionLayoutRef.current.spriteOffsetX,
      y: window.screenY + motionLayoutRef.current.spriteOffsetY,
    };

    try {
      const stage = await readStage();
      if (runId !== motionRunIdRef.current || !isAutonomousAllowed()) return;

      const mode = petSettingsRef.current?.petPlayMode ?? "playful";
      await playMotionAction(choosePlayModeAction(stage, mode), stage, runId);
    } finally {
      if (runId === motionRunIdRef.current) {
        isWanderingRef.current = false;
        setPortalEffect(null);
        setPropEffect(null);
        setPetHidden(false);
        resetMotionLayout();
        restoreStatusAnimation();
        scheduleNextRef.current();
      }
    }
  }, [isAutonomousAllowed, playMotionAction, readStage, resetMotionLayout, restoreStatusAnimation]);

  const scheduleNextAutonomous = useCallback(
    (delayOverride?: number) => {
      clearTimeout(wanderTimerRef.current);
      if (!isAutonomousAllowed()) return;

      const mode = petSettingsRef.current?.petPlayMode ?? "playful";
      const interval = PLAY_MODE_INTERVALS[mode];
      const speed = clamp(petSettingsRef.current?.petSpeed ?? 2, 0.5, 5);
      const delay =
        delayOverride ?? randomBetween(interval.min, interval.max) / Math.sqrt(speed / 2);
      wanderTimerRef.current = setTimeout(() => {
        void runAutonomousAction();
      }, delay);
    },
    [isAutonomousAllowed, runAutonomousAction],
  );

  const canPlayInteractiveAction = useCallback(() => {
    return isMotionAllowed();
  }, [isMotionAllowed]);

  const playInteractiveAction = useCallback(
    async (requestedAction: PetDebugAction = "random") => {
      if (!canPlayInteractiveAction()) return;

      const runId = motionRunIdRef.current + 1;
      motionRunIdRef.current = runId;
      clearAutonomousTimers();
      clearTimeout(idleTimer.current);
      isWanderingRef.current = true;
      positionRef.current = {
        x: window.screenX + motionLayoutRef.current.spriteOffsetX,
        y: window.screenY + motionLayoutRef.current.spriteOffsetY,
      };

      try {
        const stage = await readStage();
        if (runId !== motionRunIdRef.current || !canPlayInteractiveAction()) return;

        const mode = petSettingsRef.current?.petPlayMode ?? "playful";
        const action =
          requestedAction === "random" ? choosePlayModeAction(stage, mode) : requestedAction;
        await playMotionAction(action, stage, runId);
      } finally {
        if (runId === motionRunIdRef.current) {
          isWanderingRef.current = false;
          setPortalEffect(null);
          setPropEffect(null);
          setPetHidden(false);
          resetMotionLayout();
          restoreStatusAnimation();
          scheduleNextRef.current(1_400);
        }
      }
    },
    [
      canPlayInteractiveAction,
      clearAutonomousTimers,
      playMotionAction,
      readStage,
      resetMotionLayout,
      restoreStatusAnimation,
    ],
  );

  const nudgePet = useCallback(
    async (direction: PetNudgeDirection, amount = 56) => {
      if (!canPlayInteractiveAction()) return;

      const step = clamp(amount, 16, 180);
      const runId = motionRunIdRef.current + 1;
      motionRunIdRef.current = runId;
      clearAutonomousTimers();
      clearTimeout(idleTimer.current);
      isWanderingRef.current = true;
      positionRef.current = {
        x: window.screenX + motionLayoutRef.current.spriteOffsetX,
        y: window.screenY + motionLayoutRef.current.spriteOffsetY,
      };

      try {
        const stage = await readStage();
        if (runId !== motionRunIdRef.current || !canPlayInteractiveAction()) return;

        const dx = direction === "left" ? -step : direction === "right" ? step : 0;
        const dy = direction === "up" ? -step : direction === "down" ? step : 0;
        await animateTo(
          {
            x: positionRef.current.x + dx,
            y: positionRef.current.y + dy,
          },
          {
            runId,
            duration: 170 + step * 2,
            jumpHeight: direction === "down" ? 0 : 12,
            animation:
              direction === "left"
                ? "running-left"
                : direction === "right"
                  ? "running-right"
                  : "jumping",
          },
        );
      } finally {
        if (runId === motionRunIdRef.current) {
          isWanderingRef.current = false;
          setPortalEffect(null);
          setPropEffect(null);
          setPetHidden(false);
          resetMotionLayout();
          restoreStatusAnimation();
          scheduleNextRef.current(1_400);
        }
      }
    },
    [
      animateTo,
      canPlayInteractiveAction,
      clearAutonomousTimers,
      readStage,
      resetMotionLayout,
      restoreStatusAnimation,
    ],
  );

  useEffect(() => {
    scheduleNextRef.current = scheduleNextAutonomous;
  }, [scheduleNextAutonomous]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onCommand) return;
    return api.onCommand((command: PetCommand) => {
      if (command.type === "stop") {
        cancelAutonomousMotion();
        return;
      }
      if (command.type === "nudge") {
        void nudgePet(command.direction, command.amount);
        return;
      }

      const action = command.action ?? "random";
      if (action === "random" || DEBUG_ACTIONS.includes(action)) {
        void playInteractiveAction(action);
      }
    });
  }, [cancelAutonomousMotion, nudgePet, playInteractiveAction]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api) return;
    return api.onSettingsChanged((settings) => {
      petSettingsRef.current = settings;
      setPetSettings(settings);
      if (!isWanderingRef.current && !pendingPermissionRef.current) {
        const layout = normalMotionLayout(settings);
        motionLayoutRef.current = layout;
        setMotionLayout(layout);
      }
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
      clearTimeout(hoverTimerRef.current);
      clearAutonomousTimers();
    };
  }, [clearAutonomousTimers, resetIdleTimer]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onAgentStatusUpdate) return;
    return api.onAgentStatusUpdate((update) => {
      applyAgentStatusUpdate(update);
    });
  }, [applyAgentStatusUpdate]);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onUserPrompt) return;
    return api.onUserPrompt((data) => {
      const nextMessages = {
        ...agentMessagesRef.current,
        [data.ptyId]: {
          ...agentMessagesRef.current[data.ptyId],
          userPrompt: data.prompt,
        },
      };
      agentMessagesRef.current = nextMessages;
      setAgentMessages(nextMessages);
    });
  }, []);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onCompletion) return;
    return api.onCompletion((data) => {
      const previous = agentMessagesRef.current[data.ptyId] ?? {};
      const nextMessages = {
        ...agentMessagesRef.current,
        [data.ptyId]: {
          ...previous,
          aiResponse: data.aiMessage,
        },
      };
      const card: CompletionCard = {
        id: `${data.ptyId}:${Date.now()}`,
        ptyId: data.ptyId,
        userPrompt: previous.userPrompt ?? "",
        aiResponse: data.aiMessage,
        timestamp: Date.now(),
      };
      agentMessagesRef.current = nextMessages;
      setAgentMessages(nextMessages);
      setCompletionCards((cards) => [...cards, card]);
    });
  }, []);

  useEffect(() => {
    const api = window.forgepadPet;
    if (!api?.onPermissionRequest) return;
    return api.onPermissionRequest((data) => {
      if (!data.toolName) {
        pendingPermissionRef.current = null;
        setPendingPermission(null);
        const nextStatuses = {
          ...agentStatusesRef.current,
          [data.ptyId]: "idle" as AgentStatus,
        };
        agentStatusesRef.current = nextStatuses;
        setAgentStatuses(nextStatuses);
        const primaryStatus = highestAgentStatus(nextStatuses);
        agentStatusRef.current = primaryStatus;
        setIsPermissionStatus(primaryStatus === "permission");
        if (primaryStatus === "idle") {
          restoreStatusAnimation();
          scheduleNextRef.current(900);
        }
        return;
      }
      pendingPermissionRef.current = data;
      setPendingPermission(data);
      const nextStatuses = {
        ...agentStatusesRef.current,
        [data.ptyId]: "permission" as AgentStatus,
      };
      agentStatusesRef.current = nextStatuses;
      setAgentStatuses(nextStatuses);
      agentStatusRef.current = "permission";
      setIsPermissionStatus(true);
      cancelAutonomousMotion();
    });
  }, [cancelAutonomousMotion, restoreStatusAnimation]);

  const handleApprove = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, "allow");
    setPendingPermission(null);
  }, [pendingPermission]);

  const handleAllowAlways = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, "allowAlways");
    setPendingPermission(null);
  }, [pendingPermission]);

  const handleAnswer = useCallback(
    (answers: Record<string, string>) => {
      if (!pendingPermission) return;
      window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, "answer", answers);
      setPendingPermission(null);
    },
    [pendingPermission],
  );

  const handleDeny = useCallback(() => {
    if (!pendingPermission) return;
    window.forgepadPet?.sendPermissionDecision(pendingPermission.ptyId, "deny");
    setPendingPermission(null);
  }, [pendingPermission]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      pointerDownPos.current = { x: e.screenX, y: e.screenY };
      didDragMove.current = false;
      dragOffset.current = {
        x: e.clientX - motionLayoutRef.current.spriteOffsetX,
        y: e.clientY - motionLayoutRef.current.spriteOffsetY,
      };
      positionRef.current = {
        x: e.screenX - e.clientX + motionLayoutRef.current.spriteOffsetX,
        y: e.screenY - e.clientY + motionLayoutRef.current.spriteOffsetY,
      };

      draggingRef.current = true;
      cancelAutonomousMotion();
      setDragging(true);
      setAnimation("idle");
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

      if (e.movementX > 2) setAnimation("running-right");
      else if (e.movementX < -2) setAnimation("running-left");
      else if (e.movementY < -2) setAnimation("jumping");
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
          const shortcutAction: PetDebugAction | null = e.altKey
            ? "portal"
            : e.shiftKey
              ? "random"
              : e.metaKey || e.ctrlKey
                ? "balloon"
                : null;
          window.forgepadPet?.requestControl?.();
          if (shortcutAction) void playInteractiveAction(shortcutAction);
        }
      }
      pointerDownPos.current = null;

      restoreStatusAnimation();
      if (isAutonomousAllowed()) scheduleNextRef.current(900);
    },
    [isAutonomousAllowed, playInteractiveAction, restoreStatusAnimation],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void playInteractiveAction(Math.random() < 0.45 ? "spring" : "random");
    },
    [playInteractiveAction],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void playInteractiveAction("portal");
    },
    [playInteractiveAction],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (Math.abs(e.deltaY) < 4) return;

      const now = Date.now();
      if (now - wheelCooldownRef.current < 900) return;
      wheelCooldownRef.current = now;

      void playInteractiveAction(e.deltaY < 0 ? "balloon" : "zigzag");
    },
    [playInteractiveAction],
  );

  const handlePointerEnter = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    if (!canPlayInteractiveAction() || isWanderingRef.current) return;

    hoverTimerRef.current = setTimeout(() => {
      if (!canPlayInteractiveAction() || isWanderingRef.current || draggingRef.current) return;
      setAnimation("waving");
      resetIdleTimer();
    }, 260);
  }, [canPlayInteractiveAction, resetIdleTimer]);

  const handlePointerLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    if (!draggingRef.current && !isWanderingRef.current) restoreStatusAnimation();
  }, [restoreStatusAnimation]);

  const showApproval = pendingPermission !== null;
  const currentCompletionCard = showApproval ? null : (completionCards[0] ?? null);
  const showCompletion = currentCompletionCard !== null;
  const workingAgents: WorkingAgentSummary[] = Object.entries(agentStatuses)
    .filter(([, status]) => status === "working")
    .map(([ptyId]) => ({
      ptyId,
      title: agentMessages[ptyId]?.userPrompt || `Agent ${ptyId.slice(-4)}`,
      userPrompt: agentMessages[ptyId]?.userPrompt,
    }));

  const dismissCompletionCard = useCallback((cardId: string) => {
    setCompletionCards((cards) => cards.filter((card) => card.id !== cardId));
  }, []);

  const focusAgentByPtyId = useCallback((ptyId: string) => {
    window.forgepadPet?.focusAgent?.(ptyId);
  }, []);

  const handleCompletionDismiss = useCallback(() => {
    if (!currentCompletionCard) return;
    dismissCompletionCard(currentCompletionCard.id);
  }, [currentCompletionCard, dismissCompletionCard]);

  const handleCompletionView = useCallback(() => {
    if (!currentCompletionCard) return;
    focusAgentByPtyId(currentCompletionCard.ptyId);
    dismissCompletionCard(currentCompletionCard.id);
  }, [currentCompletionCard, dismissCompletionCard, focusAgentByPtyId]);

  const prevShowApproval = useRef(false);

  useEffect(() => {
    if (!petSettings) return;
    const api = window.forgepadPet;
    if (!api?.resizeWindow) return;

    const scale = petSettings.petSize;
    const spriteW = Math.round(BASE_SPRITE_WIDTH * scale);
    const spriteH = Math.round(BASE_SPRITE_HEIGHT * scale);

    const hasFloatingPanel = showApproval || showCompletion;
    if (hasFloatingPanel) {
      const isQuestion = pendingPermission?.questions && pendingPermission.questions.length > 0;
      const optionCount = isQuestion ? (pendingPermission.questions![0].options.length ?? 0) : 0;
      const hasDescription =
        isQuestion && pendingPermission.questions![0].options.some((o) => o.description);
      const optionItemH = hasDescription ? 48 : 34;
      const approvalPopupH = isQuestion ? 106 + optionCount * optionItemH : 120;
      const completionPopupH =
        128 + (completionHovered ? Math.min(workingAgents.length, 6) * 24 + 28 : 0);
      const popupH = showApproval ? approvalPopupH : completionPopupH;
      const totalW = Math.max(spriteW, showApproval ? (isQuestion ? 320 : 280) : 340);
      const totalH = spriteH + popupH;
      api.resizeWindow(totalW, totalH);
    } else if (prevShowApproval.current) {
      api.resizeWindow(spriteW, spriteH);
    }
    prevShowApproval.current = hasFloatingPanel;
  }, [
    showApproval,
    showCompletion,
    completionHovered,
    workingAgents.length,
    petSettings,
    pendingPermission,
  ]);

  if (!petSettings?.enabled) return null;

  const src = getPetSpritesheetUrl(petSettings.selectedPetId);
  const currentSpriteSize = spriteSize(petSettings);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "visible",
      }}
    >
      {(portalEffect || propEffect) && <style>{`${PORTAL_DOOR_CSS}\n${PROP_EFFECT_CSS}`}</style>}
      {showApproval && pendingPermission && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: `${currentSpriteSize.height}px`,
            zIndex: 6,
          }}
        >
          <PetApprovalPopup
            permission={pendingPermission}
            onAllow={handleApprove}
            onAllowAlways={handleAllowAlways}
            onDeny={handleDeny}
            onAnswer={handleAnswer}
            variant="overlay"
          />
        </div>
      )}
      {currentCompletionCard && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: `${currentSpriteSize.height}px`,
            zIndex: 5,
          }}
        >
          <PetCompletionCard
            key={currentCompletionCard.id}
            card={currentCompletionCard}
            onDismiss={handleCompletionDismiss}
            onView={handleCompletionView}
            workingAgents={workingAgents}
            onWorkingAgentView={focusAgentByPtyId}
            onHoverChange={setCompletionHovered}
            variant="overlay"
          />
        </div>
      )}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        style={{
          position: "absolute",
          left: `${motionLayout.spriteOffsetX}px`,
          top: `${motionLayout.spriteOffsetY}px`,
          width: `${currentSpriteSize.width}px`,
          height: `${currentSpriteSize.height}px`,
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {portalEffect && <PortalDoorEffect effect={portalEffect} scale={petSettings.petSize} />}
        {propEffect && <PropEffectView effect={propEffect} />}
        <div
          style={{
            position: "relative",
            zIndex: 4,
            opacity: petHidden ? 0 : 1,
            transform: petHidden ? "translateY(6px) scale(0.86)" : "translateY(0) scale(1)",
            transition: "opacity 140ms ease, transform 140ms ease",
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
    </div>
  );
}
