import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const checklistUrl = new URL('../../docs/qa/apps-in-toss-private-qr.md', import.meta.url);

test('exposes asset, QR-config, isolated-build, and delivery gate commands', () => {
  assert.equal(packageJson.devDependencies['@apps-in-toss/ait-format'], '1.0.0');
  assert.equal(packageJson.scripts['check:assets'], 'node scripts/validate-assets.mjs');
  assert.equal(packageJson.scripts['check:ait-config'], 'node scripts/qa/check-ait-icon-env.mjs');
  assert.equal(packageJson.scripts['build:web'], 'npm run check:assets && vite build --mode browser');
  assert.equal(packageJson.scripts['build:ait'], 'npm run check:ait-config && node scripts/build-ait.mjs');
  assert.equal(packageJson.scripts['check:ait'], 'node scripts/verify-ait-package.mjs');
  assert.equal(
    packageJson.scripts['check:source-policy'],
    'node scripts/security/check-authored-source-policy.mjs',
  );
  for (const testPath of [
    'scripts/validate-assets.test.mjs',
    'scripts/qa/check-ait-icon-env.test.mjs',
    'scripts/build-ait.test.mjs',
    'scripts/verify-ait-package.test.mjs',
    'scripts/security/check-authored-source-policy.test.mjs',
  ]) {
    assert.ok(packageJson.scripts['test:delivery-gates'].includes(testPath), testPath);
  }
});

test('keeps external, upstream, and public-release states explicit in the QR checklist', () => {
  const checklist = readFileSync(checklistUrl, 'utf8');
  const pendingExternalCount = checklist.match(/PENDING_EXTERNAL/g)?.length ?? 0;

  assert.ok(pendingExternalCount >= 9, `expected at least 9 PENDING_EXTERNAL entries, found ${pendingExternalCount}`);
  assert.match(checklist, /Dependency status:\s*`PENDING_UPSTREAM`/);
  assert.match(checklist, /Public submission:\s*`BLOCKED`/);
  assert.match(checklist, /dependency-audit-exception\.md/);
  for (const command of [
    'npm run typecheck',
    'npm test',
    'npm run test:delivery-gates',
    'npm run test:e2e',
    'npm run check:assets',
    'npm run check:ait-config',
    'npm run check:dependency-audit',
    'npm run build:ait',
    'npm run check:ait -- artifacts/ait/game.ait',
    'npm run check:source-policy',
  ]) {
    assert.ok(checklist.includes(`\`${command}\``), `missing evidence placeholder for ${command}`);
  }
});

test('records QR metadata as automated config/package proof while retaining console and device evidence externally', () => {
  const checklist = readFileSync(checklistUrl, 'utf8');
  for (const variable of [
    'QR_EVIDENCE',
    'AIT_APP_NAME',
    'AIT_DISPLAY_NAME',
    'AIT_ICON_URL',
    'AIT_ARTIFACT_PATH',
  ]) {
    assert.ok(checklist.includes(variable), 'missing ' + variable + ' in checklist');
  }
  assert.match(checklist, /automated config\/package proof/i);
  assert.match(checklist, /PENDING_EXTERNAL.*console|console.*PENDING_EXTERNAL/is);
});

test('documents device-local per-HASH progress boundaries and the executable A to B to A QR protocol', () => {
  const identityDoc = readFileSync(
    new URL('../../docs/architecture/progress-identity.md', import.meta.url),
    'utf8',
  );
  const checklist = readFileSync(checklistUrl, 'utf8');

  for (const phrase of [
    'device-local',
    'per-HASH',
    'does not provide cross-device sync',
    'unkeyed legacy progress is not assigned to an Apps-in-Toss HASH',
    'raw legacy recovery evidence remains untouched',
    'rollback or manual support inspection',
    'not automatic in-game continuity',
  ]) {
    assert.ok(identityDoc.includes(phrase), `missing identity boundary: ${phrase}`);
  }

  for (const phrase of [
    'same private QR/origin',
    'without clearing the WebView',
    'B starts at defaults',
    "A's original state is unchanged",
  ]) {
    assert.ok(checklist.includes(phrase), `missing two-account QR step: ${phrase}`);
  }
});
