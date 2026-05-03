/**
 * All 20 DotMatrix square loader variants.
 * Based on @dotmatrix by zzzzshawn — https://dotmatrix.zzzzshawn.cloud
 */
import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import {
  DotMatrixBase,
  MATRIX_SIZE,
  diagonalSnakeNormFromIndex,
  diagonalSnakeOrderValue,
  middleRingAntiClockwiseNormFromIndex,
  middleRingAntiClockwiseOrderValue,
  outerRingClockwiseNormFromIndex,
  outerRingClockwiseOrderValue,
  rowMajorIndex,
  spiralInwardNormFromIndex,
  spiralInwardOrderValue,
  trBlPathNormFromIndex,
} from './dotmatrix-core';
import type { DotAnimationResolver, DotMatrixCommonProps } from './dotmatrix-core';
import { useCyclePhase, useDotMatrixPhases, usePrefersReducedMotion, useSteppedCycle } from './dotmatrix-hooks';

/* ═══════════════════════════════════════════════════════════════
   1 — Neon Drift
   ═══════════════════════════════════════════════════════════════ */

const square1Resolver: DotAnimationResolver = ({ isActive, index, row, col, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const path = trBlPathNormFromIndex(index);
  const slice = row + (4 - col);
  const parity = slice % 2;
  const style = { '--dmx-path': path, '--dmx-diagonal-parity': parity } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: parity === 0 ? 0.88 : 0.14 } };
  return { className: 'dmx-diagonal-alt-sweep', style };
};

export function DotmSquare1({ speed = 1.1, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square1Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   2 — Pulse Ladder
   ═══════════════════════════════════════════════════════════════ */

const SNAKE_TAIL_2 = [1, 0.82, 0.68, 0.54, 0.42, 0.31, 0.22, 0.14] as const;

function buildRowCyclePath(): number[] {
  const path: number[] = [];
  const push = (row: number, col: number) => path.push(rowMajorIndex(row, col));
  for (let row = 4; row >= 0; row -= 1) push(row, 0);
  push(0, 1); push(0, 2);
  for (let row = 1; row <= 4; row += 1) push(row, 2);
  push(4, 1);
  for (let row = 3; row >= 0; row -= 1) push(row, 1);
  push(0, 2); push(0, 3);
  for (let row = 1; row <= 4; row += 1) push(row, 3);
  push(4, 2);
  for (let row = 3; row >= 0; row -= 1) push(row, 2);
  push(0, 3); push(0, 4);
  for (let row = 1; row <= 4; row += 1) push(row, 4);
  return path;
}

export function DotmSquare2({ speed = 1.15, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const route = useMemo(() => buildRowCyclePath(), []);
  const routeLen = route.length;
  const head = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle' && routeLen > 0, cycleMsBase: 1500, steps: routeLen, speed });
  const visitsByIndex = useMemo(() => {
    const visits = new Map<number, number[]>();
    for (let step = 0; step < routeLen; step += 1) {
      const index = route[step]!;
      const list = visits.get(index) ?? [];
      list.push(step);
      visits.set(index, list);
    }
    return visits;
  }, [route, routeLen]);
  const animationResolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, index }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      if (routeLen <= 0) return { style: { opacity: 0.08 } };
      const visits = visitsByIndex.get(index) ?? [];
      let opacity = 0.08;
      for (const stepIndex of visits) {
        const distance = (head - stepIndex + routeLen) % routeLen;
        if (distance >= 0 && distance < SNAKE_TAIL_2.length) opacity = Math.max(opacity, SNAKE_TAIL_2[distance]!);
      }
      return { style: { opacity } };
    };
  }, [head, routeLen, visitsByIndex]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={animationResolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   3 — Core Spiral
   ═══════════════════════════════════════════════════════════════ */

const square3Resolver: DotAnimationResolver = ({ isActive, index, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const order = spiralInwardOrderValue(index);
  const pathNorm = spiralInwardNormFromIndex(index);
  const style = { '--dmx-spiral-order': order } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.16 + pathNorm * 0.78 } };
  return { className: 'dmx-spiral-snake', style };
};

export function DotmSquare3({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square3Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   4 — Twin Orbit
   ═══════════════════════════════════════════════════════════════ */

const square4Resolver: DotAnimationResolver = ({ isActive, index, row, col, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const isCenter = row === 2 && col === 2;
  if (isCenter) return { className: 'dmx-inactive' };
  const outerOrder = outerRingClockwiseOrderValue(index);
  if (outerOrder >= 0) {
    const outerNorm = outerRingClockwiseNormFromIndex(index);
    const style = { '--dmx-outer-order': outerOrder } as CSSProperties;
    if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.2 + outerNorm * 0.72 } };
    return { className: 'dmx-outer-snake', style };
  }
  const middleOrder = middleRingAntiClockwiseOrderValue(index);
  const middleNorm = middleRingAntiClockwiseNormFromIndex(index);
  const style = { '--dmx-middle-order': middleOrder } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.2 + middleNorm * 0.72 } };
  return { className: 'dmx-middle-snake', style };
};

