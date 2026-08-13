import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_RUNTIME_BYTES = 30 * 1024 * 1024;
const MAX_SVG_BYTES = 64 * 1024;
const RUNTIME_PATH = /^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$/;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const decoder = new TextDecoder('utf-8', { fatal: true });
const TILE_IDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z', 'garbage'];
const ITEM_IDS = ['row-clear', 'freeze', 'queue-swap'];
const ICON_IDS = ['rotate', 'settings', 'sound-on', 'sound-off', 'haptics-on', 'haptics-off', 'exit'];
const SFX_IDS = ['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss'];
const BGM_IDS = ['tower', 'early-floors', 'late-floors', 'demon-king', 'ending'];
const HERO_PORTRAITS = ['idle', 'focus', 'attack', 'hit', 'win', 'loss'];
const PLAYER_IDS = ['hero-engineer', 'cloud-courier', 'star-alchemist'];
const OWL_PORTRAITS = ['idle', 'worry', 'cheer'];
const LIEUTENANT_PORTRAITS = ['idle', 'smug', 'attack', 'hit', 'panic', 'defeat'];
const DEMON_PORTRAITS = ['idle', 'attack', 'hit', 'rage', 'defeat'];
const ATLAS_GROUPS = [
  ['move-dust', 4, 64, 64],
  ['rotate-spark', 5, 64, 64],
  ['land-impact', 5, 128, 64],
  ['line-clear', 6, 640, 64],
  ['attack-shot', 6, 64, 64],
  ['garbage-land', 5, 128, 64],
  ['item-acquire', 8, 128, 128],
  ['freeze-overlay', 8, 64, 64],
  ['combo-pop', 6, 256, 128],
];
const CANONICAL_ASSET_PATHS = [
  ['asset manifest.brand.logo', 'brand/app-logo.png'],
  ['asset manifest.common.backgrounds.tower', 'backgrounds/tower-exterior.webp'],
  ['asset manifest.common.characters.hero-engineer.fullArt', 'characters/hero-engineer/full.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.idle', 'characters/hero-engineer/portrait-idle.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.focus', 'characters/hero-engineer/portrait-focus.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.attack', 'characters/hero-engineer/portrait-attack.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.hit', 'characters/hero-engineer/portrait-hit.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.win', 'characters/hero-engineer/portrait-win.webp'],
  ['asset manifest.common.characters.hero-engineer.portraits.loss', 'characters/hero-engineer/portrait-loss.webp'],
  ['asset manifest.common.characters.cloud-courier.fullArt', 'characters/cloud-courier/full.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.idle', 'characters/cloud-courier/portrait-idle.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.focus', 'characters/cloud-courier/portrait-focus.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.attack', 'characters/cloud-courier/portrait-attack.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.hit', 'characters/cloud-courier/portrait-hit.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.win', 'characters/cloud-courier/portrait-win.webp'],
  ['asset manifest.common.characters.cloud-courier.portraits.loss', 'characters/cloud-courier/portrait-loss.webp'],
  ['asset manifest.common.characters.star-alchemist.fullArt', 'characters/star-alchemist/full.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.idle', 'characters/star-alchemist/portrait-idle.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.focus', 'characters/star-alchemist/portrait-focus.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.attack', 'characters/star-alchemist/portrait-attack.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.hit', 'characters/star-alchemist/portrait-hit.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.win', 'characters/star-alchemist/portrait-win.webp'],
  ['asset manifest.common.characters.star-alchemist.portraits.loss', 'characters/star-alchemist/portrait-loss.webp'],
  ['asset manifest.common.characters.owl-companion.fullArt', 'characters/owl-companion/full.webp'],
  ['asset manifest.common.characters.owl-companion.portraits.idle', 'characters/owl-companion/portrait-idle.webp'],
  ['asset manifest.common.characters.owl-companion.portraits.worry', 'characters/owl-companion/portrait-worry.webp'],
  ['asset manifest.common.characters.owl-companion.portraits.cheer', 'characters/owl-companion/portrait-cheer.webp'],
  ['asset manifest.common.characters.quartermaster.fullArt', 'characters/quartermaster/full.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.idle', 'characters/quartermaster/portrait-idle.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.smug', 'characters/quartermaster/portrait-smug.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.attack', 'characters/quartermaster/portrait-attack.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.hit', 'characters/quartermaster/portrait-hit.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.panic', 'characters/quartermaster/portrait-panic.webp'],
  ['asset manifest.common.characters.quartermaster.portraits.defeat', 'characters/quartermaster/portrait-defeat.webp'],
  ['asset manifest.common.characters.alchemist.fullArt', 'characters/alchemist/full.webp'],
  ['asset manifest.common.characters.alchemist.portraits.idle', 'characters/alchemist/portrait-idle.webp'],
  ['asset manifest.common.characters.alchemist.portraits.smug', 'characters/alchemist/portrait-smug.webp'],
  ['asset manifest.common.characters.alchemist.portraits.attack', 'characters/alchemist/portrait-attack.webp'],
  ['asset manifest.common.characters.alchemist.portraits.hit', 'characters/alchemist/portrait-hit.webp'],
  ['asset manifest.common.characters.alchemist.portraits.panic', 'characters/alchemist/portrait-panic.webp'],
  ['asset manifest.common.characters.alchemist.portraits.defeat', 'characters/alchemist/portrait-defeat.webp'],
  ['asset manifest.common.characters.guard-captain.fullArt', 'characters/guard-captain/full.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.idle', 'characters/guard-captain/portrait-idle.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.smug', 'characters/guard-captain/portrait-smug.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.attack', 'characters/guard-captain/portrait-attack.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.hit', 'characters/guard-captain/portrait-hit.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.panic', 'characters/guard-captain/portrait-panic.webp'],
  ['asset manifest.common.characters.guard-captain.portraits.defeat', 'characters/guard-captain/portrait-defeat.webp'],
  ['asset manifest.common.characters.dark-engineer.fullArt', 'characters/dark-engineer/full.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.idle', 'characters/dark-engineer/portrait-idle.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.smug', 'characters/dark-engineer/portrait-smug.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.attack', 'characters/dark-engineer/portrait-attack.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.hit', 'characters/dark-engineer/portrait-hit.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.panic', 'characters/dark-engineer/portrait-panic.webp'],
  ['asset manifest.common.characters.dark-engineer.portraits.defeat', 'characters/dark-engineer/portrait-defeat.webp'],
  ['asset manifest.common.characters.clock-moth.fullArt', 'characters/clock-moth/full.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.idle', 'characters/clock-moth/portrait-idle.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.smug', 'characters/clock-moth/portrait-smug.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.attack', 'characters/clock-moth/portrait-attack.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.hit', 'characters/clock-moth/portrait-hit.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.panic', 'characters/clock-moth/portrait-panic.webp'],
  ['asset manifest.common.characters.clock-moth.portraits.defeat', 'characters/clock-moth/portrait-defeat.webp'],
  ['asset manifest.common.characters.glass-oracle.fullArt', 'characters/glass-oracle/full.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.idle', 'characters/glass-oracle/portrait-idle.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.smug', 'characters/glass-oracle/portrait-smug.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.attack', 'characters/glass-oracle/portrait-attack.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.hit', 'characters/glass-oracle/portrait-hit.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.panic', 'characters/glass-oracle/portrait-panic.webp'],
  ['asset manifest.common.characters.glass-oracle.portraits.defeat', 'characters/glass-oracle/portrait-defeat.webp'],
  ['asset manifest.common.characters.moss-golem.fullArt', 'characters/moss-golem/full.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.idle', 'characters/moss-golem/portrait-idle.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.smug', 'characters/moss-golem/portrait-smug.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.attack', 'characters/moss-golem/portrait-attack.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.hit', 'characters/moss-golem/portrait-hit.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.panic', 'characters/moss-golem/portrait-panic.webp'],
  ['asset manifest.common.characters.moss-golem.portraits.defeat', 'characters/moss-golem/portrait-defeat.webp'],
  ...[
    'spark-slime', 'frost-smith', 'storm-harpy', 'brass-minotaur',
    'cinder-witch', 'chain-knight', 'night-archivist',
  ].flatMap((character) => [
    ['asset manifest.common.characters.' + character + '.fullArt', 'characters/' + character + '/full.webp'],
    ...LIEUTENANT_PORTRAITS.map((portrait) => [
      'asset manifest.common.characters.' + character + '.portraits.' + portrait,
      'characters/' + character + '/portrait-' + portrait + '.webp',
    ]),
  ]),
  ['asset manifest.common.characters.demon-king.fullArt', 'characters/demon-king/full.webp'],
  ['asset manifest.common.characters.demon-king.portraits.idle', 'characters/demon-king/portrait-idle.webp'],
  ['asset manifest.common.characters.demon-king.portraits.attack', 'characters/demon-king/portrait-attack.webp'],
  ['asset manifest.common.characters.demon-king.portraits.hit', 'characters/demon-king/portrait-hit.webp'],
  ['asset manifest.common.characters.demon-king.portraits.rage', 'characters/demon-king/portrait-rage.webp'],
  ['asset manifest.common.characters.demon-king.portraits.defeat', 'characters/demon-king/portrait-defeat.webp'],
  ['asset manifest.common.tiles.I', 'blocks/tile-i.png'],
  ['asset manifest.common.tiles.J', 'blocks/tile-j.png'],
  ['asset manifest.common.tiles.L', 'blocks/tile-l.png'],
  ['asset manifest.common.tiles.O', 'blocks/tile-o.png'],
  ['asset manifest.common.tiles.S', 'blocks/tile-s.png'],
  ['asset manifest.common.tiles.T', 'blocks/tile-t.png'],
  ['asset manifest.common.tiles.Z', 'blocks/tile-z.png'],
  ['asset manifest.common.tiles.garbage', 'blocks/garbage.png'],
  ['asset manifest.common.items.row-clear', 'items/row-clear.png'],
  ['asset manifest.common.items.freeze', 'items/freeze.png'],
  ['asset manifest.common.items.queue-swap', 'items/queue-swap.png'],
  ['asset manifest.common.icons.rotate', 'ui/rotate.svg'],
  ['asset manifest.common.icons.settings', 'ui/settings.svg'],
  ['asset manifest.common.icons.sound-on', 'ui/sound-on.svg'],
  ['asset manifest.common.icons.sound-off', 'ui/sound-off.svg'],
  ['asset manifest.common.icons.haptics-on', 'ui/haptics-on.svg'],
  ['asset manifest.common.icons.haptics-off', 'ui/haptics-off.svg'],
  ['asset manifest.common.icons.exit', 'ui/exit.svg'],
  ['asset manifest.common.atlas.image', 'effects/battle-atlas.png'],
  ['asset manifest.common.atlas.data', 'effects/battle-atlas.json'],
  ['asset manifest.common.audio.sfx.move', 'audio/sfx/move.mp3'],
  ['asset manifest.common.audio.sfx.rotate', 'audio/sfx/rotate.mp3'],
  ['asset manifest.common.audio.sfx.land', 'audio/sfx/land.mp3'],
  ['asset manifest.common.audio.sfx.clear', 'audio/sfx/clear.mp3'],
  ['asset manifest.common.audio.sfx.attack', 'audio/sfx/attack.mp3'],
  ['asset manifest.common.audio.sfx.item', 'audio/sfx/item.mp3'],
  ['asset manifest.common.audio.sfx.win', 'audio/sfx/win.mp3'],
  ['asset manifest.common.audio.sfx.loss', 'audio/sfx/loss.mp3'],
  ['asset manifest.common.audio.bgm.tower', 'audio/bgm/tower.mp3'],
  ['asset manifest.common.audio.bgm.early-floors', 'audio/bgm/early-floors.mp3'],
  ['asset manifest.common.audio.bgm.late-floors', 'audio/bgm/late-floors.mp3'],
  ['asset manifest.common.audio.bgm.demon-king', 'audio/bgm/demon-king.mp3'],
  ['asset manifest.common.audio.bgm.ending', 'audio/bgm/ending.mp3'],
  ['asset manifest.floors.1.background', 'backgrounds/floor-01.webp'],
  ['asset manifest.floors.2.background', 'backgrounds/floor-02.webp'],
  ['asset manifest.floors.3.background', 'backgrounds/floor-03.webp'],
  ['asset manifest.floors.4.background', 'backgrounds/floor-04.webp'],
  ['asset manifest.floors.5.background', 'backgrounds/floor-05.webp'],
];
const CANONICAL_PATH_BY_SLOT = new Map(CANONICAL_ASSET_PATHS);
const REQUIRED_UNIQUE_ASSET_COUNT = 169;

