import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export const TEPPU_ANDROID_VERSION = '1.0.0';
export const TEPPU_ANDROID_APP_ID = 'io.github.ohe1013.teppu';
export const TEPPU_ANDROID_LABEL = '테뿌리스';
export const TEPPU_SIGNING_ALIAS = 'teppu-upload';

function assertWindowsAbsolute(path, label) {
  if (!win32.isAbsolute(path) || !/^[A-Za-z]:\\/u.test(path)) {
    throw new Error(`${label} must be an absolute Windows path.`);
  }
}

export function resolveSigningPaths(userProfile) {
  assertWindowsAbsolute(userProfile, 'User profile');
  const normalizedProfile = win32.normalize(userProfile);
  const directory = win32.join(normalizedProfile, '.teppu', 'android-signing');
  return {
    directory,
    keystore: win32.join(directory, 'teppu-upload.jks'),
    credential: win32.join(directory, 'teppu-signing.credential.xml'),
    metadata: win32.join(directory, 'README.txt'),
  };
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`Invalid Android version: ${version}`);
  }
}

export function releaseArtifactName(version) {
  validateVersion(version);
  return `teppu-${version}-release.apk`;
}

export function resolveReleaseArtifactPaths(projectRoot, version = TEPPU_ANDROID_VERSION) {
  if (!isAbsolute(projectRoot)) throw new Error('Project root must be absolute.');
  const normalizedRoot = resolve(projectRoot);
  const directory = resolve(normalizedRoot, 'artifacts', 'android');
  const apk = resolve(directory, releaseArtifactName(version));
  const relativeApk = relative(normalizedRoot, apk);
  if (relativeApk === '..' || relativeApk.startsWith(`..${sep}`) || isAbsolute(relativeApk)) {
    throw new Error('Release artifact escaped the project root.');
  }
  return {
    directory,
    apk,
    checksum: `${apk}.sha256`,
    report: resolve(directory, 'verification.txt'),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function redactSecrets(value, secrets = []) {
  let output = String(value);
  for (const secret of [...new Set(secrets.filter((entry) => entry.length > 0))]
    .sort((left, right) => right.length - left.length)) {
    output = output.replace(new RegExp(escapeRegExp(secret), 'gu'), '[REDACTED]');
  }
  return output.replace(
    /((?:store|key)Password\s*[=:]\s*)([^\s]+)/giu,
    '$1[REDACTED]',
  );
}

export function inspectGradleSigningContract(source) {
  const requiredEnvironment = [
    'TEPPU_KEYSTORE_PATH',
    'TEPPU_KEYSTORE_PASSWORD',
    'TEPPU_KEY_ALIAS',
    'TEPPU_KEY_PASSWORD',
  ];
  const missingEnvironment = requiredEnvironment.filter(
    (name) => !source.includes(`System.getenv('${name}')`),
  );
  const unsafePatterns = [
    /storePassword\s+["'][^"']+["']/u,
    /keyPassword\s+["'][^"']+["']/u,
    /storeFile\s+file\(["'][^"']+\.jks["']\)/u,
  ];
  return {
    missingEnvironment,
    hasReleaseGuard: source.includes('TEPPU_ANDROID_RELEASE_SIGNING_MISSING'),
    hasUnsafeLiteral: unsafePatterns.some((pattern) => pattern.test(source)),
  };
}
