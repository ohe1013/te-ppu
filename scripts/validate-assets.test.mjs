import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { validateAssets } from './validate-assets.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_RUNTIME_BYTES = 30 * 1024 * 1024;
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

function withWorkspace(run) {
  const root = mkdtempSync(join(tmpdir(), 'te-ppu-assets-'));
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => rmSync(root, { recursive: true, force: true }));
}

function writeFile(root, relativePath, bytes) {
  const path = join(root, 'public', 'assets', relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function writeManifest(root, manifest) {
  writeFile(root, 'manifest.json', JSON.stringify(manifest));
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  return chunk;
}

function png(width, height, colorType = 6, trns = false) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const chunks = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)];
  if (trns) chunks.push(pngChunk('tRNS', Buffer.from([0])));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function truncatedPng() {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(100, 0);
  return Buffer.concat([PNG_SIGNATURE, length, Buffer.from('IHDR')]);
}

function riffWebp(chunkType, payload) {
  const padded = payload.length % 2 === 0 ? payload : Buffer.concat([payload, Buffer.alloc(1)]);
  const chunk = Buffer.alloc(8);
  chunk.write(chunkType, 0, 'ascii');
  chunk.writeUInt32LE(payload.length, 4);
  const riffSize = 4 + chunk.length + padded.length;
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(riffSize, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, chunk, padded]);
}

function vp8xWebp(width, height, alpha = true) {
  const payload = Buffer.alloc(10);
  payload[0] = alpha ? 0x10 : 0;
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);
  return riffWebp('VP8X', payload);
}

function vp8Webp(width, height) {
  const payload = Buffer.alloc(10);
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);
  return riffWebp('VP8 ', payload);
}

function vp8lWebp(width, height, alpha = true) {
  const payload = Buffer.alloc(5);
  payload[0] = 0x2f;
  const packed = (width - 1) + ((height - 1) * 0x4000) + (alpha ? 0x10000000 : 0);
  payload.writeUInt32LE(packed, 1);
  return riffWebp('VP8L', payload);
}

function geometrySvg() {
  return Buffer.from('<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#6c5ce7" d="M2 2h20v20H2z"/></svg>');
}

function mp3Frame() {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

function id3Mp3() {
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]),
    mp3Frame(),
  ]);
}

function ref(path) {
  return { path };
}

function portraits(character, ids) {
  return Object.fromEntries(ids.map((id) => [id, ref('characters/' + character + '/portrait-' + id + '.webp')]));
}

