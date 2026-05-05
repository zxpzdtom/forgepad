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

/** All built-in pets */
export const PET_REGISTRY: PetDefinition[] = [
  { id: 'amane', displayName: 'Amane', description: 'A compact Codex digital pet version of Amane.', spritesheetPath: 'spritesheet.webp' },
  { id: 'clawd', displayName: 'Clawd', description: 'A compact Codex pet based on official Claude Code pixel Clawd frames.', spritesheetPath: 'spritesheet.webp' },
  { id: 'dario', displayName: 'Dario', description: 'A tiny frustrated Codex pet inspired by Dario, CEO of Anthropic.', spritesheetPath: 'spritesheet.webp' },
  { id: 'dev', displayName: 'Dev', description: 'A calm green hoodie developer carrying a laptop.', spritesheetPath: 'spritesheet.webp' },
  { id: 'doge', displayName: 'Doge', description: 'A cute Doge-style Shiba Inu companion for Codex.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'doraemon', displayName: 'Doraemon', description: 'A compact blue robot-cat Codex pet inspired by 哆啦A梦.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'goku', displayName: 'Goku', description: 'A cute compact Codex pet based on a spiky-haired martial arts hero.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'itachi', displayName: 'Itachi', description: 'A calm shinobi strategist companion with red eyes and black cloak.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'jollio', displayName: 'Jollio', description: 'A chubby pure white English bulldog DJ wearing pink headphones.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'kid-goku-classic-actions', displayName: 'Kid Goku', description: 'A tiny Codex pet based on kid Son Goku with classic Dragon Ball actions.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'kun', displayName: 'Kun', description: 'A compact Codex table pet dancer named Kun with basketball dance poses.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'luffy', displayName: 'Luffy', description: 'A tiny straw-hat pirate companion with cheerful rubbery energy.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'lulu', displayName: 'Lulu', description: 'A tiny yellow capybara-like Codex digital pet.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'mini-elon', displayName: 'Mini Elon', description: 'What did you get done today?', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'mini-sama', displayName: 'Mini Sama', description: 'A funny pixel-sprite Sama-inspired pet with anxious energy.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'nimbus', displayName: 'Nimbus', description: 'A tiny chibi martial-arts kid riding a golden cloud.', spritesheetPath: 'spritesheet.webp' },
  { id: 'ninja-naru', displayName: 'Ninja Naru', description: 'A compact chibi blond orange-clad ninja digital pet.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'noir-maid', displayName: 'Noir Maid', description: 'A tiny chibi elf in a black-and-white maid outfit.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'palantir-patrick', displayName: 'Palantir Patrick', description: 'A compact pixel pet based on Patrick wearing a Palantir cap.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'professor-puff', displayName: 'Professor Puff', description: 'A tiny Codex-style scientist pet inspired by Albert Einstein.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'ricklet', displayName: 'Ricklet', description: 'A tiny chaotic scientist companion inspired by Rick Sanchez.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'savage-codex-hacker', displayName: 'Codex Hacker', description: 'A smug little Codex logo mascot wearing pixel shades.', spritesheetPath: 'spritesheet.webp' },
  { id: 'shinchan', displayName: 'Shinchan', description: 'A tiny mischievous kindergarten-boy companion.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'sun-wukong', displayName: 'Sun Wukong', description: 'A compact Codex digital pet of Sun Wukong, the Monkey King.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'teemo', displayName: 'Teemo', description: 'Captain Teemo on duty.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'tom', displayName: 'Tom', description: 'A confident blue-gray chibi cat companion.', spritesheetPath: 'spritesheet.webp', kind: 'animal' },
  { id: 'trump', displayName: 'Trump', description: 'A small smooth-edged digital pet caricature.', spritesheetPath: 'spritesheet.webp', kind: 'person' },
  { id: 'ultra', displayName: 'Ultra', description: 'A compact Ultraman-inspired silver-and-red tokusatsu hero pet.', spritesheetPath: 'spritesheet.webp' },
];

/** Get the URL for a pet's spritesheet. Built-in pets use public/, custom pets use custom-pet:// protocol. */
export function getPetSpritesheetUrl(petId: string, cacheBust?: string): string {
  if (petId.startsWith('custom-')) {
    const suffix = cacheBust ? `?v=${cacheBust}` : '';
    return `custom-pet://local/${petId}/spritesheet.webp${suffix}`;
  }
  return `${import.meta.env.BASE_URL}pets/${petId}/spritesheet.webp`;
}

/** Merge built-in pets with user-imported custom pets */
export function getAllPets(customPets: CustomPetMeta[]): PetDefinition[] {
  return [
    ...PET_REGISTRY,
    ...customPets.map((meta): PetDefinition => ({
      id: meta.id,
      displayName: meta.displayName,
      description: meta.description,
      spritesheetPath: 'spritesheet.webp',
      kind: meta.kind,
      isCustom: true,
    })),
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