function fail(message) {
  throw new Error(message);
}

function portablePath(path) {
  return path.replaceAll('\\', '/');
}

function isPlainObject(value) {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, keys, context) {
  if (!isPlainObject(value)) fail('invalid ' + context);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) {
    fail('invalid ' + context);
  }
  return value;
}

function requireLiteral(value, expected, context) {
  if (value !== expected) fail('invalid ' + context);
}

function runtimePath(value) {
  if (typeof value !== 'string' || !RUNTIME_PATH.test(value)) {
    fail('invalid runtime asset path');
  }
  return value;
}

function canonicalAssetPath(context) {
  const path = CANONICAL_PATH_BY_SLOT.get(context);
  if (path === undefined) fail('missing canonical asset path table entry: ' + context);
  return path;
}

function collectRef(value, references, context) {
  const ref = exactObject(value, ['path'], context);
  const path = runtimePath(ref.path);
  if (path !== canonicalAssetPath(context)) {
    fail('invalid canonical asset path: ' + context);
  }
  references.push(path);
}

function collectRefs(value, keys, references, context) {
  const object = exactObject(value, keys, context);
  for (const key of keys) collectRef(object[key], references, context + '.' + key);
}

function collectCharacter(value, portraitIds, references, context) {
  const character = exactObject(value, ['fullArt', 'portraits'], context);
  collectRef(character.fullArt, references, context + '.fullArt');
  collectRefs(character.portraits, portraitIds, references, context + '.portraits');
}

