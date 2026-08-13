import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const STORE_MEDIA = Object.freeze({
  'app-logo-teppu.png': { width: 600, height: 600, opaque: true },
  'thumbnail-teppu.png': { width: 1932, height: 828, opaque: false },
  'screenshot-01-title.png': { width: 636, height: 1048, opaque: false },
  'screenshot-02-tower.png': { width: 636, height: 1048, opaque: false },
  'screenshot-03-battle.png': { width: 636, height: 1048, opaque: false },
});

function fail(message) {
  throw new Error(message);
}

function parsePng(bytes, label) {
  if (bytes.length < PNG_SIGNATURE.length
    || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(`invalid PNG signature: ${label}`);
  }

  let header = null;
  let hasTransparencyChunk = false;
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) fail(`invalid PNG chunk: ${label}`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      fail(`invalid PNG chunk: ${label}`);
    }
    if (type === 'IHDR') {
      if (header !== null || length !== 13) fail(`invalid PNG IHDR: ${label}`);
      header = {
        width: bytes.readUInt32BE(dataStart),
        height: bytes.readUInt32BE(dataStart + 4),
        colorType: bytes[dataStart + 9],
      };
    } else if (type === 'tRNS') {
      hasTransparencyChunk = true;
    }
    offset = chunkEnd;
    if (type === 'IEND') break;
  }
  if (header === null || header.width === 0 || header.height === 0) {
    fail(`invalid PNG IHDR: ${label}`);
  }
  return { ...header, hasTransparencyChunk };
}

export async function validateStoreMedia(root = process.cwd()) {
  const mediaRoot = join(root, 'artifacts', 'apps-in-toss', 'store-media');
  const results = [];
  for (const [fileName, expected] of Object.entries(STORE_MEDIA)) {
    let bytes;
    try {
      bytes = await readFile(join(mediaRoot, fileName));
    } catch (error) {
      if (error?.code === 'ENOENT') fail(`missing required file: ${fileName}`);
      throw error;
    }
    const parsed = parsePng(bytes, fileName);
    if (parsed.width !== expected.width || parsed.height !== expected.height) {
      fail(`${fileName} must be ${expected.width}x${expected.height}`);
    }
    if (expected.opaque && (parsed.colorType !== 2 || parsed.hasTransparencyChunk)) {
      fail(`opaque RGB PNG required: ${fileName}`);
    }
    results.push({ fileName, width: parsed.width, height: parsed.height });
  }
  return results;
}

async function main() {
  try {
    const result = await validateStoreMedia();
    console.log(`STORE_MEDIA_OK files=${result.length}`);
  } catch (error) {
    console.error(`STORE_MEDIA_FAIL ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
