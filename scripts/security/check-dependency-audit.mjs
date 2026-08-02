import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REVIEWED_FIELDS = ['severity', 'isDirect', 'via', 'effects', 'fixAvailable'];
const AUDIT_SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function requireNonEmptyString(value, path) {
  if (!isNonEmptyString(value)) throw new Error(`${path} must be a non-empty string`);
}

function requireSeverity(value, path) {
  if (typeof value !== 'string' || !AUDIT_SEVERITIES.has(value)) {
    throw new Error(`${path} must be a valid npm audit severity`);
  }
}

function requireStringArray(value, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (!allowEmpty && value.length === 0) throw new Error(`${path} must not be empty`);
  value.forEach((entry, index) => requireNonEmptyString(entry, `${path}[${index}]`));
}

function validateAdvisory(advisory, path) {
  if (!isObject(advisory)) throw new Error(`${path} must be a non-empty dependency name or advisory object`);
  if (!Number.isInteger(advisory.source) || advisory.source < 0) {
    throw new Error(`${path}.source must be a non-negative integer`);
  }
  requireNonEmptyString(advisory.name, `${path}.name`);
  requireNonEmptyString(advisory.dependency, `${path}.dependency`);
  requireNonEmptyString(advisory.title, `${path}.title`);
  requireNonEmptyString(advisory.url, `${path}.url`);
  requireSeverity(advisory.severity, `${path}.severity`);
  requireStringArray(advisory.cwe, `${path}.cwe`);
  if (!isObject(advisory.cvss)) throw new Error(`${path}.cvss must be an object`);
  if (typeof advisory.cvss.score !== 'number' || !Number.isFinite(advisory.cvss.score)) {
    throw new Error(`${path}.cvss.score must be a finite number`);
  }
  if (!Object.hasOwn(advisory.cvss, 'vectorString') || (
    advisory.cvss.vectorString !== null
    && typeof advisory.cvss.vectorString !== 'string'
  )) {
    throw new Error(`${path}.cvss.vectorString must be a string or null`);
  }
  requireNonEmptyString(advisory.range, `${path}.range`);
}

function validateFixAvailable(value, path) {
  if (typeof value === 'boolean') return;
  if (!isObject(value)) throw new Error(`${path} must be a boolean or complete object`);
  requireNonEmptyString(value.name, `${path}.name`);
  requireNonEmptyString(value.version, `${path}.version`);
  if (typeof value.isSemVerMajor !== 'boolean') {
    throw new Error(`${path}.isSemVerMajor must be a boolean`);
  }
}

