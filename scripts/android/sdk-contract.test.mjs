import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  COMMAND_LINE_TOOLS,
  SDK_PACKAGES,
  localPropertiesSdkDir,
} from './sdk-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const installer = join(root, 'scripts', 'android', 'Install-AndroidSdk.ps1');

test('Android command-line tools archive is pinned to the reviewed artifact', () => {
  assert.deepEqual(COMMAND_LINE_TOOLS, {
    build: '15859902',
    archiveName: 'commandlinetools-win-15859902_latest.zip',
    url: 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip',
    sha256: '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a',
  });
});

test('SDK packages are exact, ordered, and API 36 scoped', () => {
  assert.deepEqual(SDK_PACKAGES, [
    'platform-tools',
    'platforms;android-36',
    'build-tools;36.0.0',
    'emulator',
    'system-images;android-36;google_apis;x86_64',
  ]);
});

test('Gradle local.properties escapes a Windows SDK path', () => {
  assert.equal(
    localPropertiesSdkDir('C:\\Users\\USER\\AppData\\Local\\Android\\Sdk'),
    'sdk.dir=C\\:\\\\Users\\\\USER\\\\AppData\\\\Local\\\\Android\\\\Sdk',
  );
});

test('installer rejects a checksum mismatch without extracting it', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-sdk-checksum-'));
  const archive = join(fixture, 'tools.zip');
  writeFileSync(archive, 'not-an-android-sdk-archive');

  try {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      installer,
      '-ValidateOnly',
      '-Archive',
      archive,
    ], { encoding: 'utf8', windowsHide: true });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /TEPPU_ANDROID_TOOLS_CHECKSUM_MISMATCH/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('installer rejects every SDK root outside the current user location', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-sdk-root-'));
  try {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      installer,
      '-ValidateOnly',
      '-AndroidSdk',
      fixture,
    ], { encoding: 'utf8', windowsHide: true });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /TEPPU_ANDROID_SDK_ROOT_REJECTED/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('installer uses the pinned contract and gates license acceptance explicitly', () => {
  const source = readFileSync(installer, 'utf8');
  assert.ok(source.includes(COMMAND_LINE_TOOLS.url));
  assert.ok(source.includes(COMMAND_LINE_TOOLS.sha256));
  for (const packageName of SDK_PACKAGES) {
    assert.ok(source.includes(packageName));
  }
  assert.match(source, /if \(\$AcceptLicenses\.IsPresent\)/u);
  assert.match(source, /-Responses \(@\('y'\) \* 64\)/u);
  assert.doesNotMatch(source, /(?:echo|Write-Output)\s+["']?y["']?\s*\|/iu);
  assert.doesNotMatch(source, /yes\s*\|/iu);
});
