import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REVIEWED_FIELDS = ['severity', 'isDirect', 'via', 'effects', 'fixAvailable'];

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
  if (!value || typeof value !== 'object') throw new Error('audit via entries must be advisory objects or dependency names');

  return {
    kind: 'advisory',
    id: advisoryId(value),
    source: value.source ?? null,
    dependency: value.dependency ?? value.name ?? null,
    title: value.title ?? null,
    url: value.url ?? null,
    severity: value.severity ?? null,
    cwe: Array.isArray(value.cwe) ? [...value.cwe].sort() : [],
    cvss: value.cvss
      ? { score: value.cvss.score ?? null, vectorString: value.cvss.vectorString ?? null }
      : null,
    range: value.range ?? null,
  };
}

function normalizeFixAvailable(value) {
  if (!value || typeof value !== 'object') return value ?? false;
  return {
    name: value.name ?? null,
    version: value.version ?? null,
    isSemVerMajor: value.isSemVerMajor ?? false,
  };
}

export function normalizeAudit(audit, lock) {
  if (audit?.auditReportVersion !== 2 || !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object') {
    throw new Error('expected npm audit JSON with auditReportVersion 2');
  }
  if (!lock?.packages || typeof lock.packages !== 'object') {
    throw new Error('expected package-lock JSON with a packages map');
  }

  return Object.fromEntries(Object.entries(audit.vulnerabilities).sort(([left], [right]) => left.localeCompare(right)).map(([name, vulnerability]) => {
    const nodePaths = [...new Set(vulnerability.nodes ?? [])].sort();
    const nodes = nodePaths.map((path) => {
      const version = lock.packages[path]?.version;
      if (typeof version !== 'string') throw new Error(`lockfile has no exact version for ${path}`);
      return { path, version };
    });

    return [name, {
      severity: vulnerability.severity,
      isDirect: vulnerability.isDirect,
      range: vulnerability.range,
      via: [...(vulnerability.via ?? [])].map(normalizeVia).sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
      effects: [...(vulnerability.effects ?? [])].sort(),
      nodes,
      fixAvailable: normalizeFixAvailable(vulnerability.fixAvailable),
    }];
  }));
}

function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1) throw new Error('baseline schemaVersion must be 1');
  if (!baseline.policy || typeof baseline.policy !== 'object') throw new Error('baseline policy is required');
  if (!baseline.vulnerabilities || typeof baseline.vulnerabilities !== 'object') throw new Error('baseline vulnerabilities map is required');
  for (const key of ['owner', 'reviewedOn', 'expiresOn', 'scope', 'status']) {
    if (typeof baseline.policy[key] !== 'string' || baseline.policy[key].length === 0) {
      throw new Error(`baseline policy.${key} is required`);
    }
  }
}

function formatRecord(name, vulnerability) {
  const versions = [...new Set(vulnerability.nodes.map(({ version }) => version))].sort().join(',');
  const advisories = vulnerability.via.map((via) => via.kind === 'advisory' ? via.id : `via:${via.name}`).sort().join(',');
  return `package=${name} versions=${versions || 'none'} advisories=${advisories || 'none'} severity=${vulnerability.severity}`;
}

function isExpired(expiresOn, now) {
  const lastAllowedMoment = new Date(`${expiresOn}T23:59:59.999Z`);
  if (Number.isNaN(lastAllowedMoment.valueOf())) throw new Error('baseline policy.expiresOn must be YYYY-MM-DD');
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

    const current = actual[name];
    if (!current) {
      resolvedPackages.push(name);
      lines.push(`RESOLVED_EXCEPTION ${formatRecord(name, expected)}`);
      continue;
    }

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
    if (baseline.vulnerabilities[name]) continue;
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
