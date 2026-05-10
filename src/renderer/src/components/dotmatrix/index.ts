export type { DotMatrixCommonProps } from './dotmatrix-core';

export {
  DotmSquare1,
  DotmSquare2,
  DotmSquare3,
  DotmSquare4,
  DotmSquare5,
  DotmSquare6,
  DotmSquare7,
  DotmSquare8,
  DotmSquare9,
  DotmSquare10,
  DotmSquare11,
  DotmSquare12,
  DotmSquare13,
  DotmSquare14,
  DotmSquare15,
  DotmSquare16,
  DotmSquare17,
  DotmSquare18,
  DotmSquare19,
  DotmSquare20,
} from './variants';

/** Spinner style name → display label */
export const DOTMATRIX_SPINNERS: {
  id: string;
  label: string;
  Component: React.ComponentType<{ size?: number; dotSize?: number; color?: string; speed?: number; animated?: boolean }>;
}[] = [];

// Populated lazily below to avoid circular import issues
import {
  DotmSquare1 as S1,
  DotmSquare2 as S2,
  DotmSquare3 as S3,
  DotmSquare4 as S4,
  DotmSquare5 as S5,
  DotmSquare6 as S6,
  DotmSquare7 as S7,
  DotmSquare8 as S8,
  DotmSquare9 as S9,
  DotmSquare10 as S10,
  DotmSquare11 as S11,
  DotmSquare12 as S12,
  DotmSquare13 as S13,
  DotmSquare14 as S14,
  DotmSquare15 as S15,
  DotmSquare16 as S16,
  DotmSquare17 as S17,
  DotmSquare18 as S18,
  DotmSquare19 as S19,
  DotmSquare20 as S20,
} from './variants';

DOTMATRIX_SPINNERS.push(
  { id: 'neon-drift', label: 'Neon Drift', Component: S1 },
  { id: 'pulse-ladder', label: 'Pulse Ladder', Component: S2 },
  { id: 'core-spiral', label: 'Core Spiral', Component: S3 },
  { id: 'twin-orbit', label: 'Twin Orbit', Component: S4 },
  { id: 'prism-sweep', label: 'Prism Sweep', Component: S5 },
  { id: 'flux-columns', label: 'Flux Columns', Component: S6 },
  { id: 'block-drop', label: 'Block Drop', Component: S7 },
  { id: 'strobe-stack', label: 'Strobe Stack', Component: S8 },
  { id: 'glyph-pulse', label: 'Glyph Pulse', Component: S9 },
  { id: 'crt-glide', label: 'CRT Glide', Component: S10 },
  { id: 'echo-ring', label: 'Echo Ring', Component: S11 },
  { id: 'origin-wave', label: 'Origin Wave', Component: S12 },
  { id: 'core-rotor', label: 'Core Rotor', Component: S13 },
  { id: 'prism-bloom', label: 'Prism Bloom', Component: S14 },
  { id: 'helix-glow', label: 'Helix Glow', Component: S15 },
  { id: 'helix-core', label: 'Helix Core', Component: S16 },
  { id: 'half-helix', label: 'Half Helix', Component: S17 },
  { id: 'sound-bars', label: 'Sound Bars', Component: S18 },
  { id: 'infinity-run', label: 'Infinity Run', Component: S19 },
  { id: 'mobius-run', label: 'Mobius Run', Component: S20 },
);

/** Map from spinner id → component for quick lookup. */
export const DOTMATRIX_MAP = new Map(DOTMATRIX_SPINNERS.map((s) => [s.id, s]));

/** Default spinner style id. */
export const DEFAULT_DOTMATRIX_STYLE = 'core-spiral';
