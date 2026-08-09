import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AppsInTossBundle } from '@apps-in-toss/ait-format';
import { strToU8, Zip, ZipPassThrough } from 'fflate';
import {
  inspectArchiveEntries,
  MAX_UNCOMPRESSED_BYTES,
  verifyAitPackage,
} from './verify-ait-package.mjs';

const checkerPath = fileURLToPath(new URL('./verify-ait-package.mjs', import.meta.url));

async function withWorkspace(run) {
  const root = mkdtempSync(join(tmpdir(), 'te-ppu-ait-gate-'));
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function writeArchive(root, relativePath, entries) {
  const archivePath = join(root, relativePath);
  mkdirSync(dirname(archivePath), { recursive: true });
  const writer = AppsInTossBundle.writer({
    appName: 'te-ppu-test-fixture',
    deploymentId: '019fc229-9d26-7a0b-8269-45e14d7f661a',
  });
  for (const [entryName, data] of Object.entries(entries)) writer.addFile(entryName, data);
  writeFileSync(archivePath, Buffer.from(await writer.toBuffer()));
}

async function zipEntries(entries) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    const zip = new Zip((error, data, final) => {
      if (error) {
        reject(error);
        return;
      }
      chunks.push(Buffer.from(data));
      if (final) resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    for (const [entryName, data] of entries) {
      const file = new ZipPassThrough(entryName);
      zip.add(file);
      file.push(data, true);
    }
    zip.end();
  });
}

async function writeArchiveWithZip(root, relativePath, zipBytes) {
  const writer = AppsInTossBundle.writer({
    appName: 'te-ppu-test-fixture',
    deploymentId: '019fc229-9d26-7a0b-8269-45e14d7f661a',
  });
  writer.addFile('placeholder', strToU8('placeholder'));
  const template = await writer.toBuffer();
  const templateView = new DataView(template.buffer, template.byteOffset, template.byteLength);
  const bundleLength = Number(templateView.getBigUint64(12, false));
  const zipLengthOffset = 20 + bundleLength;
  const zipOffset = zipLengthOffset + 8;
  const archive = new Uint8Array(zipOffset + zipBytes.byteLength + 8);
  archive.set(template.slice(0, zipLengthOffset));
  const archiveView = new DataView(archive.buffer);
  archiveView.setBigUint64(zipLengthOffset, BigInt(zipBytes.byteLength), false);
  archive.set(zipBytes, zipOffset);
  archiveView.setBigUint64(zipOffset + zipBytes.byteLength, 0n, false);

  const archivePath = join(root, relativePath);
  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, Buffer.from(archive));
}

function runChecker(root, ...artifactPaths) {
  const result = spawnSync(process.execPath, [checkerPath, ...artifactPaths], {
    cwd: root,
    encoding: 'utf8',
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

test('accepts one marker-free archive and reports every entry in stable order', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'release/game.ait', {
      'web/z-last.js': strToU8('console.log("ready")'),
      'manifest.json': strToU8('{"app":"te-ppu"}'),
    });

    const result = runChecker(root, 'release/game.ait');

    assert.equal(result.status, 0, result.output);
    assert.equal(result.output, [
      'AIT_ENTRY manifest.json bytes=16',
      'AIT_ENTRY web/z-last.js bytes=20',
      'AIT_OK release/game.ait uncompressedBytes=36 entries=2 vulnerablePackageMarkers=0',
      '',
    ].join('\n'));
  });
});

test('rejects vulnerable package markers in paths and textual content with exact entries', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'web/main.js': strToU8('import middleware from "@fastify/middie";'),
      'vendor/node_modules/fast-uri/index.js': strToU8('export const version = 1;'),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    assert.match(
      result.output,
      /AIT_FAIL Vulnerable package marker found in \.ait: vendor\/node_modules\/fast-uri\/index\.js:path:fast-uri, web\/main\.js:content:@fastify\/middie/,
    );
  });
});

test('rejects duplicate ZIP entry names before one payload can overwrite another', async () => {
  await withWorkspace(async (root) => {
    const zipBytes = await zipEntries([
      ['dup.js', strToU8('import "fastify";')],
      ['dup.js', strToU8('export const clean = true;')],
    ]);
    await writeArchiveWithZip(root, 'game.ait', zipBytes);

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /AIT_FAIL Duplicate ZIP entry in \.ait: dup\.js/);
  });
});

