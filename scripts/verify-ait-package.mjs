import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AITReader } from '@apps-in-toss/ait-format';
import { unzipSync } from 'fflate';

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
const TEMPLATE_QUOTE = String.fromCharCode(96);
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

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
    const sourcesContent = [];
    const sanitizedSourceMap = sanitizeSourceMap(sourceMap, sourcesContent);
    return [JSON.stringify(sanitizedSourceMap), ...sourcesContent].join('\n');
  } catch {
    return source;
  }
}

function containsContentMarker(source, packageName) {
  const normalizedSource = portablePath(source).replace(/\/{2,}/g, '/');
  return source.includes('"' + packageName + '"')
    || source.includes("'" + packageName + "'")
    || source.includes(TEMPLATE_QUOTE + packageName + TEMPLATE_QUOTE)
    || normalizedSource.includes('node_modules/' + packageName + '/');
}

function unzipWithinLimit(zipBlob, maxUncompressedBytes) {
  let indexedBytes = 0;
  const entryNames = new Set();
  return unzipSync(zipBlob, {
    filter(entry) {
      if (entryNames.has(entry.name)) {
        throw new Error('Duplicate ZIP entry in .ait: ' + entry.name);
      }
      entryNames.add(entry.name);
      indexedBytes += entry.originalSize;
      if (indexedBytes > maxUncompressedBytes) {
        throw new Error(
          'Uncompressed bundle is ' + indexedBytes + ' bytes; limit is ' + maxUncompressedBytes,
        );
      }
      return true;
    },
  });
}

function explicitArtifactPath(value) {
  if (typeof value !== 'string' || value.trim() === '' || !/\.ait$/i.test(value.trim())) {
    throw new Error('Expected one explicit .ait artifact path');
  }
  return value.trim();
}

async function regularArchive(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a regular file');
  } catch {
    throw new Error('Expected explicit .ait artifact path to be a regular file: ' + portablePath(path));
  }
}

function normalizedArchiveEntries(entries) {
  const normalized = new Map();
  for (const [entryName, data] of Object.entries(entries)) {
    const name = portablePath(entryName);
    if (normalized.has(name)) {
      throw new Error('Duplicate normalized ZIP entry in .ait: ' + name);
    }
    normalized.set(name, data);
  }
  return normalized;
}

function collectManifestRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const entry of value) collectManifestRefs(entry, refs);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'path' && typeof value.path === 'string') {
    refs.add(value.path);
    return;
  }
  for (const entry of Object.values(value)) collectManifestRefs(entry, refs);
}

function safeManifestRef(path) {
  return typeof path === 'string'
    && /^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$/.test(path);
}

function verifyAuthoredArchiveAssets(entries) {
  const normalized = normalizedArchiveEntries(entries);
  const manifestNames = [...normalized.keys()].filter((name) => (
    name === 'assets/manifest.json' || name.endsWith('/assets/manifest.json')
  ));
  if (manifestNames.length === 0) return;
  if (manifestNames.length !== 1) {
    throw new Error('Expected one archived assets manifest, found ' + manifestNames.length);
  }
  const manifestName = manifestNames[0];
  let manifest;
  try {
    manifest = JSON.parse(decoder.decode(normalized.get(manifestName)));
  } catch {
    throw new Error('Invalid archived assets manifest');
  }
  if (!manifest || manifest.mode !== 'assets') return;
  const prefix = manifestName.slice(0, -'manifest.json'.length);
  const refs = new Set(['brand/app-logo.png']);
  collectManifestRefs(manifest, refs);
  for (const path of refs) {
    if (!safeManifestRef(path)) {
      throw new Error('Invalid authored asset reference in explicit archive: ' + String(path));
    }
    if (!normalized.has(prefix + path)) {
      throw new Error('Missing authored asset in explicit archive: ' + path);
    }
  }
}

export async function verifyAitPackage(
  artifactPath,
  maxUncompressedBytes = MAX_UNCOMPRESSED_BYTES,
) {
  const suppliedPath = explicitArtifactPath(artifactPath);
  const archivePath = resolve(suppliedPath);
  await regularArchive(archivePath);
  const archiveBytes = new Uint8Array(await readFile(archivePath));
  const reader = AITReader.fromBuffer(archiveBytes);
  const entries = unzipWithinLimit(reader.readZipBlob(), maxUncompressedBytes);
  const inspection = inspectArchiveEntries(entries, maxUncompressedBytes);
  verifyAuthoredArchiveAssets(entries);
  const lines = inspection.entryNames.map((entryName) => (
    'AIT_ENTRY ' + portablePath(entryName) + ' bytes=' + entries[entryName].byteLength
  ));
  lines.push(
    'AIT_OK ' + portablePath(suppliedPath)
    + ' uncompressedBytes=' + inspection.uncompressedBytes
    + ' entries=' + inspection.entryNames.length
    + ' vulnerablePackageMarkers=0',
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
      if (normalizedName.includes('node_modules/' + packageName + '/')) {
        findings.push(portablePath(entryName) + ':path:' + packageName);
      }
    }
    if (TEXT_ENTRY_PATTERN.test(entryName)) {
      const source = markerScanSource(entryName, decoder.decode(data));
      for (const packageName of VULNERABLE_PACKAGES) {
        if (containsContentMarker(source, packageName)) {
          findings.push(portablePath(entryName) + ':content:' + packageName);
        }
      }
    }
  }
  if (uncompressedBytes > maxUncompressedBytes) {
    throw new Error('Uncompressed bundle is ' + uncompressedBytes + ' bytes; limit is ' + maxUncompressedBytes);
  }
  if (findings.length > 0) {
    throw new Error('Vulnerable package marker found in .ait: ' + findings.join(', '));
  }
  return { entryNames, uncompressedBytes };
}

async function main() {
  try {
    const argumentsAfterScript = process.argv.slice(2);
    if (argumentsAfterScript.length !== 1) {
      throw new Error('Expected one explicit .ait artifact path');
    }
    const lines = await verifyAitPackage(argumentsAfterScript[0]);
    for (const line of lines) console.log(line);
  } catch (error) {
    console.error('AIT_FAIL ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
