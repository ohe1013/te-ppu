import type {
  AssetManifestV1,
  FloorOpponentId,
  ManifestRef,
} from './types';
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

function parseFloor(
  value: unknown,
  opponent: FloorOpponentId,
  music: MusicTrack,
  portraitIds: readonly string[],
) {
  const floor = exactObject(value, ['opponent', 'music', 'background', 'character']);
  exactString(floor.opponent, opponent);
  exactString(floor.music, music);
  return {
    opponent,
    music,
    background: parseRef(floor.background),
    character: parseCharacter(floor.character, portraitIds),
  };
}

export function parseAssetManifest(value: unknown): AssetManifestV1 {
  if (!isPlainObject(value)) invalid();
  const manifest = value;

  if (manifest.schemaVersion !== 1) invalid();
  if (manifest.mode === 'procedural-fallback') {
    exactObject(value, ['schemaVersion', 'mode']);
    return { schemaVersion: 1, mode: 'procedural-fallback' };
  }
  if (manifest.mode !== 'assets') invalid();

  const authored = exactObject(value, ['schemaVersion', 'mode', 'brand', 'common', 'floors']);
  const brand = exactObject(authored.brand, ['logo']);
  const common = exactObject(authored.common, [
    'backgrounds', 'characters', 'tiles', 'items', 'icons', 'atlas', 'audio',
  ]);
  const backgrounds = exactObject(common.backgrounds, ['tower']);
  const characters = exactObject(common.characters, ['hero-engineer', 'owl-companion']);
  const atlas = exactObject(common.atlas, ['image', 'data']);
  const audio = exactObject(common.audio, ['sfx', 'bgm']);
  const floors = exactObject(authored.floors, ['1', '2', '3', '4', '5']);

  return {
    schemaVersion: 1,
    mode: 'assets',
    brand: { logo: parseRef(brand.logo) },
    common: {
      backgrounds: { tower: parseRef(backgrounds.tower) },
      characters: {
        'hero-engineer': parseCharacter(characters['hero-engineer'], HERO_PORTRAITS),
        'owl-companion': parseCharacter(characters['owl-companion'], OWL_PORTRAITS),
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
      '1': parseFloor(floors['1'], 'quartermaster', 'early-floors', LIEUTENANT_PORTRAITS),
      '2': parseFloor(floors['2'], 'alchemist', 'early-floors', LIEUTENANT_PORTRAITS),
      '3': parseFloor(floors['3'], 'guard-captain', 'late-floors', LIEUTENANT_PORTRAITS),
      '4': parseFloor(floors['4'], 'dark-engineer', 'late-floors', LIEUTENANT_PORTRAITS),
      '5': parseFloor(floors['5'], 'demon-king', 'demon-king', DEMON_KING_PORTRAITS),
    },
  } as AssetManifestV1;
}
