import type { CustomPetMeta, PetDefinition } from '@shared/types';
import type { PetSpriteAtlas } from 'codex-pets-react';

/**
 * Animation names for our pet spritesheets.
 * Spritesheets are 1536×1872px = 8 cols × 9 rows = 192×208px per frame.
 * Row layout matches codexPetAtlas:
 *   0: idle          5: failed
 *   1: running-right 6: waiting
 *   2: running-left  7: running
 *   3: waving        8: review
 *   4: jumping
 */
export type ForgePetAnimationName =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

/**
 * Atlas for our 1536×1872 spritesheets (8 cols × 9 rows, 192×208 per cell).
 * Matches the standard codexPetAtlas layout from codex-pets-react.
 */
export const forgePetAtlas: PetSpriteAtlas<ForgePetAnimationName> = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  animations: {
    idle: {
      row: 0,
      frames: 6,
      frameDurations: [280, 110, 110, 140, 140, 320],
    },
    'running-right': {
      row: 1,
      frames: 8,
      frameDurations: [120, 120, 120, 120, 120, 120, 120, 220],
    },
    'running-left': {
      row: 2,
      frames: 8,
      frameDurations: [120, 120, 120, 120, 120, 120, 120, 220],
    },
    waving: {
      row: 3,
      frames: 4,
      frameDurations: [140, 140, 140, 280],
    },
    jumping: {
      row: 4,
      frames: 5,
      frameDurations: [140, 140, 140, 140, 280],
    },
    failed: {
      row: 5,
      frames: 8,
      frameDurations: [140, 140, 140, 140, 140, 140, 140, 240],
    },
    waiting: {
      row: 6,
      frames: 6,
      frameDurations: [150, 150, 150, 150, 150, 260],
    },
    running: {
      row: 7,
      frames: 6,
      frameDurations: [120, 120, 120, 120, 120, 220],
    },
    review: {
      row: 8,
      frames: 6,
      frameDurations: [150, 150, 150, 150, 150, 280],
    },
  },
};

export const DEFAULT_BUILT_IN_PET_ID = 'kiki';

/** Built-in pets bundled with the app. Keep this list intentionally small to limit installer size. */
export const PET_REGISTRY: PetDefinition[] = [
  {
    id: 'amane',
    displayName: 'Amane',
    description: 'A compact Codex digital pet version of Amane.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'kiki',
    displayName: 'Kiki',
    description: 'A little witch deliver Kiki with her black cat Zizi.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'kitmar',
    displayName: 'Marin-chan',
    description: 'A cheerful, charming digital companion inspired by Marin Kitagawa.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'monica',
    displayName: 'Monica',
    description: 'A tiny shy Codex pet inspired by Monica Everett, the Silent Witch who avoids speaking and casts silently.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'object',
  },
  {
    id: 'takagi-san',
    displayName: '高木',
    description: '带有高木同学标志性捉弄感咧嘴笑的 Q 版桌宠。',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'xiao-zhu',
    displayName: '小渚',
    description: 'A cute, gentle Codex digital pet inspired by a school-uniform anime heroine reference.',
    spritesheetPath: 'spritesheet.webp',
  },
];

/** Get the URL for a pet's spritesheet. Built-in pets use public/, custom pets use custom-pet:// protocol. */
const BUILT_IN_PET_IDS = new Set(PET_REGISTRY.map((pet) => pet.id));

function resolveBuiltInPetId(petId: string): string {
  return BUILT_IN_PET_IDS.has(petId) ? petId : DEFAULT_BUILT_IN_PET_ID;
}

export function getPetSpritesheetUrl(petId: string, cacheBust?: string): string {
  if (petId.startsWith('custom-')) {
    const suffix = cacheBust ? `?v=${cacheBust}` : '';
    return `custom-pet://local/${petId}/spritesheet.webp${suffix}`;
  }
  return `${import.meta.env.BASE_URL}pets/${resolveBuiltInPetId(petId)}/spritesheet.webp`;
}

/** Merge built-in pets with user-imported custom pets */
export function getAllPets(customPets: CustomPetMeta[]): PetDefinition[] {
  return [
    ...PET_REGISTRY,
    ...customPets.map(
      (meta): PetDefinition => ({
        id: meta.id,
        displayName: meta.displayName,
        description: meta.description,
        spritesheetPath: 'spritesheet.webp',
        kind: meta.kind,
        isCustom: true,
      }),
    ),
  ];
}

/**
 * Map agent lifecycle status to pet animation.
 * Inspired by CodeIsland's mascot-per-status approach:
 *   idle       → idle (then waiting after timeout)
 *   working    → running (agent is actively processing / using tools)
 *   review     → review (agent finished a turn, waiting for user to review)
 *   permission → waving  (agent needs user approval)
 */
export function agentStatusToAnimation(status: string): ForgePetAnimationName {
  switch (status) {
    case 'working':
      return 'running';
    case 'review':
      return 'review';
    case 'permission':
      return 'waving';
    default:
      return 'idle';
  }
}
