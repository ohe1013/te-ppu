import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const checklistUrl = new URL('../../docs/qa/apps-in-toss-private-qr.md', import.meta.url);

test('exposes the delivery gate tests and source-policy scan as package commands', () => {
  assert.equal(packageJson.devDependencies['@apps-in-toss/ait-format'], '1.0.0');
  assert.equal(
    packageJson.scripts['check:source-policy'],
    'node scripts/security/check-authored-source-policy.mjs',
  );
  assert.match(
    packageJson.scripts['test:delivery-gates'],
    /scripts\/verify-ait-package\.test\.mjs/,
  );
  assert.match(
    packageJson.scripts['test:delivery-gates'],
    /scripts\/security\/check-authored-source-policy\.test\.mjs/,
  );
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
    'npm run check:dependency-audit',
    'npm run build:ait',
    'npm run check:ait',
    'npm run check:source-policy',
  ]) {
    assert.ok(checklist.includes(`\`${command}\``), `missing evidence placeholder for ${command}`);
  }
});