function validateAudit(audit) {
  if (!isObject(audit) || audit.auditReportVersion !== 2) {
    throw new Error('expected npm audit JSON with auditReportVersion 2');
  }
  if (!isObject(audit.vulnerabilities)) throw new Error('audit vulnerabilities must be an object');

  for (const [name, vulnerability] of Object.entries(audit.vulnerabilities)) {
    const path = `audit vulnerability ${name}`;
    if (!isObject(vulnerability)) throw new Error(`${path} must be an object`);
    if (vulnerability.name !== name) throw new Error(`${path}.name must equal ${JSON.stringify(name)}`);
    requireSeverity(vulnerability.severity, `${path}.severity`);
    if (typeof vulnerability.isDirect !== 'boolean') throw new Error(`${path}.isDirect must be a boolean`);
    requireNonEmptyString(vulnerability.range, `${path}.range`);

    if (!Array.isArray(vulnerability.via)) throw new Error(`${path}.via must be an array`);
    vulnerability.via.forEach((entry, index) => {
      if (typeof entry === 'string') {
        requireNonEmptyString(entry, `${path}.via[${index}]`);
      } else {
        validateAdvisory(entry, `${path}.via[${index}]`);
      }
    });
    requireStringArray(vulnerability.effects, `${path}.effects`);
    requireStringArray(vulnerability.nodes, `${path}.nodes`, { allowEmpty: false });
    if (!Object.hasOwn(vulnerability, 'fixAvailable')) throw new Error(`${path}.fixAvailable is required`);
    validateFixAvailable(vulnerability.fixAvailable, `${path}.fixAvailable`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function advisoryId(advisory) {
  const match = typeof advisory.url === 'string'
    ? advisory.url.match(/\/advisories\/([^/?#]+)\/?(?:[?#].*)?$/)
    : null;
  return match?.[1] ?? `npm:${String(advisory.source)}`;
}

function normalizeVia(value) {
  if (typeof value === 'string') return { kind: 'dependency', name: value };

  return {
    kind: 'advisory',
    id: advisoryId(value),
    source: value.source,
    dependency: value.dependency,
    title: value.title,
    url: value.url,
    severity: value.severity,
    cwe: [...value.cwe].sort(),
    cvss: { score: value.cvss.score, vectorString: value.cvss.vectorString },
    range: value.range,
  };
}

function normalizeFixAvailable(value) {
  if (typeof value === 'boolean') return value;
  return {
    name: value.name,
    version: value.version,
    isSemVerMajor: value.isSemVerMajor,
  };
}

export function normalizeAudit(audit, lock) {
  validateAudit(audit);
  if (!isObject(lock) || !isObject(lock.packages)) {
    throw new Error('expected package-lock JSON with a packages map');
  }

  return Object.fromEntries(Object.entries(audit.vulnerabilities).sort(([left], [right]) => left.localeCompare(right)).map(([name, vulnerability]) => {
    const nodePaths = [...new Set(vulnerability.nodes)].sort();
    const nodes = nodePaths.map((path) => {
      const version = lock.packages[path]?.version;
      if (typeof version !== 'string') throw new Error(`lockfile has no exact version for ${path}`);
      return { path, version };
    });

    return [name, {
      severity: vulnerability.severity,
      isDirect: vulnerability.isDirect,
      range: vulnerability.range,
      via: vulnerability.via.map(normalizeVia).sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
      effects: [...vulnerability.effects].sort(),
      nodes,
      fixAvailable: normalizeFixAvailable(vulnerability.fixAvailable),
    }];
  }));
}

function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1) throw new Error('baseline schemaVersion must be 1');
  if (!isObject(baseline.policy)) throw new Error('baseline policy is required');
  if (!isObject(baseline.vulnerabilities)) throw new Error('baseline vulnerabilities map is required');
  requireNonEmptyString(baseline.policy.owner, 'baseline policy.owner');
  if (baseline.policy.status !== 'PENDING_UPSTREAM') {
    throw new Error('baseline policy.status must be PENDING_UPSTREAM');
  }
  if (baseline.policy.scope !== 'private-prototype-only') {
    throw new Error('baseline policy.scope must be private-prototype-only');
  }
  requireRealDate(baseline.policy.reviewedOn, 'baseline policy.reviewedOn');
  requireRealDate(baseline.policy.expiresOn, 'baseline policy.expiresOn');
}

function requireRealDate(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${path} must be a real YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${path} must be a real YYYY-MM-DD date`);
  }
}

function formatRecord(name, vulnerability) {
  const versions = [...new Set(vulnerability.nodes.map(({ version }) => version))].sort().join(',');
  const advisories = vulnerability.via.map((via) => via.kind === 'advisory' ? via.id : `via:${via.name}`).sort().join(',');
  return `package=${name} versions=${versions || 'none'} advisories=${advisories || 'none'} severity=${vulnerability.severity}`;
}

function isExpired(expiresOn, now) {
  const lastAllowedMoment = new Date(`${expiresOn}T23:59:59.999Z`);
  return now > lastAllowedMoment;
}

export function evaluateAudit({ audit, baseline, lock, now = new Date() }) {
  validateBaseline(baseline);
  const actual = normalizeAudit(audit, lock);
  const lines = [];
  const newPackages = [];
  const changedPackages = [];
  const versionChangedPackages = new Set();
  const resolvedPackages = [];
  let knownCount = 0;

  for (const [name, expected] of Object.entries(baseline.vulnerabilities).sort(([left], [right]) => left.localeCompare(right))) {
    for (const { path, version: expectedVersion } of expected.nodes) {
      const actualVersion = lock.packages[path]?.version ?? 'MISSING';
      if (actualVersion !== expectedVersion) {
        versionChangedPackages.add(name);
        lines.push(`UNREVIEWED_VERSION package=${name} path=${path} expected=${expectedVersion} actual=${actualVersion}`);
      }
    }

    if (!Object.hasOwn(actual, name)) {
      resolvedPackages.push(name);
      lines.push(`RESOLVED_EXCEPTION ${formatRecord(name, expected)}`);
      continue;
    }
    const current = actual[name];

    const changedFields = REVIEWED_FIELDS.filter((field) => stableJson(expected[field]) !== stableJson(current[field]));
    const expectedPaths = expected.nodes.map(({ path }) => path).sort();
    const currentPaths = current.nodes.map(({ path }) => path).sort();
    if (stableJson(expectedPaths) !== stableJson(currentPaths)) changedFields.push('nodes');

    if (changedFields.length > 0) {
      changedPackages.push(name);
      lines.push(`UNREVIEWED_CHANGED package=${name} fields=${changedFields.join(',')}`);
    } else if (!versionChangedPackages.has(name)) {
      knownCount += 1;
      lines.push(`KNOWN_EXCEPTION ${formatRecord(name, current)}`);
    }
  }

  for (const [name, current] of Object.entries(actual)) {
    if (Object.hasOwn(baseline.vulnerabilities, name)) continue;
    newPackages.push(name);
    lines.push(`UNREVIEWED_NEW ${formatRecord(name, current)}`);
  }

  const expired = isExpired(baseline.policy.expiresOn, now) ? 1 : 0;
  if (expired) lines.push(`EXCEPTION_EXPIRED owner=${baseline.policy.owner} expiresOn=${baseline.policy.expiresOn}`);

  const requiresReview = newPackages.length > 0
    || changedPackages.length > 0
    || versionChangedPackages.size > 0
    || expired > 0;
  if (requiresReview) {
    lines.push(`DEPENDENCY_AUDIT_REVIEW_REQUIRED new=${newPackages.length} changed=${changedPackages.length} versionChanged=${versionChangedPackages.size} expired=${expired}`);
  } else {
    lines.push(`DEPENDENCY_AUDIT_BASELINE_MATCH known=${knownCount} resolved=${resolvedPackages.length} status=${baseline.policy.status}`);
  }

  return { exitCode: requiresReview ? 1 : 0, lines };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!['--audit', '--baseline', '--lock'].includes(flag) || !value) {
      throw new Error('usage: check-dependency-audit.mjs [--audit audit.json] --baseline baseline.json --lock package-lock.json');
    }
    options[flag.slice(2)] = value;
  }
  if (!options.baseline || !options.lock) throw new Error('--baseline and --lock are required');
  return options;
}

async function readStandardInput() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error('npm audit JSON is required on stdin or through --audit');
  return input;
}

async function readJson(path, label) {
  const source = path ? await readFile(path, 'utf8') : await readStandardInput();
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const [audit, baseline, lock] = await Promise.all([
      readJson(options.audit, 'audit input'),
      readJson(options.baseline, 'baseline'),
      readJson(options.lock, 'lockfile'),
    ]);
    const result = evaluateAudit({ audit, baseline, lock });
    for (const line of result.lines) console.log(line);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`DEPENDENCY_AUDIT_INPUT_ERROR ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