const RIVAL_IDS = [
  'quartermaster', 'alchemist', 'guard-captain', 'dark-engineer',
  'clock-moth', 'glass-oracle', 'moss-golem', 'spark-slime',
  'frost-smith', 'storm-harpy', 'brass-minotaur', 'cinder-witch',
  'chain-knight', 'night-archivist', 'demon-king',
];

function collectEncounters(value, context) {
  if (!Array.isArray(value) || value.length !== 3) fail('invalid ' + context + '.encounters');
  for (const [index, encounter] of value.entries()) {
    if (typeof encounter !== 'string' || !RIVAL_IDS.includes(encounter)) {
      fail('invalid ' + context + '.encounters[' + index + ']');
    }
  }
  if (new Set(value).size !== 3) fail('invalid ' + context + '.encounters: duplicate encounter');
}

function collectFloor(value, music, references, context) {
  const floor = exactObject(value, ['music', 'background', 'encounters'], context);
  requireLiteral(floor.music, music, context + '.music');
  collectRef(floor.background, references, context + '.background');
  collectEncounters(floor.encounters, context);
}

function parseManifest(value) {
  if (!isPlainObject(value)) fail('invalid asset manifest');

  if (value.mode === 'procedural-fallback') {
    exactObject(value, ['schemaVersion', 'mode'], 'asset manifest');
    requireLiteral(value.schemaVersion, 1, 'asset manifest.schemaVersion');
    return { mode: 'procedural-fallback', references: [] };
  }
  if (value.schemaVersion !== 3 || value.mode !== 'assets') fail('invalid asset manifest');

  const manifest = exactObject(value, ['schemaVersion', 'mode', 'brand', 'common', 'floors'], 'asset manifest');
  const references = [];
  const brand = exactObject(manifest.brand, ['logo'], 'asset manifest.brand');
  collectRef(brand.logo, references, 'asset manifest.brand.logo');

  const common = exactObject(
    manifest.common,
    ['backgrounds', 'characters', 'tiles', 'items', 'icons', 'atlas', 'audio'],
    'asset manifest.common',
  );
  const backgrounds = exactObject(common.backgrounds, ['tower'], 'asset manifest.common.backgrounds');
  collectRef(backgrounds.tower, references, 'asset manifest.common.backgrounds.tower');
  const characters = exactObject(
    common.characters,
    [...PLAYER_IDS, 'owl-companion', ...RIVAL_IDS],
    'asset manifest.common.characters',
  );
  for (const player of PLAYER_IDS) {
    collectCharacter(
      characters[player],
      HERO_PORTRAITS,
      references,
      'asset manifest.common.characters.' + player,
    );
  }
  collectCharacter(characters['owl-companion'], OWL_PORTRAITS, references, 'asset manifest.common.characters.owl-companion');
  for (const rival of RIVAL_IDS) {
    collectCharacter(
      characters[rival],
      rival === 'demon-king' ? DEMON_PORTRAITS : LIEUTENANT_PORTRAITS,
      references,
      'asset manifest.common.characters.' + rival,
    );
  }
  collectRefs(common.tiles, TILE_IDS, references, 'asset manifest.common.tiles');
  collectRefs(common.items, ITEM_IDS, references, 'asset manifest.common.items');
  collectRefs(common.icons, ICON_IDS, references, 'asset manifest.common.icons');
  const atlas = exactObject(common.atlas, ['image', 'data'], 'asset manifest.common.atlas');
  collectRef(atlas.image, references, 'asset manifest.common.atlas.image');
  collectRef(atlas.data, references, 'asset manifest.common.atlas.data');
  const audio = exactObject(common.audio, ['sfx', 'bgm'], 'asset manifest.common.audio');
  collectRefs(audio.sfx, SFX_IDS, references, 'asset manifest.common.audio.sfx');
  collectRefs(audio.bgm, BGM_IDS, references, 'asset manifest.common.audio.bgm');

  const floors = exactObject(manifest.floors, ['1', '2', '3', '4', '5'], 'asset manifest.floors');
  collectFloor(floors['1'], 'early-floors', references, 'asset manifest.floors.1');
  collectFloor(floors['2'], 'early-floors', references, 'asset manifest.floors.2');
  collectFloor(floors['3'], 'late-floors', references, 'asset manifest.floors.3');
  collectFloor(floors['4'], 'late-floors', references, 'asset manifest.floors.4');
  collectFloor(floors['5'], 'demon-king', references, 'asset manifest.floors.5');
  if (
    references.length !== REQUIRED_UNIQUE_ASSET_COUNT
    || new Set(references).size !== REQUIRED_UNIQUE_ASSET_COUNT
  ) {
    fail('invalid asset manifest required unique asset count');
  }
  return { mode: 'assets', references };
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, path));
    } else if (entry.isFile()) {
      const info = await stat(path);
      files.push({
        path,
        relativePath: portablePath(relative(root, path)),
        size: info.size,
      });
    }
  }
  return files;
}

