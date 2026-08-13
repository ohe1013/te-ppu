import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateStoreMedia } from './store-media.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FILES = Object.freeze({
  'app-logo-teppu.png': [600, 600],
  'thumbnail-teppu.png': [1932, 828],
  'screenshot-01-title.png': [636, 1048],
  'screenshot-02-tower.png': [636, 1048],
  'screenshot-03-battle.png': [636, 1048],
});

function chunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function png(width, height, { colorType = 2, trns = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const chunks = [PNG_SIGNATURE, chunk('IHDR', ihdr)];
  if (trns) chunks.push(chunk('tRNS', Buffer.from([0, 0, 0, 0, 0, 0])));
  chunks.push(chunk('IEND'));
  return Buffer.concat(chunks);
}

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'te-ppu-store-media-'));
  const mediaRoot = join(root, 'artifacts', 'apps-in-toss', 'store-media');
  await mkdir(mediaRoot, { recursive: true });
  for (const [fileName, [width, height]] of Object.entries(FILES)) {
    const value = Object.hasOwn(overrides, fileName)
      ? overrides[fileName]
      : png(width, height);
    if (value !== null) await writeFile(join(mediaRoot, fileName), value);
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('accepts the exact five-file Apps-in-Toss media set', async () => {
  const { cleanup, root } = await fixture();
  try {
    const result = await validateStoreMedia(root);
    assert.deepEqual(result, [
      { fileName: 'app-logo-teppu.png', width: 600, height: 600 },
      { fileName: 'thumbnail-teppu.png', width: 1932, height: 828 },
      { fileName: 'screenshot-01-title.png', width: 636, height: 1048 },
      { fileName: 'screenshot-02-tower.png', width: 636, height: 1048 },
      { fileName: 'screenshot-03-battle.png', width: 636, height: 1048 },
    ]);
  } finally {
    await cleanup();
  }
});

test('rejects a missing required upload file', async () => {
  const { cleanup, root } = await fixture({ 'thumbnail-teppu.png': null });
  try {
    await assert.rejects(() => validateStoreMedia(root), /missing.*thumbnail-teppu\.png/i);
  } finally {
    await cleanup();
  }
});

test('rejects a PNG with the wrong dimensions', async () => {
  const { cleanup, root } = await fixture({
    'app-logo-teppu.png': png(599, 600),
  });
  try {
    await assert.rejects(() => validateStoreMedia(root), /app-logo-teppu\.png.*600x600/i);
  } finally {
    await cleanup();
  }
});

test('rejects a file without a valid PNG signature', async () => {
  const { cleanup, root } = await fixture({
    'screenshot-03-battle.png': Buffer.from('not a PNG'),
  });
  try {
    await assert.rejects(() => validateStoreMedia(root), /invalid PNG.*screenshot-03-battle\.png/i);
  } finally {
    await cleanup();
  }
});

for (const [name, logo] of [
  ['alpha color type', png(600, 600, { colorType: 6 })],
  ['tRNS transparency chunk', png(600, 600, { trns: true })],
]) {
  test(`rejects an app logo with ${name}`, async () => {
    const { cleanup, root } = await fixture({ 'app-logo-teppu.png': logo });
    try {
      await assert.rejects(() => validateStoreMedia(root), /opaque.*app-logo-teppu\.png/i);
    } finally {
      await cleanup();
    }
  });
}
