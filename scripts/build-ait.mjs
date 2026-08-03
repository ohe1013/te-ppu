import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEFAULT_APP_NAME = 'te-ppu-prototype';
const DEFAULT_ARTIFACT_PATH = 'artifacts/ait/game.ait';

function portablePath(path) {
  return path.replaceAll('\\', '/');
}

function fail(message) {
  throw new Error(message);
}

export function normalizeAppName(value = DEFAULT_APP_NAME) {
  const appName = typeof value === 'string' ? value.trim() : '';
  if (
    appName === ''
    || appName === '.'
    || appName === '..'
    || /[\\/:]/.test(appName)
    || basename(appName) !== appName
  ) {
    fail('AIT_APP_NAME must be one nonblank basename without path separators');
  }
  return appName;
}

export function resolveArtifactPath(root, value = DEFAULT_ARTIFACT_PATH) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('AIT_ARTIFACT_PATH must be a relative .ait path below artifacts/ait');
  }
  const artifactPath = value.trim();
  if (isAbsolute(artifactPath) || extname(artifactPath).toLowerCase() !== '.ait') {
    fail('AIT_ARTIFACT_PATH must be a relative .ait path below artifacts/ait');
  }
  const resolvedRoot = resolve(root);
  const artifactsRoot = resolve(resolvedRoot, 'artifacts', 'ait');
  const destination = resolve(resolvedRoot, artifactPath);
  const parentRelative = relative(artifactsRoot, dirname(destination));
  if (
    parentRelative === '..'
    || parentRelative.startsWith('../')
    || parentRelative.startsWith('..\\')
    || isAbsolute(parentRelative)
  ) {
    fail('AIT_ARTIFACT_PATH must be a relative .ait path below artifacts/ait');
  }
  return {
    destination,
    relativePath: portablePath(relative(resolvedRoot, destination)),
  };
}

function packagePathFromOptions(frameworkPackagePath) {
  return frameworkPackagePath ?? require.resolve('@apps-in-toss/framework/package.json');
}

async function regularFile(path, message) {
  try {
    const info = await stat(path);
    if (!info.isFile()) fail(message);
    return info;
  } catch (error) {
    if (error instanceof Error && error.message === message) throw error;
    fail(message);
  }
}

async function stashExistingSource(source) {
  let sourceInfo;
  try {
    sourceInfo = await stat(source);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
  if (!sourceInfo.isFile()) {
    fail('pre-existing CLI output is not a regular file: ' + basename(source));
  }

  const stash = join(dirname(source), '.ait-source-stash-' + randomUUID());
  await rename(source, stash);
  return stash;
}

async function restoreStashedSource(source, stash) {
  if (!stash) return;
  await rm(source, { force: true });
  await rename(stash, source);
}

export async function buildAit(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const suppliedEnv = options.env ?? process.env;
  const appName = normalizeAppName(suppliedEnv.AIT_APP_NAME ?? DEFAULT_APP_NAME);
  const source = resolve(root, appName + '.ait');
  if (dirname(source) !== root) fail('AIT_APP_NAME source output escapes package root');
  const artifact = resolveArtifactPath(root, suppliedEnv.AIT_ARTIFACT_PATH ?? DEFAULT_ARTIFACT_PATH);
  const frameworkPackagePath = packagePathFromOptions(options.frameworkPackagePath);
  const aitScript = join(dirname(frameworkPackagePath), 'bin', 'ait.js');
  await regularFile(aitScript, 'local Apps-in-Toss ait CLI is missing');
  const sourceStash = await stashExistingSource(source);
  let destinationReplaced = false;
  let stashFinalized = false;

  try {
    const launch = spawnSync(process.execPath, [aitScript, 'build'], {
      cwd: root,
      env: {
        ...process.env,
        ...suppliedEnv,
        AIT_APP_NAME: appName,
      },
      stdio: 'inherit',
    });
    if (launch.error) fail('ait build failed: ' + launch.error.message);
    if (launch.status !== 0) fail('ait build failed with exit code ' + launch.status);

    await regularFile(source, 'expected CLI output is missing: ' + appName + '.ait');
    await mkdir(dirname(artifact.destination), { recursive: true });
    const temporary = join(
      dirname(artifact.destination),
      '.' + basename(artifact.destination) + '.' + process.pid + '.' + Date.now() + '.tmp',
    );
    try {
      await copyFile(source, temporary);
      await rename(temporary, artifact.destination);
      destinationReplaced = true;
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    await rm(source);
    if (sourceStash) await rm(sourceStash, { force: true });
    stashFinalized = true;
  } catch (error) {
    if (sourceStash && !destinationReplaced && !stashFinalized) {
      await restoreStashedSource(source, sourceStash);
      stashFinalized = true;
    }
    throw error;
  }
  return {
    appName,
    artifactPath: artifact.relativePath,
  };
}

async function main() {
  try {
    const result = await buildAit();
    console.log('AIT_ARTIFACT appName=' + result.appName + ' path=' + result.artifactPath);
  } catch (error) {
    console.error('AIT_BUILD_FAIL ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