function assertPngSignature(bytes, label) {
  if (bytes.length < PNG_SIGNATURE.length) fail('invalid PNG ' + label);
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) fail('invalid PNG ' + label);
  }
}

function parsePng(bytes, label) {
  assertPngSignature(bytes, label);
  let offset = PNG_SIGNATURE.length;
  let header = null;
  let hasTransparencyChunk = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) fail('PNG chunk crosses EOF: ' + label);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) fail('PNG chunk crosses EOF: ' + label);
    if (type === 'IHDR') {
      if (header !== null || length !== 13) fail('invalid PNG IHDR ' + label);
      header = {
        width: bytes.readUInt32BE(dataStart),
        height: bytes.readUInt32BE(dataStart + 4),
        colorType: bytes[dataStart + 9],
      };
      if (header.width === 0 || header.height === 0) fail('invalid PNG dimensions ' + label);
    }
    if (type === 'tRNS') hasTransparencyChunk = true;
    offset = chunkEnd;
    if (type === 'IEND') break;
  }
  if (header === null) fail('missing PNG IHDR ' + label);
  return { ...header, hasTransparencyChunk };
}

function assertDimensions(image, width, height, label) {
  if (image.width !== width || image.height !== height) {
    fail('expected ' + label + ' to be ' + width + 'x' + height);
  }
}

