import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ANDROID_COMPONENT,
  TEPPU_AVD_NAME,
  assertAvdName,
  hasFatalAndroidLog,
  parseBounds,
  resolveEmulatorEvidencePaths,
} from './emulator-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const smokeScript = join(root, 'scripts', 'android', 'Invoke-AndroidSmoke.ps1');

test('emulator identity is exact and rejects lookalike AVD names', () => {
  assert.equal(TEPPU_AVD_NAME, 'Teppu_API_36');
  assert.equal(ANDROID_COMPONENT, 'io.github.ohe1013.teppu/.MainActivity');
  assert.equal(assertAvdName('Teppu_API_36'), 'Teppu_API_36');
  assert.throws(() => assertAvdName('Teppu_API_35'), /must equal Teppu_API_36/u);
  assert.throws(() => assertAvdName('../Teppu_API_36'), /must equal Teppu_API_36/u);
});

test('emulator evidence paths stay under the ignored Android artifact directory', () => {
  assert.deepEqual(resolveEmulatorEvidencePaths(root), {
    directory: join(root, 'artifacts', 'android', 'emulator'),
    titleScreenshot: join(root, 'artifacts', 'android', 'emulator', 'title.png'),
    titleUi: join(root, 'artifacts', 'android', 'emulator', 'title.xml'),
    towerScreenshot: join(root, 'artifacts', 'android', 'emulator', 'tower.png'),
    towerUi: join(root, 'artifacts', 'android', 'emulator', 'tower.xml'),
    battleScreenshot: join(root, 'artifacts', 'android', 'emulator', 'battle.png'),
    battleUi: join(root, 'artifacts', 'android', 'emulator', 'battle.xml'),
    logcat: join(root, 'artifacts', 'android', 'emulator', 'logcat.txt'),
    report: join(root, 'artifacts', 'android', 'emulator', 'smoke.txt'),
  });
  assert.throws(
    () => resolveEmulatorEvidencePaths('relative-project'),
    /Project root must be absolute/u,
  );
});

test('UIAutomator bounds parsing returns a stable tap center', () => {
  assert.deepEqual(parseBounds('[42,317][318,373]'), {
    left: 42,
    top: 317,
    right: 318,
    bottom: 373,
    centerX: 180,
    centerY: 345,
  });
  assert.throws(() => parseBounds('[318,373][42,317]'), /Invalid bounds/u);
  assert.throws(() => parseBounds('42,317,318,373'), /Invalid bounds/u);
});

test('fatal Android log detection distinguishes app crashes from normal startup', () => {
  assert.equal(hasFatalAndroidLog('FATAL EXCEPTION: main'), true);
  assert.equal(hasFatalAndroidLog('E AndroidRuntime: Unable to start activity'), true);
  assert.equal(hasFatalAndroidLog('ActivityNotFoundException: missing'), true);
  assert.equal(hasFatalAndroidLog('I Capacitor: App started'), false);
});

test('PowerShell validation reports the exact AVD and component without mutation', () => {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    smokeScript,
    '-ValidateOnly',
    '-ProjectRoot',
    root,
  ], { encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /TEPPU_ANDROID_SMOKE_VALIDATION_OK/u);
  assert.match(output, /AVD: Teppu_API_36/u);
  assert.match(output, /Component: io\.github\.ohe1013\.teppu\/\.MainActivity/u);

  const rejected = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    smokeScript,
    '-ValidateOnly',
    '-ProjectRoot',
    root,
    '-AvdName',
    'Teppu_API_35',
  ], { encoding: 'utf8', windowsHide: true });
  const rejectedOutput = `${rejected.stdout ?? ''}\n${rejected.stderr ?? ''}`;
  assert.notEqual(rejected.status, 0);
  assert.match(rejectedOutput, /TEPPU_ANDROID_AVD_NAME_INVALID/u);
});