test('checks every reviewed vulnerable package marker', async () => {
  const packageNames = [
    '@fastify/middie',
    'fastify',
    'find-my-way',
    'fast-uri',
    'ip',
    '@react-native-community/cli',
    '@react-native-community/cli-doctor',
    '@react-native-community/cli-hermes',
  ];

  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'package.json': strToU8(JSON.stringify({
        dependencies: Object.fromEntries(packageNames.map((name) => [name, '1.0.0'])),
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    for (const packageName of packageNames) {
      assert.ok(
        result.output.includes(`package.json:content:${packageName}`),
        `missing marker for ${packageName}: ${result.output}`,
      );
    }
  });
});

test('rejects template-literal package markers in every scanned JavaScript format', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'app.js': strToU8('import(`fastify`)'),
      'worker.cjs': strToU8('require(`ip`)'),
      'module.mjs': strToU8('import(`find-my-way`)'),
      'module.js.map': strToU8(JSON.stringify({
        version: 3,
        names: [],
        sources: ['src/module.ts'],
        sourcesContent: ['import(`fast-uri`)'],
        mappings: '',
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    for (const finding of [
      'app.js:content:fastify',
      'module.js.map:content:fast-uri',
      'module.mjs:content:find-my-way',
      'worker.cjs:content:ip',
    ]) {
      assert.ok(result.output.includes(finding), `missing ${finding}: ${result.output}`);
    }
  });
});

test('rejects uncompressed content above the configured boundary', () => {
  assert.equal(MAX_UNCOMPRESSED_BYTES, 104857600);
  assert.throws(
    () => inspectArchiveEntries({ 'large.bin': new Uint8Array(3) }, 2),
    /Uncompressed bundle is 3 bytes; limit is 2/,
  );
});

test('applies the uncompressed limit while reading the embedded AIT zip', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', { 'large.bin': new Uint8Array(3) });

    await assert.rejects(
      () => verifyAitPackage(join(root, 'game.ait'), 2),
      /Uncompressed bundle is 3 bytes; limit is 2/,
    );
  });
});

test('requires exactly one explicit artifact path and never scans a workspace', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'release/game.ait', { 'main.js': strToU8('ready') });
    await writeArchive(root, 'stale.ait', { 'old.js': strToU8('stale') });

    const result = runChecker(root);

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /AIT_FAIL.*explicit.*\.ait.*path/i);
  });
});

test('inspects only the supplied artifact and ignores stale sibling AIT files', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'release/game.ait', { 'main.js': strToU8('ready') });
    await writeArchive(root, 'stale.ait', {
      'node_modules/fast-uri/index.js': strToU8('stale marker'),
    });

    const result = runChecker(root, 'release/game.ait');

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /AIT_OK release\/game\.ait /);
    assert.doesNotMatch(result.output, /stale\.ait|fast-uri/);
  });
});

test('requires the local logo and every authored manifest ref when an explicit archive ships assets', async () => {
  await withWorkspace(async (root) => {
    const manifest = {
      schemaVersion: 1,
      mode: 'assets',
      brand: { logo: { path: 'brand/app-logo.png' } },
      common: { tile: { path: 'blocks/tile-i.png' } },
    };
    await writeArchive(root, 'game.ait', {
      'web/assets/manifest.json': strToU8(JSON.stringify(manifest)),
      'web/assets/brand/app-logo.png': new Uint8Array([1]),
      'web/assets/blocks/tile-i.png': new Uint8Array([2]),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /AIT_OK game\.ait /);
  });
});

test('rejects an explicitly selected assets archive with an absent authored manifest ref', async () => {
  await withWorkspace(async (root) => {
    const manifest = {
      schemaVersion: 1,
      mode: 'assets',
      brand: { logo: { path: 'brand/app-logo.png' } },
      common: { tile: { path: 'blocks/tile-i.png' } },
    };
    await writeArchive(root, 'game.ait', {
      'web/assets/manifest.json': strToU8(JSON.stringify(manifest)),
      'web/assets/brand/app-logo.png': new Uint8Array([1]),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /authored asset.*blocks\/tile-i\.png/i);
  });
});

test('does not confuse a source-map identifier named ip with the ip package', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'bundle.js.map': strToU8(JSON.stringify({
        version: 3,
        names: ['ip'],
        sources: ['src/network.ts'],
        sourcesContent: ['export const ip = "127.0.0.1";'],
        mappings: '',
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /AIT_OK game\.ait /);
  });
});

test('does not confuse nested indexed source-map names with package markers', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'bundle.js.map': strToU8(JSON.stringify({
        version: 3,
        sections: [{
          offset: { line: 0, column: 0 },
          map: {
            version: 3,
            names: ['ip'],
            sources: ['src/network.ts'],
            sourcesContent: ['export const ip = "127.0.0.1";'],
            mappings: '',
          },
        }],
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /AIT_OK game\.ait /);
  });
});

test('rejects a vulnerable package path carried inside source-map content', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'bundle.js.map': strToU8(JSON.stringify({
        version: 3,
        names: [],
        sources: ['webpack:///node_modules/ip/lib/ip.js'],
        sourcesContent: [null],
        mappings: '',
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /bundle\.js\.map:content:ip/);
  });
});

test('rejects a quoted package marker inside source-map sourcesContent', async () => {
  await withWorkspace(async (root) => {
    await writeArchive(root, 'game.ait', {
      'bundle.js.map': strToU8(JSON.stringify({
        version: 3,
        names: [],
        sources: ['src/vendor.ts'],
        sourcesContent: ['import middleware from "@fastify/middie";'],
        mappings: '',
      })),
    });

    const result = runChecker(root, 'game.ait');

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /bundle\.js\.map:content:@fastify\/middie/);
  });
});
