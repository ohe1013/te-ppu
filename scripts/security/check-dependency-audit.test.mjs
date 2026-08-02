import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checkerPath = fileURLToPath(new URL('./check-dependency-audit.mjs', import.meta.url));
const fixturePath = (name) => fileURLToPath(new URL(`./fixtures/dependency-audit/${name}`, import.meta.url));

function runChecker({
  audit = 'audit-unchanged.json',
  baseline = 'baseline.json',
  lock = 'package-lock.json',
} = {}) {
  const result = spawnSync(
    process.execPath,
    [
      checkerPath,
      '--audit', fixturePath(audit),
      '--baseline', fixturePath(baseline),
      '--lock', fixturePath(lock),
    ],
    { encoding: 'utf8' },
  );

  return {
    ...result,
    output: `${result.stdout}${result.stderr}`,
  };
}

test('accepts the exact reviewed audit while reporting known exceptions', () => {
  const result = runChecker();

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /KNOWN_EXCEPTION package=alpha versions=1\.0\.0 advisories=GHSA-test-alpha severity=critical/);
  assert.match(result.output, /KNOWN_EXCEPTION package=beta versions=2\.0\.0 advisories=via:alpha severity=high/);
  assert.match(result.output, /DEPENDENCY_AUDIT_BASELINE_MATCH known=2 resolved=0 status=PENDING_UPSTREAM/);
  assert.doesNotMatch(result.output, /\bclean\b/i);
});

test('rejects an advisory that is not in the reviewed baseline', () => {
  const result = runChecker({ audit: 'audit-new.json' });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /UNREVIEWED_NEW package=gamma versions=3\.0\.0 advisories=GHSA-test-gamma severity=moderate/);
  assert.match(result.output, /DEPENDENCY_AUDIT_REVIEW_REQUIRED new=1 changed=0 versionChanged=0 expired=0/);
});

test('rejects changed metadata for a reviewed advisory', () => {
  const result = runChecker({ audit: 'audit-changed.json' });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /UNREVIEWED_CHANGED package=alpha fields=via/);
  assert.match(result.output, /DEPENDENCY_AUDIT_REVIEW_REQUIRED new=0 changed=1 versionChanged=0 expired=0/);
});

test('rejects a changed locked dependency version', () => {
  const result = runChecker({ lock: 'package-lock-changed.json' });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /UNREVIEWED_VERSION package=alpha path=node_modules\/alpha expected=1\.0\.0 actual=1\.0\.1/);
  assert.match(result.output, /DEPENDENCY_AUDIT_REVIEW_REQUIRED new=0 changed=0 versionChanged=1 expired=0/);
});

test('accepts a removed advisory and reports the resolved exception', () => {
  const result = runChecker({ audit: 'audit-removed.json' });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /RESOLVED_EXCEPTION package=beta versions=2\.0\.0 advisories=via:alpha severity=high/);
  assert.match(result.output, /DEPENDENCY_AUDIT_BASELINE_MATCH known=1 resolved=1 status=PENDING_UPSTREAM/);
});

test('ignores npm aggregate package-range churn when advisory metadata is unchanged', () => {
  const result = runChecker({ audit: 'audit-aggregate-range.json' });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /DEPENDENCY_AUDIT_BASELINE_MATCH known=2 resolved=0 status=PENDING_UPSTREAM/);
});

test('rejects an expired exception even when the audit is unchanged', () => {
  const result = runChecker({ baseline: 'baseline-expired.json' });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /EXCEPTION_EXPIRED owner=fixture-maintainers expiresOn=2000-01-01/);
  assert.match(result.output, /DEPENDENCY_AUDIT_REVIEW_REQUIRED new=0 changed=0 versionChanged=0 expired=1/);
});
