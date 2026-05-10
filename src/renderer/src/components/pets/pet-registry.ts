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
  {
    id: 'aerith',
    displayName: 'Aerith',
    description:
      'A gentle Codex digital pet inspired by a flower mage heroine, with brown braided hair, a pink dress, a red cropped jacket, green eyes, and one tiny flower.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'object',
  },
  {
    id: 'akane',
    displayName: 'Akane',
    description: 'A tiny tsundere maid with red twin tails who fusses over unfinished work while pretending not to care.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'amane',
    displayName: 'Amane',
    description: 'A compact Codex digital pet version of Amane.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'anya',
    displayName: 'Anya',
    description:
      'A tiny Anya Forger inspired telepath girl mascot from Spy x Family, made as a Codex digital pet with rich cute expressions and lively actions.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'apupepe',
    displayName: 'Pepe',
    description: 'A compact Codex-style green frog pet in a plain blue shirt.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'bx-cat',
    displayName: 'Bx-Cat',
    description: 'A cool white cat wearing a blue B cap and blue sunglasses.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'chopper',
    displayName: 'Chopper',
    description:
      'A tiny Codex pet version of Tony Tony Chopper with a blue cap, pink brim, antlers, round eyes, striped vest, and orange shorts.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'clawd',
    displayName: 'Clawd',
    description: 'A compact Codex pet based on official Claude Code pixel Clawd frames.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'daodun',
    displayName: 'DaoDun',
    description:
      'A compact pixel-art meme warrior pet with a round dog-like body, a smug grin, a short sword, and a raised wooden shield.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'dario',
    displayName: 'Dario',
    description: 'A tiny frustrated Codex pet inspired by Dario, CEO of Anthropic.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'dev',
    displayName: 'Dev',
    description: 'A calm green hoodie developer carrying a laptop.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'doge',
    displayName: 'Doge',
    description: 'A cute Doge-style Shiba Inu companion for Codex.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'doraemon',
    displayName: 'Doraemon',
    description: 'A compact blue robot-cat Codex pet inspired by 哆啦A梦.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'duo',
    displayName: 'Duo',
    description: 'Learning companion with expressive chibi sprite poses.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'goku',
    displayName: 'Goku',
    description: 'A cute compact Codex pet based on a spiky-haired martial arts hero.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'graycraft4',
    displayName: 'STORM // GRAYCRAFT4',
    description:
      'A meacing but loyal red-and-black mech companion from the GRAYCRAFT series, built to move with precision and stand by you through the work. Learn more at GRAYCRAFT.com.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'gyaru-pm',
    displayName: 'Gyaru-PM',
    description:
      'A tiny blonde ponytail gyaru PM Codex companion with a white hoodie, cyan scrunchie and accents, heart hairpin, wink, hoop earring, and a small drink bottle charm.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'hutao',
    displayName: '胡桃',
    description:
      '胡桃是《原神》中的五星火元素角色，使用长柄武器，是璃月「往生堂」第七十七代堂主。她性格古灵精怪、活泼俏皮，喜欢作诗和恶作剧，但对生死有着成熟豁达的理解。外形以黑红服饰、礼帽和梅花装饰为特色，神秘又可爱。',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'itachi',
    displayName: 'Itachi',
    description: 'A calm shinobi strategist companion with red eyes and black cloak.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'jollio',
    displayName: 'Jollio',
    description: 'A chubby pure white English bulldog DJ wearing pink headphones.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'kafka',
    displayName: 'Kafka',
    description:
      "A compact chibi pet inspired by the user's FFXIV character, with magenta hair, round goggles, pink eyes, and a black-white adventurer outfit.",
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'kaguya',
    displayName: 'Kaguya',
    description: 'A tiny chibi Cosmic Princess Kaguya companion with moon-rabbit details and bright festival robes.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'kid-goku-classic-actions',
    displayName: 'Kid Goku',
    description: 'A tiny Codex pet based on kid Son Goku with classic Dragon Ball actions.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
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
    id: 'kun',
    displayName: 'Kun',
    description: 'A compact Codex table pet dancer named Kun with basketball dance poses.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'labubu-classic',
    displayName: 'Labubu Classic',
    description: 'La bu bu, labu labu, la bubu ~',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'little-ameath',
    displayName: 'Little Ameath',
    description: 'A tiny pink winged pixel chibi companion with crystalline blue-white wings and a halo ornament.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'luffy',
    displayName: 'Luffy',
    description: 'A tiny straw-hat pirate companion with cheerful rubbery energy.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'lulu',
    displayName: 'Lulu',
    description: 'A tiny yellow capybara-like Codex digital pet.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'luminer',
    displayName: '荧',
    description: '原神旅行者荧风格的可爱 chibi 桌面宠物，金发、白金旅装、轻盈坚定。',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'maomao',
    displayName: '大开门',
    description:
      'A compact calico cat companion wearing a blue crocheted cat-ear bonnet with a tiny yellow flower and dangling blue ties.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'mini-elon',
    displayName: 'Mini Elon',
    description: 'What did you get done today?',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'mini-sama',
    displayName: 'Mini Sama',
    description: 'A funny pixel-sprite Sama-inspired pet with anxious energy.',
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
    id: 'nezuko',
    displayName: 'Nezuko',
    description: 'A cute Codex digital pet inspired by Nezuko Kamado.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'nezukocoder',
    displayName: 'NezukoCoder',
    description: 'A chibi Nezuko-inspired coding companion typing on a laptop with a simple OpenAI emblem.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'nika',
    displayName: 'Nika',
    description:
      'A chibi rubber pirate pet with straw hat energy, Gear Five white-hair poses, and a comically full meat-belly reaction.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'nimbus',
    displayName: 'Nimbus',
    description: 'A tiny chibi martial-arts kid riding a golden cloud.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'ninja-naru',
    displayName: 'Ninja Naru',
    description: 'A compact chibi blond orange-clad ninja digital pet.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'noir-maid',
    displayName: 'Noir Maid',
    description: 'A tiny chibi elf in a black-and-white maid outfit.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'palantir-patrick',
    displayName: 'Palantir Patrick',
    description: 'A compact pixel pet based on Patrick wearing a Palantir cap.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'phrat',
    displayName: 'PHRAT',
    description:
      'A tiny angelic demon schoolgirl digital pet with pink twin-tails, black bows, a gold broken halo, sharp grin, white shirt, black vest, red tie, and backpack.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'professor-puff',
    displayName: 'Professor Puff',
    description: 'A tiny Codex-style scientist pet inspired by Albert Einstein.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'ricklet',
    displayName: 'Ricklet',
    description: 'A tiny chaotic scientist companion inspired by Rick Sanchez.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'rx-78-2-gundam',
    displayName: 'RX-78-2 Gundam',
    description:
      'A compact Codex pet version of the classic white, blue, red, and yellow RX-78-2 style mecha with V-fin helmet, yellow eyes, shoulder cannons, red feet, and a handheld beam rifle.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'savage-codex-hacker',
    displayName: 'Codex Hacker',
    description: 'A smug little Codex logo mascot wearing pixel shades.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'shinchan',
    displayName: 'Shinchan',
    description: 'A tiny mischievous kindergarten-boy companion.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'snoopy',
    displayName: 'Snoopy',
    description: 'A tiny black-and-white beagle with a red collar for calm coding sessions.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'steve',
    displayName: 'Steve',
    description: 'Minecraft风格Steve形象的像素风Codex宠物，方块头，棕发，浅棕肤色，青蓝上衣，深蓝裤子，灰色鞋子。',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'steve-jobs',
    displayName: 'Steve Jobs',
    description: 'A tiny pixel-art Steve Jobs companion in a black turtleneck, jeans, glasses, and sneakers.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'sun-wukong',
    displayName: 'Sun Wukong',
    description: 'A compact Codex digital pet of Sun Wukong, the Monkey King.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'takagi',
    displayName: '高木同学',
    description:
      'A custom Codex pet inspired by Takagi, with long chestnut hair, a red winter coat, and a cream-and-tan plush cat.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'takagi-san',
    displayName: '高木',
    description: '带有高木同学标志性捉弄感咧嘴笑的 Q 版桌宠。',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'teemo',
    displayName: 'Teemo',
    description: 'Captain Teemo on duty.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'tom',
    displayName: 'Tom',
    description: 'A confident blue-gray chibi cat companion.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'animal',
  },
  {
    id: 'totoro',
    displayName: 'Totoro',
    description: 'A pointy-eared chinchilla digital pet inspired by the reference.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'trump',
    displayName: 'Trump',
    description: 'A small smooth-edged digital pet caricature.',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'ultra',
    displayName: 'Ultra',
    description: 'A compact Ultraman-inspired silver-and-red tokusatsu hero pet.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'vault-boy',
    displayName: 'Vault Boy',
    description:
      'A cheerful retro vault mascot pet with blond hair, a blue jumpsuit, yellow trim, and task-specific thumbs-up and wrist-computer poses.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'xiao-zhu',
    displayName: '小渚',
    description: 'A cute, gentle Codex digital pet inspired by a school-uniform anime heroine reference.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'xiaoxilian',
    displayName: '小昔涟',
    description: '翁法罗斯里的记忆的孩子。',
    spritesheetPath: 'spritesheet.webp',
    kind: 'person',
  },
  {
    id: 'yuki',
    displayName: 'Yuki',
    description: 'A tiny gothic chibi desk companion with long dark hair, white hair clips, a black dress, and choker.',
    spritesheetPath: 'spritesheet.webp',
  },
  {
    id: 'zoro',
    displayName: 'Zoro',
    description:
      'A tiny chibi three-sword pirate swordsman pet with green hair, one closed scarred left eye, a handle-bitten mouth sword, and one purple left-hand sword.',
    spritesheetPath: 'spritesheet.webp',
  },
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
