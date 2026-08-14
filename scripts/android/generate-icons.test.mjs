import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {
  ADAPTIVE_ICON_SIZES,
  LEGACY_ICON_SIZES,
  SPLASH_SIZES,
  generateAndroidBrandResources,
} from './generate-icons.mjs';

async function dimensions(path) {
  const { width, height } = await sharp(path).metadata();
  return { width, height };
}

test('brand generator writes every launcher density with safe adaptive padding', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-icons-'));
  const source = join(fixture, 'source.png');
  const resRoot = join(fixture, 'res');
  try {
    await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 240, g: 120, b: 30 },
      },
    }).png().toFile(source);

    await generateAndroidBrandResources({ sourcePath: source, resRoot });

    for (const [density, size] of Object.entries(LEGACY_ICON_SIZES)) {
      const directory = join(resRoot, `mipmap-${density}`);
      assert.deepEqual(await dimensions(join(directory, 'ic_launcher.png')), {
        width: size,
        height: size,
      });
      assert.deepEqual(await dimensions(join(directory, 'ic_launcher_round.png')), {
        width: size,
        height: size,
      });
      assert.deepEqual(
        await dimensions(join(directory, 'ic_launcher_foreground.png')),
        { width: ADAPTIVE_ICON_SIZES[density], height: ADAPTIVE_ICON_SIZES[density] },
      );

      const foreground = await sharp(join(directory, 'ic_launcher_foreground.png'))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(foreground.data[3], 0, `${density} adaptive corner must be transparent`);
      const center = Math.floor(ADAPTIVE_ICON_SIZES[density] / 2);
      const centerAlpha = foreground.data[((center * ADAPTIVE_ICON_SIZES[density]) + center) * 4 + 3];
      assert.equal(centerAlpha, 255, `${density} adaptive center must contain the logo`);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('brand generator writes every portrait and landscape splash canvas', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-splash-'));
  const source = join(fixture, 'source.png');
  const resRoot = join(fixture, 'res');
  try {
    await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 25, g: 50, b: 100 },
      },
    }).png().toFile(source);

    await generateAndroidBrandResources({ sourcePath: source, resRoot });

    for (const [directory, expected] of Object.entries(SPLASH_SIZES)) {
      assert.deepEqual(await dimensions(join(resRoot, directory, 'splash.png')), expected);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
