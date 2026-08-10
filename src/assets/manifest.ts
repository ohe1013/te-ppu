import type {
  AssetManifest,
  FloorOpponentId,
  ManifestRef,
} from './types';
import { PLAYER_CHARACTER_IDS } from '../player';
import type { MusicTrack } from '../platform/audio-port';

const RUNTIME_ASSET_PATH =
  /^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$/;

const TILE_IDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'garbage'] as const;
const ITEM_IDS = ['row-clear', 'freeze', 'queue-swap'] as const;
const ICON_IDS = [
  'rotate', 'settings', 'sound-on', 'sound-off', 'haptics-on', 'haptics-off', 'exit',
] as const;
const SOUND_CUES = ['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss'] as const;
const MUSIC_TRACKS = ['tower', 'early-floors', 'late-floors', 'demon-king', 'ending'] as const;
const HERO_PORTRAITS = ['idle', 'focus', 'attack', 'hit', 'win', 'loss'] as const;
const OWL_PORTRAITS = ['idle', 'worry', 'cheer'] as const;
const LIEUTENANT_PORTRAITS = ['idle', 'smug', 'attack', 'hit', 'panic', 'defeat'] as const;
const DEMON_KING_PORTRAITS = ['idle', 'attack', 'hit', 'rage', 'defeat'] as const;
const RIVAL_IDS = [
  'quartermaster', 'alchemist', 'guard-captain', 'dark-engineer',
  'clock-moth', 'glass-oracle', 'moss-golem', 'demon-king',
] as const satisfies readonly FloorOpponentId[];

type UnknownRecord = Record<string, unknown>;

function invalid(): never {
  throw new TypeError('Invalid asset manifest.');
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value: unknown, keys: readonly string[]): UnknownRecord {
  if (!isPlainObject(value)) invalid();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) invalid();
  return value;
}

function exactString(value: unknown, literal: string): string {
  if (value !== literal) invalid();
  return literal;
}

function parseRef(value: unknown): ManifestRef {
  const ref = exactObject(value, ['path']);
  const path = ref.path;
  if (typeof path !== 'string') invalid();
  if (
    /[^\x00-\x7F]/.test(path)
    || path.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(path)
    || path.includes('\\')
    || path.includes('_')
    || path.includes('?')
    || path.includes('#')
  ) invalid();
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    invalid();
  }
  if (!RUNTIME_ASSET_PATH.test(path)) invalid();
  return { path };
}

function parseRefs<K extends string>(
  value: unknown,
  keys: readonly K[],
): Readonly<Record<K, ManifestRef>> {
  const refs = exactObject(value, keys);
  const parsed = {} as Record<K, ManifestRef>;
  for (const key of keys) parsed[key] = parseRef(refs[key]);
  return parsed;
}

function parseCharacter<K extends string>(
  value: unknown,
  portraitIds: readonly K[],
): { readonly fullArt: ManifestRef; readonly portraits: Readonly<Record<K, ManifestRef>> } {
  const character = exactObject(value, ['fullArt', 'portraits']);
  return {
    fullArt: parseRef(character.fullArt),
    portraits: parseRefs(character.portraits, portraitIds),
  };
}

function parseEncounterIds(value: unknown): readonly [FloorOpponentId, FloorOpponentId, FloorOpponentId] {
  if (!Array.isArray(value) || value.length !== 3) invalid();
  const ids = value.map((candidate) => {
    if (typeof candidate !== 'string' || !RIVAL_IDS.includes(candidate as FloorOpponentId)) invalid();
    return candidate as FloorOpponentId;
  });
  if (new Set(ids).size !== 3) invalid();
  return ids as [FloorOpponentId, FloorOpponentId, FloorOpponentId];
}

function parseFloor(value: unknown, music: MusicTrack) {
  const floor = exactObject(value, ['background', 'music', 'encounters']);
  exactString(floor.music, music);
  return {
    background: parseRef(floor.background),
    music,
    encounters: parseEncounterIds(floor.encounters),
  };
}

export function parseAssetManifest(value: unknown): AssetManifest {
  if (!isPlainObject(value)) invalid();
  const manifest = value;

  if (manifest.mode === 'procedural-fallback') {
    exactObject(value, ['schemaVersion', 'mode']);
    if (manifest.schemaVersion !== 1) invalid();
    return { schemaVersion: 1, mode: 'procedural-fallback' };
  }
  if (manifest.schemaVersion !== 3 || manifest.mode !== 'assets') invalid();

  const authored = exactObject(value, ['schemaVersion', 'mode', 'brand', 'common', 'floors']);
  const brand = exactObject(authored.brand, ['logo']);
  const common = exactObject(authored.common, [
    'backgrounds', 'characters', 'tiles', 'items', 'icons', 'atlas', 'audio',
  ]);
  const backgrounds = exactObject(common.backgrounds, ['tower']);
  const characters = exactObject(common.characters, [
    ...PLAYER_CHARACTER_IDS, 'owl-companion', ...RIVAL_IDS,
  ]);
  const atlas = exactObject(common.atlas, ['image', 'data']);
  const audio = exactObject(common.audio, ['sfx', 'bgm']);
  const floors = exactObject(authored.floors, ['1', '2', '3', '4', '5']);

  return {
    schemaVersion: 3,
    mode: 'assets',
    brand: { logo: parseRef(brand.logo) },
    common: {
      backgrounds: { tower: parseRef(backgrounds.tower) },
      characters: {
        ...Object.fromEntries(PLAYER_CHARACTER_IDS.map((characterId) => [
          characterId,
          parseCharacter(characters[characterId], HERO_PORTRAITS),
        ])),
        'owl-companion': parseCharacter(characters['owl-companion'], OWL_PORTRAITS),
        quartermaster: parseCharacter(characters.quartermaster, LIEUTENANT_PORTRAITS),
        alchemist: parseCharacter(characters.alchemist, LIEUTENANT_PORTRAITS),
        'guard-captain': parseCharacter(characters['guard-captain'], LIEUTENANT_PORTRAITS),
        'dark-engineer': parseCharacter(characters['dark-engineer'], LIEUTENANT_PORTRAITS),
        'clock-moth': parseCharacter(characters['clock-moth'], LIEUTENANT_PORTRAITS),
        'glass-oracle': parseCharacter(characters['glass-oracle'], LIEUTENANT_PORTRAITS),
        'moss-golem': parseCharacter(characters['moss-golem'], LIEUTENANT_PORTRAITS),
        'demon-king': parseCharacter(characters['demon-king'], DEMON_KING_PORTRAITS),
      },
      tiles: parseRefs(common.tiles, TILE_IDS),
      items: parseRefs(common.items, ITEM_IDS),
      icons: parseRefs(common.icons, ICON_IDS),
      atlas: { image: parseRef(atlas.image), data: parseRef(atlas.data) },
      audio: {
        sfx: parseRefs(audio.sfx, SOUND_CUES),
        bgm: parseRefs(audio.bgm, MUSIC_TRACKS),
      },
    },
    floors: {
      '1': parseFloor(floors['1'], 'early-floors'),
      '2': parseFloor(floors['2'], 'early-floors'),
      '3': parseFloor(floors['3'], 'late-floors'),
      '4': parseFloor(floors['4'], 'late-floors'),
      '5': parseFloor(floors['5'], 'demon-king'),
    },
  } as AssetManifest;
}