function assertPngAlpha(image, label) {
  if (![4, 6].includes(image.colorType) && !image.hasTransparencyChunk) {
    fail('expected alpha support for ' + label);
  }
}

function assertOpaqueLogo(image) {
  if ([4, 6].includes(image.colorType) || image.hasTransparencyChunk) {
    fail('opaque logo must not carry alpha');
  }
}

function parseWebp(bytes, label) {
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    fail('invalid WebP ' + label);
  }
  const end = bytes.readUInt32LE(4) + 8;
  if (end > bytes.length || end < 12) fail('WebP chunk crosses EOF: ' + label);

  let offset = 12;
  let dimensions = null;
  let alpha = false;
  while (offset < end) {
    if (end - offset < 8) fail('WebP chunk crosses EOF: ' + label);
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const paddedLength = length + (length % 2);
    const chunkEnd = dataStart + paddedLength;
    if (chunkEnd > end || chunkEnd < dataStart) fail('WebP chunk crosses EOF: ' + label);
    if (type === 'VP8X') {
      if (length < 10) fail('invalid VP8X WebP ' + label);
      dimensions = {
        width: bytes.readUIntLE(dataStart + 4, 3) + 1,
        height: bytes.readUIntLE(dataStart + 7, 3) + 1,
      };
      alpha = alpha || (bytes[dataStart] & 0x10) !== 0;
    } else if (type === 'VP8 ') {
      if (length < 10 || bytes[dataStart + 3] !== 0x9d || bytes[dataStart + 4] !== 0x01 || bytes[dataStart + 5] !== 0x2a) {
        fail('invalid VP8 WebP ' + label);
      }
      dimensions = {
        width: bytes.readUInt16LE(dataStart + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataStart + 8) & 0x3fff,
      };
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[dataStart] !== 0x2f) fail('invalid VP8L WebP ' + label);
      const packed = bytes.readUInt32LE(dataStart + 1);
      dimensions = {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
      alpha = alpha || (packed & 0x10000000) !== 0;
    } else if (type === 'ALPH') {
      alpha = true;
    }
    offset = chunkEnd;
  }
  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) fail('missing WebP dimensions ' + label);
  return { ...dimensions, alpha };
}

