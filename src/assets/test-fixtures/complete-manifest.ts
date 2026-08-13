import type { AssetManifestV1 } from '../types';

const ref = (path: string) => ({ path });

function lieutenant(character: string) {
  return {
    fullArt: ref(`characters/${character}/full.webp`),
    portraits: {
      idle: ref(`characters/${character}/portrait-idle.webp`),
      smug: ref(`characters/${character}/portrait-smug.webp`),
      attack: ref(`characters/${character}/portrait-attack.webp`),
      hit: ref(`characters/${character}/portrait-hit.webp`),
      panic: ref(`characters/${character}/portrait-panic.webp`),
      defeat: ref(`characters/${character}/portrait-defeat.webp`),
    },
  } as const;
}

function player(character: string) {
  return {
    fullArt: ref(`characters/${character}/full.webp`),
    portraits: {
      idle: ref(`characters/${character}/portrait-idle.webp`),
      focus: ref(`characters/${character}/portrait-focus.webp`),
      attack: ref(`characters/${character}/portrait-attack.webp`),
      hit: ref(`characters/${character}/portrait-hit.webp`),
      win: ref(`characters/${character}/portrait-win.webp`),
      loss: ref(`characters/${character}/portrait-loss.webp`),
    },
  } as const;
}

function demonKing() {
  return {
    fullArt: ref('characters/demon-king/full.webp'),
    portraits: {
      idle: ref('characters/demon-king/portrait-idle.webp'),
      attack: ref('characters/demon-king/portrait-attack.webp'),
      hit: ref('characters/demon-king/portrait-hit.webp'),
      rage: ref('characters/demon-king/portrait-rage.webp'),
      defeat: ref('characters/demon-king/portrait-defeat.webp'),
    },
  } as const;
}

export const COMPLETE_ASSET_MANIFEST = {
  schemaVersion: 3,
  mode: 'assets',
  brand: { logo: { path: 'brand/app-logo.png' } },
  common: {
    backgrounds: { tower: { path: 'backgrounds/tower-exterior.webp' } },
    characters: {
      'hero-engineer': player('hero-engineer'),
      'cloud-courier': player('cloud-courier'),
      'star-alchemist': player('star-alchemist'),
      'owl-companion': {
        fullArt: { path: 'characters/owl-companion/full.webp' },
        portraits: {
          idle: { path: 'characters/owl-companion/portrait-idle.webp' },
          worry: { path: 'characters/owl-companion/portrait-worry.webp' },
          cheer: { path: 'characters/owl-companion/portrait-cheer.webp' },
        },
      },
      quartermaster: lieutenant('quartermaster'),
      alchemist: lieutenant('alchemist'),
      'guard-captain': lieutenant('guard-captain'),
      'dark-engineer': lieutenant('dark-engineer'),
      'clock-moth': lieutenant('clock-moth'),
      'glass-oracle': lieutenant('glass-oracle'),
      'moss-golem': lieutenant('moss-golem'),
      'spark-slime': lieutenant('spark-slime'),
      'frost-smith': lieutenant('frost-smith'),
      'storm-harpy': lieutenant('storm-harpy'),
      'brass-minotaur': lieutenant('brass-minotaur'),
      'cinder-witch': lieutenant('cinder-witch'),
      'chain-knight': lieutenant('chain-knight'),
      'night-archivist': lieutenant('night-archivist'),
      'demon-king': demonKing(),
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
      music: 'early-floors',
      background: { path: 'backgrounds/floor-01.webp' },
      encounters: ['quartermaster', 'clock-moth', 'moss-golem'],
    },
    '2': {
      music: 'early-floors',
      background: { path: 'backgrounds/floor-02.webp' },
      encounters: ['alchemist', 'glass-oracle', 'spark-slime'],
    },
    '3': {
      music: 'late-floors',
      background: { path: 'backgrounds/floor-03.webp' },
      encounters: ['guard-captain', 'frost-smith', 'storm-harpy'],
    },
    '4': {
      music: 'late-floors',
      background: { path: 'backgrounds/floor-04.webp' },
      encounters: ['dark-engineer', 'brass-minotaur', 'cinder-witch'],
    },
    '5': {
      music: 'demon-king',
      background: { path: 'backgrounds/floor-05.webp' },
      encounters: ['chain-knight', 'night-archivist', 'demon-king'],
    },
  },
} as const satisfies AssetManifestV1;
