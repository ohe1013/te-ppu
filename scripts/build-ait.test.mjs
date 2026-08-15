import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { buildAit } from './build-ait.mjs';

function withWorkspace(run) {
  const root = mkdtempSync(join(tmpdir(), 'te-ppu-build-ait-'));
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => rmSync(root, { recursive: true, force: true }));
}

function writeFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeFakeFramework(root) {
  const packagePath = join(root, 'fake-framework', 'package.json');
  writeFile(packagePath, JSON.stringify({ name: '@apps-in-toss/framework', type: 'module' }));
  writeFile(join(root, 'fake-framework', 'bin', 'ait.js'), [
    "import { writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "if (process.argv[2] !== 'build') process.exit(71);",
    "if (process.env.FAKE_AIT_MODE === 'nonzero') process.exit(17);",
    "if (process.env.FAKE_AIT_MODE === 'missing') process.exit(0);",
    "const appName = process.env.AIT_APP_NAME ?? 'te-ppu-prototype';",
    "writeFileSync(join(process.cwd(), appName + '.ait'), process.env.FAKE_AIT_CONTENT ?? 'fresh archive');",
  ].join('\n'));
  return packagePath;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

test('stages only the exact dynamically named CLI output and ignores stale sibling archives', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    const staleSibling = join(root, 'stale.ait');
    writeFile(staleSibling, 'stale archive');

    const result = await buildAit({
      root,
      frameworkPackagePath,
      env: {
        AIT_APP_NAME: 'console-registered-id',
        AIT_ARTIFACT_PATH: 'artifacts/ait/release/game.ait',
        FAKE_AIT_CONTENT: 'fresh archive',
      },
    });

    const destination = join(root, 'artifacts', 'ait', 'release', 'game.ait');
    assert.deepEqual(result, {
      appName: 'console-registered-id',
      artifactPath: 'artifacts/ait/release/game.ait',
    });
    assert.equal(read(destination), 'fresh archive');
    assert.equal(read(staleSibling), 'stale archive');
    assert.equal(existsSync(join(root, 'console-registered-id.ait')), false);
  });
});

test('uses the default isolated artifact path when no override is supplied', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);

    const result = await buildAit({
      root,
      frameworkPackagePath,
      env: { FAKE_AIT_CONTENT: 'default archive' },
    });

    assert.deepEqual(result, {
      appName: 'te-ppu-prototype',
      artifactPath: 'artifacts/ait/game.ait',
    });
    assert.equal(read(join(root, 'artifacts', 'ait', 'game.ait')), 'default archive');
    assert.equal(existsSync(join(root, 'te-ppu-prototype.ait')), false);
  });
});

for (const appName of ['', '   ', 'bad/name', 'bad\\name', '../source-escape']) {
  test('rejects invalid AIT_APP_NAME ' + JSON.stringify(appName), async () => {
    await withWorkspace(async (root) => {
      await assert.rejects(
        () => buildAit({ root, env: { AIT_APP_NAME: appName } }),
        /AIT_APP_NAME/i,
      );
    });
  });
}

for (const artifactPath of [
  '../escape.ait',
  'artifacts/game.ait',
  'artifacts/ait/../escape.ait',
  'artifacts/ait/game.zip',
]) {
  test('rejects an output-escaping or non-AIT artifact path ' + artifactPath, async () => {
    await withWorkspace(async (root) => {
      const frameworkPackagePath = writeFakeFramework(root);
      await assert.rejects(
        () => buildAit({
          root,
          frameworkPackagePath,
          env: { AIT_ARTIFACT_PATH: artifactPath },
        }),
        /AIT_ARTIFACT_PATH/i,
      );
    });
  });
}

test('rejects an absolute artifact path before the CLI can stage outside artifacts/ait', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    await assert.rejects(
      () => buildAit({
        root,
        frameworkPackagePath,
        env: { AIT_ARTIFACT_PATH: resolve(root, 'outside.ait') },
      }),
      /AIT_ARTIFACT_PATH/i,
    );
  });
});

test('keeps a previous destination untouched when the local CLI exits nonzero', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    const destination = join(root, 'artifacts', 'ait', 'game.ait');
    writeFile(destination, 'old archive');

    await assert.rejects(
      () => buildAit({
        root,
        frameworkPackagePath,
        env: { FAKE_AIT_MODE: 'nonzero' },
      }),
      /ait build failed/i,
    );

    assert.equal(read(destination), 'old archive');
    assert.equal(existsSync(join(root, 'te-ppu-prototype.ait')), false);
  });
});

test('keeps a previous destination untouched when a successful CLI omits its exact root output', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    const destination = join(root, 'artifacts', 'ait', 'game.ait');
    writeFile(destination, 'old archive');
    writeFile(join(root, 'stale.ait'), 'stale archive');

    await assert.rejects(
      () => buildAit({
        root,
        frameworkPackagePath,
        env: { FAKE_AIT_MODE: 'missing' },
      }),
      /expected CLI output/i,
    );

    assert.equal(read(destination), 'old archive');
    assert.equal(read(join(root, 'stale.ait')), 'stale archive');
  });
});

test('rejects a stale exact root archive when a zero-exit CLI produces no fresh output', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    const source = join(root, 'te-ppu-prototype.ait');
    const destination = join(root, 'artifacts', 'ait', 'game.ait');
    writeFile(source, 'stale exact archive');
    writeFile(destination, 'old destination archive');

    await assert.rejects(
      () => buildAit({
        root,
        frameworkPackagePath,
        env: { FAKE_AIT_MODE: 'missing' },
      }),
      /expected CLI output is missing/i,
    );

    assert.equal(read(source), 'stale exact archive');
    assert.equal(read(destination), 'old destination archive');
  });
});

test('removes a stale exact root archive and private stash after staging fresh CLI output', async () => {
  await withWorkspace(async (root) => {
    const frameworkPackagePath = writeFakeFramework(root);
    const source = join(root, 'te-ppu-prototype.ait');
    const destination = join(root, 'artifacts', 'ait', 'game.ait');
    const staleSibling = join(root, 'stale-sibling.ait');
    writeFile(source, 'stale exact archive');
    writeFile(destination, 'old destination archive');
    writeFile(staleSibling, 'stale sibling archive');

    await buildAit({
      root,
      frameworkPackagePath,
      env: { FAKE_AIT_CONTENT: 'fresh archive' },
    });

    assert.equal(read(destination), 'fresh archive');
    assert.equal(read(staleSibling), 'stale sibling archive');
    assert.equal(existsSync(source), false);
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith('.ait-source-stash-')),
      [],
    );
  });
});