function parseSvg(bytes, label) {
  if (bytes.length > MAX_SVG_BYTES) fail('SVG exceeds 64 KiB: ' + label);
  let source;
  try {
    source = decoder.decode(bytes);
  } catch {
    fail('invalid UTF-8 SVG: ' + label);
  }
  if (!/<\s*svg\b/i.test(source)) fail('invalid SVG: ' + label);
  const banned = [
    /<\s*script\b/i,
    /\son[a-z][a-z0-9:_-]*\s*=/i,
    /<\s*foreignobject\b/i,
    /<!\s*doctype\b/i,
    /<!\s*entity\b/i,
    /<\s*style\b/i,
    /<\s*text\b/i,
    /\bfont(?:[-:a-z]*)?\b/i,
    /\b(?:xlink:)?href\s*=/i,
  ];
  if (banned.some((pattern) => pattern.test(source))) fail('unsafe SVG: ' + label);
  for (const match of source.matchAll(/url\s*\(\s*([^)]*?)\s*\)/gi)) {
    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (!value.startsWith('#')) fail('unsafe SVG URL: ' + label);
  }
}

function bitrateKbps(version, layer, index) {
  const tables = {
    mpeg1: {
      3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
      2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
      1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    },
    mpeg2: {
      3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
      2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
      1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    },
  };
  return tables[version === 3 ? 'mpeg1' : 'mpeg2'][layer][index];
}

function sampleRate(version, index) {
  const base = [44100, 48000, 32000][index];
  if (base === undefined) return 0;
  if (version === 3) return base;
  if (version === 2) return base / 2;
  return base / 4;
}

function parseMp3(bytes, label) {
  let offset = 0;
  if (bytes.length >= 3 && bytes.toString('ascii', 0, 3) === 'ID3') {
    if (bytes.length < 10) fail('invalid ID3 header: ' + label);
    const synchsafe = [...bytes.subarray(6, 10)];
    if (synchsafe.some((value) => (value & 0x80) !== 0)) fail('invalid ID3 synchsafe size: ' + label);
    const size = (synchsafe[0] * 0x200000) + (synchsafe[1] * 0x4000) + (synchsafe[2] * 0x80) + synchsafe[3];
    offset = 10 + size;
    if (bytes[3] === 4 && (bytes[5] & 0x10) !== 0) offset += 10;
  }
  if (offset + 4 > bytes.length) fail('missing MPEG audio frame: ' + label);
  const first = bytes[offset];
  const second = bytes[offset + 1];
  const third = bytes[offset + 2];
  if (first !== 0xff || (second & 0xe0) !== 0xe0) fail('missing MPEG audio frame: ' + label);
  const version = (second >>> 3) & 0x03;
  const layer = (second >>> 1) & 0x03;
  const bitrateIndex = third >>> 4;
  const rateIndex = (third >>> 2) & 0x03;
  const padding = (third >>> 1) & 0x01;
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
    fail('invalid MPEG audio frame: ' + label);
  }
  const bitrate = bitrateKbps(version, layer, bitrateIndex);
  const rate = sampleRate(version, rateIndex);
  if (!bitrate || !rate) fail('invalid MPEG audio frame: ' + label);
  let frameLength;
  if (layer === 3) frameLength = Math.floor(((12 * bitrate * 1000) / rate + padding) * 4);
  else if (layer === 1 && version !== 3) frameLength = Math.floor((72 * bitrate * 1000) / rate) + padding;
  else frameLength = Math.floor((144 * bitrate * 1000) / rate) + padding;
  if (frameLength <= 0 || offset + frameLength > bytes.length) {
    fail('incomplete MPEG audio frame: ' + label);
  }
}

