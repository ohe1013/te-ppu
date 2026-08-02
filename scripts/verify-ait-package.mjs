import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AITReader } from '@apps-in-toss/ait-format';
import { unzipSync } from 'fflate';

const SKIPPED_DIRECTORIES = new Set(['.git', '.worktrees', 'node_modules']);
const VULNERABLE_PACKAGES = [
  '@fastify/middie',
  'fastify',
  'find-my-way',
  'fast-uri',
  'ip',
  '@react-native-community/cli',
  '@react-native-community/cli-doctor',
  '@react-native-community/cli-hermes',
];
const TEXT_ENTRY_PATTERN = /\.(?:js|cjs|mjs|json|map)$/i;
const decoder = new TextDecoder();
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

async function findAitFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

  const found = [];
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await findAitFiles(path));
    } else if (entry.isFile() && /\.ait$/i.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

function portablePath(path) {
  return path.replaceAll('\\', '/');
}

function sanitizeSourceMap(value, sourcesContent) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeSourceMap(entry, sourcesContent));
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (key === 'names' && Array.isArray(entry)) return [key, []];
    if (key === 'sourcesContent' && Array.isArray(entry)) {
      sourcesContent.push(...entry.filter((source) => typeof source === 'string'));
    }
    return [key, sanitizeSourceMap(entry, sourcesContent)];
  }));
}

function markerScanSource(entryName, source) {
  if (!/\.map$/i.test(entryName)) return source;
  try {
    const sourceMap = JSON.parse(source);
    if (sourceMap === null || typeof sourceMap !== 'object' || Array.isArray(sourceMap)) return source;
    // Source-map names are identifiers, so a common name such as `ip` is not package evidence.
    // Sources, sourcesContent, and every other map field remain in the marker scan.
    const sourcesContent = [];
    const sanitizedSourceMap = sanitizeSourceMap(sourceMap, sourcesContent);
    return [JSON.stringify(sanitizedSourceMap), ...sourcesContent].join('\n');
  } catch {
    return source;
  }
}

function containsContentMarker(source, packageName) {
  const normalizedSource = portablePath(source).replace(/\/{2,}/g, '/');
  return source.includes(`"${packageName}"`)
    || source.includes(`'${packageName}'`)
    || source.includes(`\`${packageName}\``)
    || normalizedSource.includes(`node_modules/${packageName}/`);
}

function unzipWithinLimit(zipBlob, maxUncompressedBytes) {
  let indexedBytes = 0;
  const entryNames = new Set();
  return unzipSync(zipBlob, {
    filter(entry) {
      if (entryNames.has(entry.name)) {
        throw new Error(`Duplicate ZIP entry in .ait: ${entry.name}`);
      }
      entryNames.add(entry.name);
      indexedBytes += entry.originalSize;
      if (indexedBytes > maxUncompressedBytes) {
        throw new Error(
          `Uncompressed bundle is ${indexedBytes} bytes; limit is ${maxUncompressedBytes}`,
        );
      }
      return true;
    },
  });
}

export async function verifyAitPackage(
  root = process.cwd(),
  maxUncompressedBytes = MAX_UNCOMPRESSED_BYTES,
) {
  const files = await findAitFiles(root);
  if (files.length !== 1) {
    const labels = files.map((path) => portablePath(relative(root, path)));
    const details = labels.length > 0 ? `: ${labels.join(', ')}` : '';
    throw new Error(`Expected exactly one .ait file, found ${files.length}${details}`);
  }

  const [archivePath] = files;
  const archiveBytes = new Uint8Array(await readFile(archivePath));
  const reader = AITReader.fromBuffer(archiveBytes);
  const entries = unzipWithinLimit(reader.readZipBlob(), maxUncompressedBytes);
  const inspection = inspectArchiveEntries(entries, maxUncompressedBytes);
  const lines = inspection.entryNames.map((entryName) => (
    `AIT_ENTRY ${entryName} bytes=${entries[entryName].byteLength}`
  ));

  const archiveLabel = portablePath(relative(root, archivePath));
  lines.push(
    `AIT_OK ${archiveLabel} uncompressedBytes=${inspection.uncompressedBytes} entries=${inspection.entryNames.length} vulnerablePackageMarkers=0`,
  );
  return lines;
}

export function inspectArchiveEntries(entries, maxUncompressedBytes = MAX_UNCOMPRESSED_BYTES) {
  const entryNames = Object.keys(entries).sort((left, right) => left.localeCompare(right, 'en'));
  let uncompressedBytes = 0;
  const findings = [];

  for (const entryName of entryNames) {
    const data = entries[entryName];
    const bytes = data.byteLength;
    uncompressedBytes += bytes;

    const normalizedName = portablePath(entryName);
    for (const packageName of VULNERABLE_PACKAGES) {
      if (normalizedName.includes(`node_modules/${packageName}/`)) {
        findings.push(`${entryName}:path:${packageName}`);
      }
    }
    if (TEXT_ENTRY_PATTERN.test(entryName)) {
      const source = markerScanSource(entryName, decoder.decode(data));
      for (const packageName of VULNERABLE_PACKAGES) {
        if (containsContentMarker(source, packageName)) {
          findings.push(`${entryName}:content:${packageName}`);
        }
      }
    }
  }

  if (uncompressedBytes > maxUncompressedBytes) {
    throw new Error(`Uncompressed bundle is ${uncompressedBytes} bytes; limit is ${maxUncompressedBytes}`);
  }
  if (findings.length > 0) {
    throw new Error(`Vulnerable package marker found in .ait: ${findings.join(', ')}`);
  }
  return { entryNames, uncompressedBytes };
}

async function main() {
  try {
    const lines = await verifyAitPackage();
    for (const line of lines) console.log(line);
  } catch (error) {
    console.error(`AIT_FAIL ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
