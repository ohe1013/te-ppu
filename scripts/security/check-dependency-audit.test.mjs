import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checkerPath = fileURLToPath(new URL('./check-dependency-audit.mjs', import.meta.url));
const fixturePath = (name) => fileURLToPath(new URL(`./fixtures/dependency-audit/${name}`, import.meta.url));

function runChecker({
  audit = 'audit-unchanged.json',
  auditPath = fixturePath(audit),
  baseline = 'baseline.json',
  baselinePath = fixturePath(baseline),
  lock = 'package-lock.json',
  lockPath = fixturePath(lock),
} = {}) {
  const result = spawnSync(
    process.execPath,
    [
      checkerPath,
      '--audit', auditPath,
      '--baseline', baselinePath,
      '--lock', lockPath,
    ],
    { encoding: 'utf8' },
  );

  return {
    ...result,
    output: `${result.stdout}${result.stderr}`,
  };
}

const validAudit = JSON.parse(readFileSync(fixturePath('audit-unchanged.json'), 'utf8'));
const validBaseline = JSON.parse(readFileSync(fixturePath('baseline.json'), 'utf8'));
const validLock = JSON.parse(readFileSync(fixturePath('package-lock.json'), 'utf8'));

function mutated(value, change) {
  const copy = structuredClone(value);
  change(copy);
  return copy;
}