function completeManifest() {
  const lieutenant = ['idle', 'smug', 'attack', 'hit', 'panic', 'defeat'];
  return {
    schemaVersion: 1,
    mode: 'assets',
    brand: { logo: ref('brand/app-logo.png') },
    common: {
      backgrounds: { tower: ref('backgrounds/tower-exterior.webp') },
      characters: {
        'hero-engineer': {
          fullArt: ref('characters/hero-engineer/full.webp'),
          portraits: portraits('hero-engineer', ['idle', 'focus', 'attack', 'hit', 'win', 'loss']),
        },
        'owl-companion': {
          fullArt: ref('characters/owl-companion/full.webp'),
          portraits: portraits('owl-companion', ['idle', 'worry', 'cheer']),
        },
      },
      tiles: {
        I: ref('blocks/tile-i.png'),
        J: ref('blocks/tile-j.png'),
        L: ref('blocks/tile-l.png'),
        O: ref('blocks/tile-o.png'),
        S: ref('blocks/tile-s.png'),
        T: ref('blocks/tile-t.png'),
        Z: ref('blocks/tile-z.png'),
        garbage: ref('blocks/garbage.png'),
      },
      items: {
        'row-clear': ref('items/row-clear.png'),
        freeze: ref('items/freeze.png'),
        'queue-swap': ref('items/queue-swap.png'),
      },
      icons: {
        rotate: ref('ui/rotate.svg'),
        settings: ref('ui/settings.svg'),
        'sound-on': ref('ui/sound-on.svg'),
        'sound-off': ref('ui/sound-off.svg'),
        'haptics-on': ref('ui/haptics-on.svg'),
        'haptics-off': ref('ui/haptics-off.svg'),
        exit: ref('ui/exit.svg'),
      },
      atlas: {
        image: ref('effects/battle-atlas.png'),
        data: ref('effects/battle-atlas.json'),
      },
      audio: {
        sfx: Object.fromEntries(
          ['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss']
            .map((id) => [id, ref('audio/sfx/' + id + '.mp3')]),
        ),
        bgm: Object.fromEntries(
          ['tower', 'early-floors', 'late-floors', 'demon-king', 'ending']
            .map((id) => [id, ref('audio/bgm/' + id + '.mp3')]),
        ),
      },
    },
    floors: {
      1: {
        opponent: 'quartermaster',
        music: 'early-floors',
        background: ref('backgrounds/floor-01.webp'),
        character: { fullArt: ref('characters/quartermaster/full.webp'), portraits: portraits('quartermaster', lieutenant) },
      },
      2: {
        opponent: 'alchemist',
        music: 'early-floors',
        background: ref('backgrounds/floor-02.webp'),
        character: { fullArt: ref('characters/alchemist/full.webp'), portraits: portraits('alchemist', lieutenant) },
      },
      3: {
        opponent: 'guard-captain',
        music: 'late-floors',
        background: ref('backgrounds/floor-03.webp'),
        character: { fullArt: ref('characters/guard-captain/full.webp'), portraits: portraits('guard-captain', lieutenant) },
      },
      4: {
        opponent: 'dark-engineer',
        music: 'late-floors',
        background: ref('backgrounds/floor-04.webp'),
        character: { fullArt: ref('characters/dark-engineer/full.webp'), portraits: portraits('dark-engineer', lieutenant) },
      },
      5: {
        opponent: 'demon-king',
        music: 'demon-king',
        background: ref('backgrounds/floor-05.webp'),
        character: {
          fullArt: ref('characters/demon-king/full.webp'),
          portraits: portraits('demon-king', ['idle', 'attack', 'hit', 'rage', 'defeat']),
        },
      },
    },
  };
}

function allPaths(value) {
  if (Array.isArray(value)) return value.flatMap(allPaths);
  if (value && typeof value === 'object') {
    if (Object.keys(value).join(',') === 'path') return [value.path];
    return Object.values(value).flatMap(allPaths);
  }
  return [];
}

function frameName(group, index) {
  return group + '-' + String(index).padStart(2, '0') + '.png';
}

function atlasJson() {
  const frames = {};
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const [group, count, width, height] of ATLAS_GROUPS) {
    for (let index = 0; index < count; index += 1) {
      if (x + width > 2048) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      frames[frameName(group, index)] = {
        frame: { x, y, w: width, h: height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: width, h: height },
        sourceSize: { w: width, h: height },
      };
      x += width;
      rowHeight = Math.max(rowHeight, height);
    }
  }
  return {
    frames,
    meta: {
      image: 'battle-atlas.png',
      format: 'RGBA8888',
      scale: '1',
      size: { w: 2048, h: 2048 },
    },
  };
}

function bytesFor(path) {
  if (path === 'brand/app-logo.png') return png(600, 600, 2);
  if (path === 'effects/battle-atlas.png') return png(2048, 2048, 6);
  if (path === 'effects/battle-atlas.json') return Buffer.from(JSON.stringify(atlasJson()));
  if (path.startsWith('blocks/') || path.startsWith('items/')) return png(64, 64, 6);
  if (path.endsWith('.svg')) return geometrySvg();
  if (path.endsWith('.mp3')) return mp3Frame();
  if (path.endsWith('/full.webp')) {
    if (path.startsWith('characters/hero-engineer/')) return vp8lWebp(1024, 1024);
    return vp8xWebp(1024, 1024);
  }
  if (path.includes('/portrait-')) return vp8xWebp(256, 256);
  if (path.startsWith('backgrounds/')) {
    if (path === 'backgrounds/tower-exterior.webp') return vp8Webp(840, 1480);
    return vp8xWebp(840, 1480, false);
  }
  throw new Error('unexpected fixture path ' + path);
}

