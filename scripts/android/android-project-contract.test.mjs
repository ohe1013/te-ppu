import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  findMissingAndroidProjectFiles,
  readAndroidEnv,
  readCapacitorConfig,
  readCapacitorVersions,
} from './android-project-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('contract readers expose normalized project behavior from complete fixtures', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-android-contract-'));
  try {
    writeFileSync(join(fixture, 'capacitor.config.json'), JSON.stringify({
      appId: 'fixture.app',
      appName: 'Fixture',
      webDir: 'public',
      ignored: true,
    }));
    writeFileSync(join(fixture, '.env.android'), [
      '# ignored',
      'VITE_RUNTIME_MODE = android',
      '',
    ].join('\n'));
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      dependencies: {
        '@capacitor/android': '3.0.0',
        '@capacitor/app': '4.0.0',
        '@capacitor/core': '1.0.0',
      },
      devDependencies: { '@capacitor/cli': '2.0.0' },
    }));
    for (const relativePath of [
      'android/gradlew.bat',
      'android/variables.gradle',
      'android/app/src/main/AndroidManifest.xml',
    ]) {
      const path = join(fixture, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'fixture');
    }

    assert.deepEqual(readCapacitorConfig(fixture), {
      appId: 'fixture.app',
      appName: 'Fixture',
      webDir: 'public',
    });
    assert.deepEqual(readAndroidEnv(fixture), { VITE_RUNTIME_MODE: 'android' });
    assert.deepEqual(readCapacitorVersions(fixture), {
      core: '1.0.0',
      cli: '2.0.0',
      android: '3.0.0',
      app: '4.0.0',
    });
    assert.deepEqual(findMissingAndroidProjectFiles(fixture), []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Teppu Android project uses the approved offline package contract', () => {
  assert.deepEqual(readCapacitorConfig(root), {
    appId: 'io.github.ohe1013.teppu',
    appName: '테뿌리스',
    webDir: 'dist',
  });
  assert.equal(readAndroidEnv(root).VITE_RUNTIME_MODE, 'android');
  assert.deepEqual(readCapacitorVersions(root), {
    core: '8.5.0',
    cli: '8.5.0',
    android: '8.5.0',
    app: '8.1.1',
  });
  assert.deepEqual(findMissingAndroidProjectFiles(root), []);
});
