import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const LEGACY_ICON_SIZES = Object.freeze({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
});

export const ADAPTIVE_ICON_SIZES = Object.freeze({
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
});

export const SPLASH_SIZES = Object.freeze({
  drawable: { width: 480, height: 320 },
  'drawable-land-mdpi': { width: 480, height: 320 },
  'drawable-land-hdpi': { width: 800, height: 480 },
  'drawable-land-xhdpi': { width: 1280, height: 720 },
  'drawable-land-xxhdpi': { width: 1600, height: 960 },
  'drawable-land-xxxhdpi': { width: 1920, height: 1280 },
  'drawable-port-mdpi': { width: 320, height: 480 },
  'drawable-port-hdpi': { width: 480, height: 800 },
  'drawable-port-xhdpi': { width: 720, height: 1280 },
  'drawable-port-xxhdpi': { width: 960, height: 1600 },
  'drawable-port-xxxhdpi': { width: 1280, height: 1920 },
});

const BRAND_BACKGROUND = Object.freeze({ r: 16, g: 16, b: 38 });
const PNG_OPTIONS = Object.freeze({ compressionLevel: 9, adaptiveFiltering: false });

async function validateSource(sourcePath) {
  const metadata = await sharp(sourcePath).metadata();
  if (metadata.width !== 600 || metadata.height !== 600) {
    throw new Error(
      `Teppu Android brand source must be 600x600, received ${metadata.width ?? '?'}x${metadata.height ?? '?'}.`,
    );
  }
}

async function writeLegacyIcon(sourcePath, outputPath, size) {
  await sharp(sourcePath)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .flatten({ background: BRAND_BACKGROUND })
    .png(PNG_OPTIONS)
    .toFile(outputPath);
}

async function writeAdaptiveForeground(sourcePath, outputPath, size) {
  const logoSize = Math.round(size * 0.64);
  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, { fit: 'cover', position: 'centre' })
    .png(PNG_OPTIONS)
    .toBuffer();
  const offset = Math.floor((size - logoSize) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, left: offset, top: offset }])
    .png(PNG_OPTIONS)
    .toFile(outputPath);
}

async function writeSplash(sourcePath, outputPath, { width, height }) {
  const logoSize = Math.round(Math.min(width, height) * 0.56);
  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, { fit: 'cover', position: 'centre' })
    .png(PNG_OPTIONS)
    .toBuffer();
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: BRAND_BACKGROUND,
    },
  })
    .composite([{
      input: logo,
      left: Math.floor((width - logoSize) / 2),
      top: Math.floor((height - logoSize) / 2),
    }])
    .png(PNG_OPTIONS)
    .toFile(outputPath);
}

export async function generateAndroidBrandResources({ sourcePath, resRoot }) {
  await validateSource(sourcePath);

  for (const [density, legacySize] of Object.entries(LEGACY_ICON_SIZES)) {
    const directory = join(resRoot, `mipmap-${density}`);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeLegacyIcon(sourcePath, join(directory, 'ic_launcher.png'), legacySize),
      writeLegacyIcon(sourcePath, join(directory, 'ic_launcher_round.png'), legacySize),
      writeAdaptiveForeground(
        sourcePath,
        join(directory, 'ic_launcher_foreground.png'),
        ADAPTIVE_ICON_SIZES[density],
      ),
    ]);
  }

  for (const [directoryName, size] of Object.entries(SPLASH_SIZES)) {
    const directory = join(resRoot, directoryName);
    await mkdir(directory, { recursive: true });
    await writeSplash(sourcePath, join(directory, 'splash.png'), size);
  }
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);

if (invokedPath === fileURLToPath(import.meta.url)) {
  generateAndroidBrandResources({
    sourcePath: join(projectRoot, 'artifacts/apps-in-toss/store-media/app-logo-teppu.png'),
    resRoot: join(projectRoot, 'android/app/src/main/res'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