function exactPositiveInteger(value, context) {
  if (!Number.isInteger(value) || value <= 0) fail('invalid atlas ' + context);
  return value;
}

function nonNegativeInteger(value, context) {
  if (!Number.isInteger(value) || value < 0) fail('invalid atlas ' + context);
  return value;
}

function frameName(group, index) {
  return group + '/' + String(index).padStart(2, '0') + '.png';
}

function expectedAtlasFrames() {
  const names = [];
  for (const [group, count] of ATLAS_GROUPS) {
    for (let index = 0; index < count; index += 1) names.push(frameName(group, index));
  }
  return names;
}

function parseAtlas(bytes, image) {
  let value;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    fail('invalid atlas JSON');
  }
  const atlas = exactObject(value, ['frames', 'meta'], 'atlas');
  const frameNames = expectedAtlasFrames();
  const frames = exactObject(atlas.frames, frameNames, 'atlas frame names');
  const meta = exactObject(atlas.meta, ['image', 'format', 'scale', 'size'], 'atlas meta');
  requireLiteral(meta.image, 'battle-atlas.png', 'atlas meta.image');
  requireLiteral(meta.format, 'RGBA8888', 'atlas meta.format');
  requireLiteral(meta.scale, '1', 'atlas meta.scale');
  const size = exactObject(meta.size, ['w', 'h'], 'atlas meta.size');
  const atlasWidth = exactPositiveInteger(size.w, 'meta width');
  const atlasHeight = exactPositiveInteger(size.h, 'meta height');
  if (atlasWidth !== image.width || atlasHeight !== image.height) fail('atlas meta size does not match PNG');

  for (const [group, count, sourceWidth, sourceHeight] of ATLAS_GROUPS) {
    for (let index = 0; index < count; index += 1) {
      const name = frameName(group, index);
      const entry = exactObject(
        frames[name],
        ['frame', 'rotated', 'trimmed', 'spriteSourceSize', 'sourceSize'],
        'atlas frame ' + name,
      );
      if (entry.rotated !== false) fail('atlas frame rotated must be false: ' + name);
      if (typeof entry.trimmed !== 'boolean') fail('invalid atlas trim flag: ' + name);
      const frame = exactObject(entry.frame, ['x', 'y', 'w', 'h'], 'atlas frame rectangle ' + name);
      const sprite = exactObject(
        entry.spriteSourceSize,
        ['x', 'y', 'w', 'h'],
        'atlas spriteSourceSize ' + name,
      );
      const source = exactObject(entry.sourceSize, ['w', 'h'], 'atlas sourceSize ' + name);
      nonNegativeInteger(frame.x, 'frame x');
      nonNegativeInteger(frame.y, 'frame y');
      exactPositiveInteger(frame.w, 'frame width');
      exactPositiveInteger(frame.h, 'frame height');
      nonNegativeInteger(sprite.x, 'sprite source x');
      nonNegativeInteger(sprite.y, 'sprite source y');
      exactPositiveInteger(sprite.w, 'sprite source width');
      exactPositiveInteger(sprite.h, 'sprite source height');
      if (source.w !== sourceWidth || source.h !== sourceHeight) {
        fail('invalid atlas sourceSize: ' + name);
      }
      if (frame.w !== sprite.w || frame.h !== sprite.h) {
        fail('atlas frame must match spriteSourceSize dimensions: ' + name);
      }
      if (frame.x + frame.w > atlasWidth || frame.y + frame.h > atlasHeight) {
        fail('atlas frame outside image: ' + name);
      }
      if (!entry.trimmed && (
        sprite.x !== 0
        || sprite.y !== 0
        || frame.w !== source.w
        || frame.h !== source.h
        || sprite.w !== source.w
        || sprite.h !== source.h
      )) {
        fail('invalid untrimmed atlas frame: ' + name);
      }
      if (sprite.x + frame.w > source.w || sprite.y + frame.h > source.h) {
        fail('atlas spriteSourceSize outside sourceSize: ' + name);
      }
    }
  }
}