function writeCompleteAssets(root) {
  const manifest = completeManifest();
  writeManifest(root, manifest);
  for (const path of allPaths(manifest)) writeFile(root, path, bytesFor(path));
  return manifest;
}

function writeFallback(root) {
  writeManifest(root, { schemaVersion: 1, mode: 'procedural-fallback' });
  writeFile(root, 'brand/app-logo.png', png(600, 600, 2));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rewriteAtlas(root, mutate) {
  const atlas = atlasJson();
  mutate(atlas);
  writeFile(root, 'effects/battle-atlas.json', JSON.stringify(atlas));
}

test('accepts fallback locally and rejects it when authored assets are required', async () => {
  await withWorkspace(async (fallbackRoot) => {
    writeFallback(fallbackRoot);
    await assert.doesNotReject(() => validateAssets(fallbackRoot, { assetsRequired: false }));
    await assert.rejects(
      () => validateAssets(fallbackRoot, { assetsRequired: true }),
      /authored asset manifest is required/,
    );
  });
});

test('accepts a complete authored pack with geometry-only SVGs, VP8/VP8L/VP8X WebPs, and MP3 frames', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    await assert.doesNotReject(() => validateAssets(root));
  });
});

test('accepts an ID3-skipped complete MPEG audio frame', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'audio/sfx/move.mp3', id3Mp3());
    await assert.doesNotReject(() => validateAssets(root));
  });
});

test('rejects an authored manifest that references a missing runtime file', async () => {
  await withWorkspace(async (root) => {
    const manifest = writeCompleteAssets(root);
    manifest.common.tiles.I.path = 'blocks/missing.png';
    writeManifest(root, manifest);
    await assert.rejects(() => validateAssets(root), /missing referenced asset.*blocks\/missing\.png/i);
  });
});

for (const [label, path] of [
  ['parent traversal', 'blocks/../tile-i.png'],
  ['absolute path', '/blocks/tile-i.png'],
  ['Windows absolute path', 'C:/blocks/tile-i.png'],
  ['underscore name', 'blocks/tile_i.png'],
  ['non-ASCII name', 'blocks/tile-한.png'],
]) {
  test('rejects an unsafe runtime path: ' + label, async () => {
    await withWorkspace(async (root) => {
      const manifest = writeCompleteAssets(root);
      manifest.common.tiles.I.path = path;
      writeManifest(root, manifest);
      await assert.rejects(() => validateAssets(root), /invalid runtime asset path/i);
    });
  });
}

for (const [label, mutate] of [
  ['an extra manifest key', (manifest) => { manifest.extra = true; }],
  ['a missing required manifest key', (manifest) => { delete manifest.common.tiles.I; }],
]) {
  test('rejects ' + label, async () => {
    await withWorkspace(async (root) => {
      const manifest = writeCompleteAssets(root);
      mutate(manifest);
      writeManifest(root, manifest);
      await assert.rejects(() => validateAssets(root), /asset manifest/i);
    });
  });
}

test('rejects wrong transparent PNG dimensions and alpha support', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'blocks/tile-i.png', png(63, 64, 6));
    await assert.rejects(() => validateAssets(root), /64x64/);
  });
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'items/freeze.png', png(64, 64, 2));
    await assert.rejects(() => validateAssets(root), /alpha/i);
  });
});