function runCheckerWithJson({ audit = validAudit, baseline = validBaseline, lock = validLock }) {
  const directory = mkdtempSync(join(tmpdir(), 'te-ppu-dependency-audit-'));
  const auditPath = join(directory, 'audit.json');
  const baselinePath = join(directory, 'baseline.json');
  const lockPath = join(directory, 'package-lock.json');
  writeFileSync(auditPath, JSON.stringify(audit));
  writeFileSync(baselinePath, JSON.stringify(baseline));
  writeFileSync(lockPath, JSON.stringify(lock));
  try {
    return runChecker({ auditPath, baselinePath, lockPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function defineOwn(object, key, value) {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function collisionFixture(name) {
  const audit = structuredClone(validAudit);
  const baseline = structuredClone(validBaseline);
  const lock = structuredClone(validLock);
  const vulnerability = structuredClone(validAudit.vulnerabilities.alpha);
  const expected = structuredClone(validBaseline.vulnerabilities.alpha);
  const nodePath = `node_modules/${name}`;
  const advisoryId = `GHSA-test-${name}`;
  const advisoryTitle = `fixture ${name} advisory`;
  const advisoryUrl = `https://github.com/advisories/${advisoryId}`;

  vulnerability.name = name;
  vulnerability.nodes = [nodePath];
  Object.assign(vulnerability.via[0], {
    dependency: name,
    name,
    title: advisoryTitle,
    url: advisoryUrl,
  });
  expected.nodes = [{ path: nodePath, version: '1.0.0' }];
  Object.assign(expected.via[0], {
    dependency: name,
    id: advisoryId,
    title: advisoryTitle,
    url: advisoryUrl,
  });
  lock.packages[nodePath] = { version: '1.0.0' };

  return { audit, baseline, expected, lock, vulnerability };
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

for (const name of ['constructor', '__proto__']) {
  test(`rejects a new vulnerability whose name collides with ${name}`, () => {
    const fixture = collisionFixture(name);
    defineOwn(fixture.audit.vulnerabilities, name, fixture.vulnerability);
    assert.equal(Object.hasOwn(
      JSON.parse(JSON.stringify(fixture.audit)).vulnerabilities,
      name,
    ), true);

    const result = runCheckerWithJson(fixture);

    assert.equal(result.status, 1, result.output);
    assert.ok(result.output.includes(`UNREVIEWED_NEW package=${name} `), result.output);
    assert.match(result.output, /DEPENDENCY_AUDIT_REVIEW_REQUIRED new=1 changed=0 versionChanged=0 expired=0/);
  });

  test(`reports a removed reviewed vulnerability whose name collides with ${name}`, () => {
    const fixture = collisionFixture(name);
    defineOwn(fixture.baseline.vulnerabilities, name, fixture.expected);
    assert.equal(Object.hasOwn(
      JSON.parse(JSON.stringify(fixture.baseline)).vulnerabilities,
      name,
    ), true);

    const result = runCheckerWithJson(fixture);

    assert.equal(result.status, 0, result.output);
    assert.ok(result.output.includes(`RESOLVED_EXCEPTION package=${name} `), result.output);
    assert.match(result.output, /DEPENDENCY_AUDIT_BASELINE_MATCH known=2 resolved=1 status=PENDING_UPSTREAM/);
  });
}

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

const auditShapeCases = [
  {
    name: 'an array vulnerabilities collection',
    change: (audit) => { audit.vulnerabilities = []; },
    message: /audit vulnerabilities must be an object/,
  },
  {
    name: 'a null vulnerability record',
    change: (audit) => { audit.vulnerabilities.alpha = null; },
    message: /audit vulnerability alpha must be an object/,
  },
  {
    name: 'a missing vulnerability name',
    change: (audit) => { delete audit.vulnerabilities.alpha.name; },
    message: /audit vulnerability alpha\.name/,
  },
  {
    name: 'a non-string severity',
    change: (audit) => { audit.vulnerabilities.alpha.severity = 9; },
    message: /audit vulnerability alpha\.severity/,
  },
  {
    name: 'a non-boolean isDirect',
    change: (audit) => { audit.vulnerabilities.alpha.isDirect = 'false'; },
    message: /audit vulnerability alpha\.isDirect/,
  },
  {
    name: 'a null aggregate range',
    change: (audit) => { audit.vulnerabilities.alpha.range = null; },
    message: /audit vulnerability alpha\.range/,
  },
  {
    name: 'a missing via array',
    change: (audit) => { delete audit.vulnerabilities.alpha.via; },
    message: /audit vulnerability alpha\.via must be an array/,
  },
  {
    name: 'a null via array',
    change: (audit) => { audit.vulnerabilities.alpha.via = null; },
    message: /audit vulnerability alpha\.via must be an array/,
  },
  {
    name: 'an empty dependency name in via',
    change: (audit) => { audit.vulnerabilities.beta.via = ['']; },
    message: /audit vulnerability beta\.via\[0\]/,
  },
  {
    name: 'an incomplete advisory object in via',
    change: (audit) => { delete audit.vulnerabilities.alpha.via[0].title; },
    message: /audit vulnerability alpha\.via\[0\]\.title/,
  },
  {
    name: 'a non-array advisory cwe',
    change: (audit) => { audit.vulnerabilities.alpha.via[0].cwe = 'CWE-100'; },
    message: /audit vulnerability alpha\.via\[0\]\.cwe/,
  },
  {
    name: 'an incomplete advisory cvss object',
    change: (audit) => { delete audit.vulnerabilities.alpha.via[0].cvss.vectorString; },
    message: /audit vulnerability alpha\.via\[0\]\.cvss\.vectorString/,
  },
  {
    name: 'a missing effects array',
    change: (audit) => { delete audit.vulnerabilities.alpha.effects; },
    message: /audit vulnerability alpha\.effects must be an array/,
  },
  {
    name: 'a non-array effects value',
    change: (audit) => { audit.vulnerabilities.alpha.effects = 'tool'; },
    message: /audit vulnerability alpha\.effects must be an array/,
  },
  {
    name: 'a non-string effects entry',
    change: (audit) => { audit.vulnerabilities.alpha.effects = [null]; },
    message: /audit vulnerability alpha\.effects\[0\]/,
  },
  {
    name: 'a missing nodes array',
    change: (audit) => { delete audit.vulnerabilities.alpha.nodes; },
    message: /audit vulnerability alpha\.nodes must be an array/,
  },
  {
    name: 'a non-array nodes value',
    change: (audit) => { audit.vulnerabilities.alpha.nodes = 'node_modules/alpha'; },
    message: /audit vulnerability alpha\.nodes must be an array/,
  },
  {
    name: 'a non-string nodes entry',
    change: (audit) => { audit.vulnerabilities.alpha.nodes = [42]; },
    message: /audit vulnerability alpha\.nodes\[0\]/,
  },
  {
    name: 'a missing fixAvailable',
    change: (audit) => { delete audit.vulnerabilities.alpha.fixAvailable; },
    message: /audit vulnerability alpha\.fixAvailable/,
  },
  {
    name: 'a null fixAvailable',
    change: (audit) => { audit.vulnerabilities.alpha.fixAvailable = null; },
    message: /audit vulnerability alpha\.fixAvailable/,
  },
  {
    name: 'a string fixAvailable',
    change: (audit) => { audit.vulnerabilities.alpha.fixAvailable = 'false'; },
    message: /audit vulnerability alpha\.fixAvailable/,
  },
  {
    name: 'an incomplete fixAvailable object',
    change: (audit) => {
      audit.vulnerabilities.alpha.fixAvailable = { name: 'alpha', version: '2.0.0' };
    },
    message: /audit vulnerability alpha\.fixAvailable\.isSemVerMajor/,
  },
];

for (const fixture of auditShapeCases) {
  test(`rejects ${fixture.name} before normalization`, () => {
    const result = runCheckerWithJson({ audit: mutated(validAudit, fixture.change) });

    assert.equal(result.status, 2, result.output);
    assert.match(result.output, fixture.message);
  });
}

const baselinePolicyCases = [
  {
    name: 'a non-pending status',
    change: (baseline) => { baseline.policy.status = 'REVIEWED'; },
    message: /baseline policy\.status must be PENDING_UPSTREAM/,
  },
  {
    name: 'a non-prototype-only scope',
    change: (baseline) => { baseline.policy.scope = 'private-prototype'; },
    message: /baseline policy\.scope must be private-prototype-only/,
  },
  {
    name: 'an impossible reviewedOn date',
    change: (baseline) => { baseline.policy.reviewedOn = '2026-02-30'; },
    message: /baseline policy\.reviewedOn must be a real YYYY-MM-DD date/,
  },
  {
    name: 'a non-padded reviewedOn date',
    change: (baseline) => { baseline.policy.reviewedOn = '2026-8-2'; },
    message: /baseline policy\.reviewedOn must be a real YYYY-MM-DD date/,
  },
  {
    name: 'an impossible expiresOn date',
    change: (baseline) => { baseline.policy.expiresOn = '2026-02-30'; },
    message: /baseline policy\.expiresOn must be a real YYYY-MM-DD date/,
  },
];

for (const fixture of baselinePolicyCases) {
  test(`rejects ${fixture.name} in the exception policy`, () => {
    const result = runCheckerWithJson({ baseline: mutated(validBaseline, fixture.change) });

    assert.equal(result.status, 2, result.output);
    assert.match(result.output, fixture.message);
  });
}