export function DotmSquare4({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square4Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   5 — Prism Sweep
   ═══════════════════════════════════════════════════════════════ */

const square5Resolver: DotAnimationResolver = ({ isActive, index, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const order = diagonalSnakeOrderValue(index);
  const pathNorm = diagonalSnakeNormFromIndex(index);
  const style = { '--dmx-diagonal-snake-order': order } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.16 + pathNorm * 0.78 } };
  return { className: 'dmx-diagonal-snake', style };
};

export function DotmSquare5({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square5Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   6 — Flux Columns
   ═══════════════════════════════════════════════════════════════ */

export function DotmSquare6({ speed = 2.2, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const animationResolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const goesUp = col % 2 === 0;
      const position = goesUp ? 4 - row : row;
      if (reducedMotion || phase === 'idle') return { style: { opacity: 0.22 + (position / 4) * 0.66 } };
      return { className: 'dmx-square6-col-snake', style: { '--dmx-col-pos': position } as CSSProperties };
    };
  }, [reducedMotion]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={animationResolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   7 — Block Drop
   ═══════════════════════════════════════════════════════════════ */

type FrameCell = '.' | 'o' | 'x' | 'c';

const BLOCK_MASKS: readonly string[] = [
  '.....' + '.....' + '.....' + '.....' + 'ooooo',
  '.....' + '.....' + '.....' + 'ooooo' + 'ooooo',
  '.....' + '.....' + 'ooooo' + 'ooooo' + 'ooooo',
  '.....' + 'ooooo' + 'ooooo' + 'ooooo' + 'ooooo',
  'ooooo' + 'ooooo' + 'ooooo' + 'ooooo' + 'ooooo',
  'ccccc' + 'ccccc' + 'ccccc' + 'ccccc' + 'ccccc',
  '.....' + '.....' + '.....' + '.....' + '.....',
  'ccccc' + 'ccccc' + 'ccccc' + 'ccccc' + 'ccccc',
  '.....' + '.....' + '.....' + '.....' + '.....',
  '.....' + '.....' + '.....' + '.....' + '.....',
];
const BLOCK_SEQ: readonly number[] = [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9];

function maskCell(mask: string, row: number, col: number): FrameCell {
  return (mask[rowMajorIndex(row, col)] as FrameCell | undefined) ?? '.';
}

export function DotmSquare7({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const step = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle' && BLOCK_SEQ.length > 0, cycleMsBase: 1900, steps: BLOCK_SEQ.length, speed, idleStep: Math.min(10, BLOCK_SEQ.length - 1) });
  const frame = BLOCK_SEQ[step] ?? BLOCK_SEQ[0] ?? 0;
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const cell = maskCell(BLOCK_MASKS[frame]!, row, col);
      if (cell === 'x') return { style: { opacity: 1 } };
      if (cell === 'o') return { style: { opacity: 0.42 } };
      if (cell === 'c') return { style: { opacity: 0.88 } };
      return { style: { opacity: 0.08 } };
    };
  }, [frame]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   8 — Strobe Stack
   ═══════════════════════════════════════════════════════════════ */

const ROWS = MATRIX_SIZE;
const COLS = MATRIX_SIZE;
const FILL_LAST = ROWS + COLS - 1;
const BLINK_STEPS = 4;
const BLINK_OPACITIES = [0.38, 1, 0.38, 1] as const;
const DRAIN_LAST = FILL_LAST;
const STROBE_SEQ_LEN = FILL_LAST + 1 + BLINK_STEPS + DRAIN_LAST + 1;

function fillHeight(col: number, fillTick: number): number { return Math.max(0, Math.min(ROWS, fillTick - col)); }
function drainHeight(col: number, drainTick: number): number { return Math.max(0, Math.min(ROWS, ROWS - Math.max(0, drainTick - col))); }

export function DotmSquare8({ speed = 1.4, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const step = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle' && STROBE_SEQ_LEN > 0, cycleMsBase: 2000, steps: STROBE_SEQ_LEN, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      if (reducedMotion || phase === 'idle') return { style: { opacity: 0.08 } };
      let height = 0;
      let blinkOpacity: number | null = null;
      if (step <= FILL_LAST) { height = fillHeight(col, step); }
      else if (step < FILL_LAST + 1 + BLINK_STEPS) { height = ROWS; blinkOpacity = BLINK_OPACITIES[step - (FILL_LAST + 1)] ?? 1; }
      else { const drainTick = step - (FILL_LAST + 1 + BLINK_STEPS); height = drainHeight(col, drainTick); }
      const bottomRow = ROWS - 1;
      const topLitRow = ROWS - height;
      const isLit = height > 0 && row >= topLitRow && row <= bottomRow;
      if (!isLit) return { style: { opacity: 0.08 } };
      if (blinkOpacity !== null) return { style: { opacity: blinkOpacity } };
      const isCap = row === topLitRow && height > 0 && height < ROWS;
      return { style: { opacity: isCap ? 1 : 0.52 } };
    };
  }, [reducedMotion, step]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   9 — Glyph Pulse
   ═══════════════════════════════════════════════════════════════ */

const D1 = 0x01; const D2 = 0x02; const D3 = 0x04; const D4 = 0x08; const D5 = 0x10; const D6 = 0x20;
const CHECK_A = D1 | D3 | D5;

function brailleBitForCell(row: number, col: number, cellColStart: number): number | null {
  if (row < 1 || row > 3) return null;
  const dr = row - 1;
  if (col === cellColStart) return D1 << dr;
  if (col === cellColStart + 1) return D4 << dr;
  return null;
}

function resolveBraille(row: number, col: number): { bit: number } | null {
  const left = brailleBitForCell(row, col, 0);
  if (left !== null) return { bit: left };
  const right = brailleBitForCell(row, col, 3);
  if (right !== null) return { bit: right };
  return null;
}

export function DotmSquare9({ speed = 1.5, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const braille = resolveBraille(row, col);
      if (reducedMotion || phase === 'idle') {
        if (braille) { const on = (CHECK_A & braille.bit) !== 0; return { style: { opacity: on ? 0.26 : 0.08 } }; }
        if (row >= 1 && row <= 3 && col === 2) return { style: { opacity: 0.12 } };
        return { style: { opacity: 0.08 } };
      }
      if (row >= 1 && row <= 3 && col === 2) return { style: { opacity: 0.12 } };
      if (!braille) return { style: { opacity: 0.08 } };
      let bitClass = 'dmx-square9-d1';
      if (braille.bit === D2) bitClass = 'dmx-square9-d2';
      else if (braille.bit === D3) bitClass = 'dmx-square9-d3';
      else if (braille.bit === D4) bitClass = 'dmx-square9-d4';
      else if (braille.bit === D5) bitClass = 'dmx-square9-d5';
      else if (braille.bit === D6) bitClass = 'dmx-square9-d6';
      return { className: `dmx-square9-bit ${bitClass}` };
    };
  }, [reducedMotion]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   10 — CRT Glide
   ═══════════════════════════════════════════════════════════════ */

export function DotmSquare10({ speed = 2.5, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const scanRow = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1500, steps: ROWS, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      if (reducedMotion || phase === 'idle') { const falloff = (ROWS - 1 - row) / Math.max(1, ROWS - 1); return { style: { opacity: 0.08 + falloff * 0.38 } }; }
      const colGain = 1 + 0.07 * Math.sin(col * 1.72 + scanRow * 0.61);
      if (row > scanRow) return { style: { opacity: 0.08 } };
      const age = scanRow - row;
      const trail = Math.exp(-age * 0.72);
      const opacity = 0.08 + (1 - 0.08) * trail * colGain;
      return { style: { opacity: Math.min(1, opacity) } };
    };
  }, [reducedMotion, scanRow]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   11 — Echo Ring
   ═══════════════════════════════════════════════════════════════ */

const square11Resolver: DotAnimationResolver = ({ isActive, manhattanDistance: md, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const ring = Math.max(0, Math.min(4, md));
  const style = { '--dmx-ripple-ring': ring, '--dmx-ripple-parity': ring % 2 } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.2 + (1 - ring / 4) * 0.72 } };
  return { className: 'dmx-ripple-echo', style };
};

export function DotmSquare11({ speed = 1.25, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square11Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   12 — Origin Wave
   ═══════════════════════════════════════════════════════════════ */

const square12Resolver: DotAnimationResolver = ({ isActive, row, col, reducedMotion, phase }) => {
  if (!isActive) return { className: 'dmx-inactive' };
  const ring = Math.max(0, Math.min(6, Math.abs(row - 1) + Math.abs(col - 1)));
  const style = { '--dmx-center-ripple-ring': ring } as CSSProperties;
  if (reducedMotion || phase === 'idle') return { style: { ...style, opacity: 0.2 + (1 - ring / 6) * 0.75 } };
  return { className: 'dmx-center-origin-ripple', style };
};

export function DotmSquare12({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={square12Resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   13 — Core Rotor
   ═══════════════════════════════════════════════════════════════ */

const ROTOR_MASKS: readonly string[] = [
  '..x..' + '..x..' + '..o..' + '.....' + '.....',
  '....x' + '...x.' + '..o..' + '.....' + '.....',
  '.....' + '.....' + '..oxx' + '.....' + '.....',
  '.....' + '.....' + '..o..' + '...x.' + '....x',
  '.....' + '.....' + '..o..' + '..x..' + '..x..',
  '.....' + '.....' + '..o..' + '.x...' + 'x....',
  '.....' + '.....' + 'xxo..' + '.....' + '.....',
  'x....' + '.x...' + '..o..' + '.....' + '.....',
];
const ROTOR_SEQ: readonly number[] = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];

export function DotmSquare13({ speed = 1.85, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const step = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle' && ROTOR_SEQ.length > 0, cycleMsBase: 1550, steps: ROTOR_SEQ.length, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    const frameIndex = ROTOR_SEQ[step] ?? 0;
    const mask = ROTOR_MASKS[frameIndex] ?? ROTOR_MASKS[0]!;
    return ({ isActive, row, col }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const cell = maskCell(mask, row, col);
      if (cell === 'x') return { style: { opacity: 1 } };
      if (cell === 'o') return { style: { opacity: 0.56 } };
      return { style: { opacity: 0.08 } };
    };
  }, [step]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   14 — Prism Bloom
   ═══════════════════════════════════════════════════════════════ */

const PRISM_MASKS: readonly string[] = [
  'x...x' + '.x.x.' + '..o..' + '.x.x.' + 'x...x',
  '..x..' + '.oxo.' + 'xooox' + '.oxo.' + '..x..',
  '.x.x.' + 'x.o.x' + '..o..' + 'x.o.x' + '.x.x.',
  'x.x.x' + '.o.o.' + 'x.o.x' + '.o.o.' + 'x.x.x',
];
const PRISM_SEQ: readonly number[] = [0, 1, 2, 3, 2, 1];
const SMOOTH_TRANSITION = 'opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)';

export function DotmSquare14({ speed = 1.25, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const step = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle' && PRISM_SEQ.length > 0, cycleMsBase: 1700, steps: PRISM_SEQ.length, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    const frameIndex = PRISM_SEQ[step] ?? 0;
    const mask = PRISM_MASKS[frameIndex] ?? PRISM_MASKS[0]!;
    return ({ isActive, row, col }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const cell = maskCell(mask, row, col);
      if (cell === 'x') return { style: { opacity: 1, transition: SMOOTH_TRANSITION } };
      if (cell === 'o') return { style: { opacity: 0.52, transition: SMOOTH_TRANSITION } };
      return { style: { opacity: 0.08, transition: SMOOTH_TRANSITION } };
    };
  }, [step]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   15 — Helix Glow
   ═══════════════════════════════════════════════════════════════ */

export function DotmSquare15({ speed = 1.25, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const animPhase = useCyclePhase({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1600, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const u = reducedMotion || phase === 'idle' ? 0 : animPhase;
      const rowPhase = u * 2 * 2 * Math.PI + row * 1.24;
      const left = Math.round(1 + Math.sin(rowPhase));
      const right = 4 - left;
      const bridgeOn = Math.cos(rowPhase * 2) > 0.82;
      if (col === left || col === right) return { style: { opacity: 1 } };
      if (bridgeOn && col > left && col < right) return { style: { opacity: 0.58 } };
      if (Math.abs(col - left) === 1 || Math.abs(col - right) === 1) return { style: { opacity: 0.24 } };
      return { style: { opacity: 0.08 } };
    };
  }, [reducedMotion, animPhase]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   16 — Helix Core
   ═══════════════════════════════════════════════════════════════ */

const HELIX_STEP_COUNT = 20;
const HELIX_LOOP_RADIANS = (Math.PI * 2) / (HELIX_STEP_COUNT - 1);

export function DotmSquare16({ speed = 2.5, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const animPhase = useCyclePhase({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1400, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const t = reducedMotion || phase === 'idle' ? 0 : animPhase * HELIX_STEP_COUNT;
      const rowPhase = t * HELIX_LOOP_RADIANS + row * 1.24;
      const left = Math.round(1.5 + 0.5 * Math.sin(rowPhase));
      const right = 4 - left;
      const bridgeOn = Math.cos(rowPhase * 2) > 0.82;
      if (col === left || col === right) return { style: { opacity: 1 } };
      if (bridgeOn && col > left && col < right) return { style: { opacity: 0.58 } };
      if (Math.abs(col - left) === 1 || Math.abs(col - right) === 1) return { style: { opacity: 0.24 } };
      return { style: { opacity: 0.08 } };
    };
  }, [reducedMotion, animPhase]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   17 — Half Helix
   ═══════════════════════════════════════════════════════════════ */

export function DotmSquare17({ speed = 2.5, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const animPhase = useCyclePhase({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1600, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const t = reducedMotion || phase === 'idle' ? 0 : animPhase * HELIX_STEP_COUNT;
      const rowPhase = t * HELIX_LOOP_RADIANS + row * 1.24;
      const strandCol = Math.round(2 + 2 * Math.sin(rowPhase));
      if (col === strandCol) return { style: { opacity: 1 } };
      if (Math.abs(col - strandCol) === 1) return { style: { opacity: 0.24 } };
      return { style: { opacity: 0.08 } };
    };
  }, [reducedMotion, animPhase]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   18 — Sound Bars
   ═══════════════════════════════════════════════════════════════ */

function clampLevel(value: number): number { return Math.max(1, Math.min(5, Math.round(value))); }

export function DotmSquare18({ speed = 1.35, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const animPhase = useCyclePhase({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1750, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const t = reducedMotion || phase === 'idle' ? 0 : animPhase * 24;
      const colPhase = t * 0.52 + col * 1.15;
      const level = clampLevel(1 + ((Math.sin(colPhase) + 1) / 2) * 4);
      const topLitRow = 5 - level;
      if (row > topLitRow) return { style: { opacity: 0.94 } };
      if (row === topLitRow) return { style: { opacity: 1 } };
      return { style: { opacity: 0.08 } };
    };
  }, [reducedMotion, animPhase]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   19 — Infinity Run
   ═══════════════════════════════════════════════════════════════ */

interface Point { x: number; y: number; }
const CURVE_SAMPLES: readonly Point[] = Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * Math.PI * 2; return { x: Math.sin(t), y: 0.58 * Math.sin(2 * t) }; });
function gridPoint(row: number, col: number): Point { return { x: (col - 2) / 2, y: (2 - row) / 2 }; }
function loopPoint(step: number): Point { const t = ((step % 48) / 48) * Math.PI * 2; return { x: Math.sin(t), y: 0.58 * Math.sin(2 * t) }; }
function squaredDistance(a: Point, b: Point): number { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; }
function minCurveDistanceSq(point: Point): number { let min = Number.POSITIVE_INFINITY; for (const s of CURVE_SAMPLES) min = Math.min(min, squaredDistance(point, s)); return min; }
function headInfluence(dot: Point, head: Point): number { return Math.exp(-squaredDistance(dot, head) / 0.19); }

export function DotmSquare19({ speed = 1.45, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const step = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1700, steps: 48, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, row, col, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const dot = gridPoint(row, col);
      if (reducedMotion || phase === 'idle') {
        const curveGlow = Math.exp(-minCurveDistanceSq(dot) / 0.2);
        const centerBoost = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.06);
        return { style: { opacity: Math.min(1, 0.08 + curveGlow * 0.2 + centerBoost * 0.18) } };
      }
      const headA = loopPoint(step);
      const headB = loopPoint(step + 24);
      const trailA = loopPoint(step - 4);
      const trailB = loopPoint(step + 20);
      const lead = Math.max(headInfluence(dot, headA), headInfluence(dot, headB));
      const trail = Math.max(headInfluence(dot, trailA), headInfluence(dot, trailB));
      const centerPulse = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.05) * (0.45 + 0.55 * lead);
      const opacity = 0.08 + 0.32 * trail + 0.62 * lead + 0.16 * centerPulse;
      return { style: { opacity: Math.min(1, opacity) } };
    };
  }, [reducedMotion, step]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}

/* ═══════════════════════════════════════════════════════════════
   20 — Mobius Run
   ═══════════════════════════════════════════════════════════════ */

const PERIMETER_PATH: readonly number[] = [
  rowMajorIndex(0, 0), rowMajorIndex(0, 1), rowMajorIndex(0, 2), rowMajorIndex(0, 3), rowMajorIndex(0, 4),
  rowMajorIndex(1, 4), rowMajorIndex(2, 4), rowMajorIndex(3, 4), rowMajorIndex(4, 4),
  rowMajorIndex(4, 3), rowMajorIndex(4, 2), rowMajorIndex(4, 1), rowMajorIndex(4, 0),
  rowMajorIndex(3, 0), rowMajorIndex(2, 0), rowMajorIndex(1, 0),
];
const LOOP_LEN = PERIMETER_PATH.length;
const TAIL_BRIGHT_20 = [1, 0.82, 0.64, 0.46, 0.3, 0.18] as const;
const BACK_TAIL_BRIGHT_20 = [0.38, 0.3, 0.22, 0.14] as const;
const TWIST_INNER_BY_HEAD_STEP: ReadonlyMap<number, number> = new Map([
  [0, rowMajorIndex(1, 1)], [4, rowMajorIndex(1, 3)], [8, rowMajorIndex(3, 3)], [12, rowMajorIndex(3, 1)],
]);

function pathStepForCellIndex(cellIndex: number): number { return PERIMETER_PATH.indexOf(cellIndex); }
function opacityFromTail(distance: number, tail: readonly number[]): number { if (distance < 0 || distance >= tail.length) return 0; return tail[distance]!; }

export function DotmSquare20({ speed = 1.45, pattern = 'full', animated = true, hoverAnimated = false, ...rest }: DotMatrixCommonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({ animated: Boolean(animated && !reducedMotion), hoverAnimated: Boolean(hoverAnimated && !reducedMotion), speed });
  const headStep = useSteppedCycle({ active: !reducedMotion && matrixPhase !== 'idle', cycleMsBase: 1600, steps: LOOP_LEN, speed });
  const resolver = useMemo<DotAnimationResolver>(() => {
    return ({ isActive, index, phase }) => {
      if (!isActive) return { className: 'dmx-inactive' };
      const onLoop = pathStepForCellIndex(index);
      const backHead = (headStep + Math.floor(LOOP_LEN / 2)) % LOOP_LEN;
      if (reducedMotion || phase === 'idle') {
        if (onLoop >= 0) return { style: { opacity: 0.48 } };
        if (index === rowMajorIndex(2, 2)) return { style: { opacity: 0.22 } };
        return { style: { opacity: 0.08 } };
      }
      let opacity = 0.08;
      if (onLoop >= 0) {
        const forward = (headStep - onLoop + LOOP_LEN) % LOOP_LEN;
        const alongBack = (backHead - onLoop + LOOP_LEN) % LOOP_LEN;
        opacity = Math.max(opacity, opacityFromTail(forward, TAIL_BRIGHT_20), opacityFromTail(alongBack, BACK_TAIL_BRIGHT_20));
      }
      const twistInner = TWIST_INNER_BY_HEAD_STEP.get(headStep);
      if (twistInner === index) opacity = Math.max(opacity, 0.52);
      const seam = rowMajorIndex(2, 2);
      if (index === seam && headStep % 4 === 0) opacity = Math.max(opacity, 0.55);
      return { style: { opacity: Math.min(1, opacity) } };
    };
  }, [headStep, reducedMotion]);
  return <DotMatrixBase {...rest} size={rest.size ?? 36} dotSize={rest.dotSize ?? 5} speed={speed} pattern={pattern} animated={animated} phase={matrixPhase} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} reducedMotion={reducedMotion} animationResolver={resolver} />;
}
