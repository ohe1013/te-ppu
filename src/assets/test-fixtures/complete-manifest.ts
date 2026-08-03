import type { AssetManifestV1 } from '../types';

export const COMPLETE_ASSET_MANIFEST = {
  schemaVersion: 1,
  mode: 'assets',
  brand: { logo: { path: 'brand/app-logo.png' } },
  common: {
    backgrounds: { tower: { path: 'backgrounds/tower-exterior.webp' } },
    characters: {
      'hero-engineer': {
        fullArt: { path: 'characters/hero-engineer/full.webp' },
        portraits: {
          idle: { path: 'characters/hero-engineer/portrait-idle.webp' },
          focus: { path: 'characters/hero-engineer/portrait-focus.webp' },
          attack: { path: 'characters/hero-engineer/portrait-attack.webp' },
          hit: { path: 'characters/hero-engineer/portrait-hit.webp' },
          win: { path: 'characters/hero-engineer/portrait-win.webp' },
          loss: { path: 'characters/hero-engineer/portrait-loss.webp' },
        },
      },
      'owl-companion': {
        fullArt: { path: 'characters/owl-companion/full.webp' },
        portraits: {
          idle: { path: 'characters/owl-companion/portrait-idle.webp' },
          worry: { path: 'characters/owl-companion/portrait-worry.webp' },
          cheer: { path: 'characters/owl-companion/portrait-cheer.webp' },
        },
      },
    },
    tiles: {
      I: { path: 'blocks/tile-i.png' }, J: { path: 'blocks/tile-j.png' },
      L: { path: 'blocks/tile-l.png' }, O: { path: 'blocks/tile-o.png' },
      S: { path: 'blocks/tile-s.png' }, T: { path: 'blocks/tile-t.png' },
      Z: { path: 'blocks/tile-z.png' }, garbage: { path: 'blocks/garbage.png' },
    },
    items: {
      'row-clear': { path: 'items/row-clear.png' },
      freeze: { path: 'items/freeze.png' },
      'queue-swap': { path: 'items/queue-swap.png' },
    },
    icons: {
      rotate: { path: 'ui/rotate.svg' },
      settings: { path: 'ui/settings.svg' },
      'sound-on': { path: 'ui/sound-on.svg' },
      'sound-off': { path: 'ui/sound-off.svg' },
      'haptics-on': { path: 'ui/haptics-on.svg' },
      'haptics-off': { path: 'ui/haptics-off.svg' },
      exit: { path: 'ui/exit.svg' },
    },
    atlas: {
      image: { path: 'effects/battle-atlas.png' },
      data: { path: 'effects/battle-atlas.json' },
    },
    audio: {
      sfx: {
        move: { path: 'audio/sfx/move.mp3' },
        rotate: { path: 'audio/sfx/rotate.mp3' },
        land: { path: 'audio/sfx/land.mp3' },
        clear: { path: 'audio/sfx/clear.mp3' },
        attack: { path: 'audio/sfx/attack.mp3' },
        item: { path: 'audio/sfx/item.mp3' },
        win: { path: 'audio/sfx/win.mp3' },
        loss: { path: 'audio/sfx/loss.mp3' },
      },
      bgm: {
        tower: { path: 'audio/bgm/tower.mp3' },
        'early-floors': { path: 'audio/bgm/early-floors.mp3' },
        'late-floors': { path: 'audio/bgm/late-floors.mp3' },
        'demon-king': { path: 'audio/bgm/demon-king.mp3' },
        ending: { path: 'audio/bgm/ending.mp3' },
      },
    },
  },
  floors: {
    '1': {
      opponent: 'quartermaster', music: 'early-floors',
      background: { path: 'backgrounds/floor-01.webp' },
      character: {
        fullArt: { path: 'characters/quartermaster/full.webp' },
        portraits: {
          idle: { path: 'characters/quartermaster/portrait-idle.webp' },
          smug: { path: 'characters/quartermaster/portrait-smug.webp' },
          attack: { path: 'characters/quartermaster/portrait-attack.webp' },
          hit: { path: 'characters/quartermaster/portrait-hit.webp' },
          panic: { path: 'characters/quartermaster/portrait-panic.webp' },
          defeat: { path: 'characters/quartermaster/portrait-defeat.webp' },
        },
      },
    },
    '2': {
      opponent: 'alchemist', music: 'early-floors',
      background: { path: 'backgrounds/floor-02.webp' },
      character: {
        fullArt: { path: 'characters/alchemist/full.webp' },
        portraits: {
          idle: { path: 'characters/alchemist/portrait-idle.webp' },
          smug: { path: 'characters/alchemist/portrait-smug.webp' },
          attack: { path: 'characters/alchemist/portrait-attack.webp' },
          hit: { path: 'characters/alchemist/portrait-hit.webp' },
          panic: { path: 'characters/alchemist/portrait-panic.webp' },
          defeat: { path: 'characters/alchemist/portrait-defeat.webp' },
        },
      },
    },
    '3': {
      opponent: 'guard-captain', music: 'late-floors',
      background: { path: 'backgrounds/floor-03.webp' },
      character: {
        fullArt: { path: 'characters/guard-captain/full.webp' },
        portraits: {
          idle: { path: 'characters/guard-captain/portrait-idle.webp' },
          smug: { path: 'characters/guard-captain/portrait-smug.webp' },
          attack: { path: 'characters/guard-captain/portrait-attack.webp' },
          hit: { path: 'characters/guard-captain/portrait-hit.webp' },
          panic: { path: 'characters/guard-captain/portrait-panic.webp' },
          defeat: { path: 'characters/guard-captain/portrait-defeat.webp' },
        },
      },
    },
    '4': {
      opponent: 'dark-engineer', music: 'late-floors',
      background: { path: 'backgrounds/floor-04.webp' },
      character: {
        fullArt: { path: 'characters/dark-engineer/full.webp' },
        portraits: {
          idle: { path: 'characters/dark-engineer/portrait-idle.webp' },
          smug: { path: 'characters/dark-engineer/portrait-smug.webp' },
          attack: { path: 'characters/dark-engineer/portrait-attack.webp' },
          hit: { path: 'characters/dark-engineer/portrait-hit.webp' },
          panic: { path: 'characters/dark-engineer/portrait-panic.webp' },
          defeat: { path: 'characters/dark-engineer/portrait-defeat.webp' },
        },
      },
    },
    '5': {
      opponent: 'demon-king', music: 'demon-king',
      background: { path: 'backgrounds/floor-05.webp' },
      character: {
        fullArt: { path: 'characters/demon-king/full.webp' },
        portraits: {
          idle: { path: 'characters/demon-king/portrait-idle.webp' },
          attack: { path: 'characters/demon-king/portrait-attack.webp' },
          hit: { path: 'characters/demon-king/portrait-hit.webp' },
          rage: { path: 'characters/demon-king/portrait-rage.webp' },
          defeat: { path: 'characters/demon-king/portrait-defeat.webp' },
        },
      },
    },
  },
} as const satisfies AssetManifestV1;