test('rejects wrong transparent WebP dimensions and missing alpha metadata', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'characters/hero-engineer/full.webp', vp8xWebp(1023, 1024));
    await assert.rejects(() => validateAssets(root), /1024x1024/);
  });
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'characters/owl-companion/portrait-idle.webp', vp8xWebp(256, 256, false));
    await assert.rejects(() => validateAssets(root), /alpha/i);
  });
});

for (const [label, bytes] of [
  ['an alpha color type', png(600, 600, 6)],
  ['a tRNS chunk', png(600, 600, 2, true)],
]) {
  test('rejects an opaque logo with ' + label, async () => {
    await withWorkspace(async (root) => {
      writeCompleteAssets(root);
      writeFile(root, 'brand/app-logo.png', bytes);
      await assert.rejects(() => validateAssets(root), /opaque logo/i);
    });
  });
}

test('rejects PNG chunk declarations that cross EOF', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'blocks/tile-i.png', truncatedPng());
    await assert.rejects(() => validateAssets(root), /PNG chunk.*EOF/i);
  });
});

for (const [label, source] of [
  ['script', '<svg><script>alert(1)</script></svg>'],
  ['event attribute', '<svg onclick="x()"><path d="M0 0"/></svg>'],
  ['foreign object', '<svg><foreignObject/></svg>'],
  ['doctype', '<!DOCTYPE svg><svg/>'],
  ['entity', '<!ENTITY x "x"><svg/>'],
  ['style', '<svg><style>path { fill: red }</style></svg>'],
  ['text font usage', '<svg><text font-family="serif">x</text></svg>'],
  ['href', '<svg><use href="#local"/></svg>'],
  ['xlink href', '<svg xmlns:xlink="x"><use xlink:href="#local"/></svg>'],
  ['external URL paint', '<svg><path fill="url(https://example.test/a)"/></svg>'],
]) {
  test('rejects unsafe SVG ' + label, async () => {
    await withWorkspace(async (root) => {
      writeCompleteAssets(root);
      writeFile(root, 'ui/rotate.svg', Buffer.from(source));
      await assert.rejects(() => validateAssets(root), /SVG/i);
    });
  });
}

test('rejects an MP3 without a direct or ID3-skipped complete MPEG frame', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    writeFile(root, 'audio/sfx/move.mp3', Buffer.from('not an mp3'));
    await assert.rejects(() => validateAssets(root), /MPEG audio frame/i);
  });
});

test('rejects forbidden atlas rotation and exact frame-set drift', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { atlas.frames['move-dust-00.png'].rotated = true; });
    await assert.rejects(() => validateAssets(root), /rotated/i);
  });
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { delete atlas.frames['move-dust-03.png']; });
    await assert.rejects(() => validateAssets(root), /frame names/i);
  });
});

test('rejects atlas source-size and sprite-source geometry drift', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { atlas.frames['line-clear-00.png'].sourceSize.w = 639; });
    await assert.rejects(() => validateAssets(root), /sourceSize/i);
  });
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { atlas.frames['attack-shot-00.png'].spriteSourceSize.w = 63; });
    await assert.rejects(() => validateAssets(root), /frame.*spriteSourceSize/i);
  });
});

test('rejects inconsistent untrimmed atlas offsets and the wrong atlas metadata image', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { atlas.frames['combo-pop-00.png'].spriteSourceSize.x = 1; });
    await assert.rejects(() => validateAssets(root), /untrimmed/i);
  });
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    rewriteAtlas(root, (atlas) => { atlas.meta.image = 'wrong.png'; });
    await assert.rejects(() => validateAssets(root), /meta\.image/i);
  });
});

test('rejects runtime assets above the 30 MiB delivery ceiling', async () => {
  await withWorkspace(async (root) => {
    writeCompleteAssets(root);
    const oversized = Buffer.alloc(MAX_RUNTIME_BYTES + 1);
    mp3Frame().copy(oversized);
    writeFile(root, 'audio/sfx/extra.mp3', oversized);
    await assert.rejects(() => validateAssets(root), /30 MiB/i);
  });
});
