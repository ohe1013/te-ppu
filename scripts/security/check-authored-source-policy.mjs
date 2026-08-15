import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRECTORIES = ['src', 'public'];
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.cts', '.htm', '.html', '.js', '.json', '.jsx',
  '.map', '.mjs', '.mts', '.svg', '.ts', '.tsx', '.txt',
]);
const EXCLUDED_DIRECTORY_NAMES = new Set([
  '__fixtures__', '__tests__', 'fixture', 'fixtures', 'test', 'tests',
]);
const EXCLUDED_FILE_PATTERN = /\.(?:fixture|spec|test)\.[^.]+$/i;
const ROOT_CONFIG_PATTERN = /(?:^|\.)config\.(?:[cm]?[jt]s)$/i;
const TSCONFIG_PATTERN = /^tsconfig(?:\.[^.]+)*\.json$/i;

const POLICIES = [
  { name: 'eval-call', pattern: /\beval\s*\(/gi },
  { name: 'function-constructor', pattern: /\bnew\s+function\b/gi },
  { name: 'webgpu', pattern: /webgpu/gi },
  { name: 'navigator-gpu', pattern: /\bnavigator\s*\.\s*gpu\b/gi },
  { name: 'react-dom-server', pattern: /reactdomserver/gi },
  { name: 'iframe-markup', pattern: /<\s*\/?\s*iframe\b/gi },
  {
    name: 'iframe-create-element',
    pattern: /\bcreateelement\s*\(\s*(['"`])iframe\1\s*(?=[,)])/gi,
  },
];

function portablePath(path) {
  return path.replaceAll('\\', '/');
}

function isExcluded(relativePath) {
  const segments = portablePath(relativePath).split('/');
  const fileName = segments.at(-1) ?? '';
  return segments.slice(0, -1).some((segment) => (
    EXCLUDED_DIRECTORY_NAMES.has(segment.toLowerCase())
  )) || EXCLUDED_FILE_PATTERN.test(fileName);
}

function isTextSource(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

async function collectDirectoryFiles(root, directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const label = relative(root, path);
    if (isExcluded(label)) continue;
    if (entry.isDirectory()) {
      files.push(...await collectDirectoryFiles(root, path));
    } else if (entry.isFile() && isTextSource(path)) {
      files.push(path);
    }
  }
  return files;
}

async function collectRootConfigFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return entries.filter((entry) => {
    if (!entry.isFile()) return false;
    const lowerName = entry.name.toLowerCase();
    return lowerName === 'index.html'
      || lowerName === 'package.json'
      || ROOT_CONFIG_PATTERN.test(entry.name)
      || TSCONFIG_PATTERN.test(entry.name);
  }).map((entry) => join(root, entry.name));
}

function sourceLocation(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const previousNewline = before.lastIndexOf('\n');
  return { line, column: index - previousNewline };
}

function scanSource(label, source) {
  const findings = [];
  for (const policy of POLICIES) {
    policy.pattern.lastIndex = 0;
    for (const match of source.matchAll(policy.pattern)) {
      const { line, column } = sourceLocation(source, match.index);
      findings.push({ label, line, column, rule: policy.name });
    }
  }
  return findings;
}

export async function scanAuthoredSources(root = process.cwd()) {
  const directoryFiles = [];
  for (const directoryName of SOURCE_DIRECTORIES) {
    directoryFiles.push(...await collectDirectoryFiles(root, join(root, directoryName)));
  }
  const files = [...await collectRootConfigFiles(root), ...directoryFiles]
    .sort((left, right) => portablePath(relative(root, left)).localeCompare(
      portablePath(relative(root, right)),
      'en',
    ));

  const findings = [];
  for (const path of files) {
    const label = portablePath(relative(root, path));
    const source = await readFile(path, 'utf8');
    findings.push(...scanSource(label, source));
  }
  findings.sort((left, right) => (
    left.label.localeCompare(right.label, 'en')
    || left.line - right.line
    || left.column - right.column
    || left.rule.localeCompare(right.rule, 'en')
  ));
  return { files: files.length, findings };
}

async function main() {
  try {
    const result = await scanAuthoredSources();
    for (const finding of result.findings) {
      console.log(
        `SOURCE_POLICY_FORBIDDEN ${finding.label}:${finding.line}:${finding.column} rule=${finding.rule}`,
      );
    }
    if (result.findings.length > 0) {
      console.log(`SOURCE_POLICY_FAIL files=${result.files} findings=${result.findings.length}`);
      process.exitCode = 1;
    } else {
      console.log(`SOURCE_POLICY_OK files=${result.files} findings=0`);
    }
  } catch (error) {
    console.error(`SOURCE_POLICY_INPUT_ERROR ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
