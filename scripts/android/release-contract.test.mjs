import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  inspectGradleSigningContract,
  redactSecrets,
  releaseArtifactName,
  resolveReleaseArtifactPaths,
  resolveSigningPaths,
} from './release-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('signing material is confined to the approved user-profile directory', () => {
  assert.deepEqual(resolveSigningPaths('C:\\Users\\USER'), {
    directory: 'C:\\Users\\USER\\.teppu\\android-signing',
    keystore: 'C:\\Users\\USER\\.teppu\\android-signing\\teppu-upload.jks',
    credential: 'C:\\Users\\USER\\.teppu\\android-signing\\teppu-signing.credential.xml',
    metadata: 'C:\\Users\\USER\\.teppu\\android-signing\\README.txt',
  });
  assert.throws(() => resolveSigningPaths('relative\\profile'), /absolute Windows path/u);
});

test('release artifacts use a path-safe versioned name under the project', () => {
  assert.equal(releaseArtifactName('1.0.0'), 'teppu-1.0.0-release.apk');
  assert.throws(() => releaseArtifactName('../escape'), /Invalid Android version/u);
  const paths = resolveReleaseArtifactPaths(root);
  assert.equal(paths.apk, join(root, 'artifacts', 'android', 'teppu-1.0.0-release.apk'));
  assert.equal(paths.checksum, `${paths.apk}.sha256`);
  assert.equal(paths.report, join(root, 'artifacts', 'android', 'verification.txt'));
});

test('diagnostics redact known and assignment-shaped secrets', () => {
  const redacted = redactSecrets(
    'storePassword=secret-1 keyPassword: secret-2 repeated=secret-1',
    ['secret-1', 'secret-2'],
  );
  assert.doesNotMatch(redacted, /secret-[12]/u);
  assert.match(redacted, /storePassword=\[REDACTED\]/u);
  assert.match(redacted, /keyPassword: \[REDACTED\]/u);
});

test('Gradle release signing has an environment-only fail-closed contract', () => {
  const source = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  assert.deepEqual(inspectGradleSigningContract(source), {
    missingEnvironment: [],
    hasReleaseGuard: true,
    hasUnsafeLiteral: false,
  });
});

test('PowerShell validation refuses partial or missing external state without echoing it', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'teppu-release-validation-'));
  const userProfile = join(fixture, 'profile');
  const signingDirectory = join(userProfile, '.teppu', 'android-signing');
  const sentinel = 'TOP_SECRET_SENTINEL_DO_NOT_PRINT';
  mkdirSync(signingDirectory, { recursive: true });
  writeFileSync(join(signingDirectory, 'teppu-signing.credential.xml'), sentinel);

  const invocations = [
    {
      script: 'Initialize-AndroidSigning.ps1',
      args: ['-ValidateOnly', '-UserProfileRoot', userProfile],
      expectedCode: 'TEPPU_SIGNING_SETUP_PARTIAL',
    },
    {
      script: 'Build-AndroidRelease.ps1',
      args: ['-ValidateOnly', '-ProjectRoot', root, '-UserProfileRoot', userProfile],
      expectedCode: 'TEPPU_SIGNING_SETUP_PARTIAL',
    },
    {
      script: 'Verify-AndroidRelease.ps1',
      args: [
        '-ValidateOnly',
        '-ProjectRoot',
        root,
        '-Apk',
        join(root, 'artifacts', 'android', 'missing-release.apk'),
      ],
      expectedCode: 'TEPPU_ANDROID_APK_MISSING',
    },
  ];

  try {
    for (const invocation of invocations) {
      const result = spawnSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(root, 'scripts', 'android', invocation.script),
        ...invocation.args,
      ], { encoding: 'utf8', windowsHide: true });
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      assert.notEqual(result.status, 0, `${invocation.script} must reject invalid state`);
      assert.match(output, new RegExp(invocation.expectedCode, 'u'));
      assert.doesNotMatch(output, new RegExp(sentinel, 'u'));
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('release artifacts and verification reports are published atomically', () => {
  const commonSource = readFileSync(
    join(root, 'scripts', 'android', 'AndroidRelease.Common.ps1'),
    'utf8',
  );
  const buildSource = readFileSync(
    join(root, 'scripts', 'android', 'Build-AndroidRelease.ps1'),
    'utf8',
  );
  const verifySource = readFileSync(
    join(root, 'scripts', 'android', 'Verify-AndroidRelease.ps1'),
    'utf8',
  );

  assert.match(
    commonSource,
    /function Publish-TeppuFileAtomically[\s\S]*\[IO\.File\]::Replace/u,
  );
  assert.match(buildSource, /Publish-TeppuFileAtomically -Source \$temporaryArtifact/u);
  assert.match(buildSource, /Publish-TeppuFileAtomically -Source \$temporaryChecksum/u);
  assert.match(verifySource, /Publish-TeppuFileAtomically -Source \$temporaryReport/u);
});