async function validateReferencedAssets(assetRoot, files, references) {
  const entries = new Map(files.map((file) => [file.relativePath, file]));
  for (const path of references) {
    if (!entries.has(path)) fail('missing referenced asset: ' + path);
  }

  const logo = parsePng(await readFile(entries.get('brand/app-logo.png').path), 'brand/app-logo.png');
  assertDimensions(logo, 600, 600, 'opaque logo');
  assertOpaqueLogo(logo);

  const atlasImagePath = 'effects/battle-atlas.png';
  const atlasImage = parsePng(await readFile(entries.get(atlasImagePath).path), atlasImagePath);
  assertPngAlpha(atlasImage, atlasImagePath);
  const atlasPath = 'effects/battle-atlas.json';
  await parseAtlas(await readFile(entries.get(atlasPath).path), atlasImage);

  for (const path of references) {
    if (path === 'brand/app-logo.png' || path === atlasImagePath || path === atlasPath) continue;
    const bytes = await readFile(entries.get(path).path);
    if (path.endsWith('.png')) {
      const image = parsePng(bytes, path);
      assertDimensions(image, 64, 64, path);
      assertPngAlpha(image, path);
    } else if (path.endsWith('.webp')) {
      const image = parseWebp(bytes, path);
      if (path.startsWith('backgrounds/')) {
        assertDimensions(image, 840, 1480, path);
      } else if (path.endsWith('/full.webp')) {
        assertDimensions(image, 1024, 1024, path);
        if (!image.alpha) fail('expected alpha support for ' + path);
      } else {
        assertDimensions(image, 256, 256, path);
        if (!image.alpha) fail('expected alpha support for ' + path);
      }
    } else if (path.endsWith('.svg')) {
      parseSvg(bytes, path);
    } else if (path.endsWith('.mp3')) {
      parseMp3(bytes, path);
    } else {
      fail('unsupported referenced asset: ' + path);
    }
  }
}

export async function validateAssets(root = process.cwd(), options = {}) {
  const assetsRoot = resolve(root, 'public', 'assets');
  let files;
  try {
    files = await collectFiles(assetsRoot);
  } catch (error) {
    if (error && error.code === 'ENOENT') fail('runtime asset directory is missing');
    throw error;
  }
  const fileByPath = new Map();
  for (const file of files) {
    if (!RUNTIME_PATH.test(file.relativePath)) fail('invalid runtime asset path');
    fileByPath.set(file.relativePath, file);
  }
  const runtimeBytes = files.reduce((total, file) => total + file.size, 0);
  if (runtimeBytes > MAX_RUNTIME_BYTES) fail('runtime assets exceed 30 MiB');
  const manifestFile = fileByPath.get('manifest.json');
  if (!manifestFile) fail('asset manifest is missing');

  let manifestValue;
  try {
    manifestValue = JSON.parse(await readFile(manifestFile.path, 'utf8'));
  } catch {
    fail('invalid asset manifest');
  }
  const manifest = parseManifest(manifestValue);
  const logoFile = fileByPath.get('brand/app-logo.png');
  if (!logoFile) fail('missing local opaque logo');
  const logo = parsePng(await readFile(logoFile.path), 'brand/app-logo.png');
  assertDimensions(logo, 600, 600, 'opaque logo');
  assertOpaqueLogo(logo);

  const assetsRequired = options.assetsRequired ?? process.env.ASSETS_REQUIRED === '1';
  if (manifest.mode === 'procedural-fallback') {
    if (assetsRequired) fail('authored asset manifest is required');
    return { mode: manifest.mode, runtimeBytes };
  }
  await validateReferencedAssets(assetsRoot, files, manifest.references);
  return { mode: manifest.mode, runtimeBytes };
}

async function main() {
  try {
    const result = await validateAssets();
    console.log('ASSETS_OK mode=' + result.mode + ' runtimeBytes=' + result.runtimeBytes);
  } catch (error) {
    console.error('ASSETS_FAIL ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
