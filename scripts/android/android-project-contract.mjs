import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REQUIRED_ANDROID_PROJECT_FILES = Object.freeze([
  'android/gradlew.bat',
  'android/variables.gradle',
  'android/app/src/main/AndroidManifest.xml',
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readCapacitorConfig(root) {
  const config = readJson(join(root, 'capacitor.config.json'));
  return {
    appId: config.appId,
    appName: config.appName,
    webDir: config.webDir,
  };
}

export function readAndroidEnv(root) {
  const source = readFileSync(join(root, '.env.android'), 'utf8');
  return Object.fromEntries(
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error(`Invalid environment entry: ${line}`);
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

export function readCapacitorVersions(root) {
  const manifest = readJson(join(root, 'package.json'));
  return {
    core: manifest.dependencies?.['@capacitor/core'],
    cli: manifest.devDependencies?.['@capacitor/cli'],
    android: manifest.dependencies?.['@capacitor/android'],
    app: manifest.dependencies?.['@capacitor/app'],
  };
}

export function findMissingAndroidProjectFiles(root) {
  return REQUIRED_ANDROID_PROJECT_FILES.filter(
    (relativePath) => !existsSync(join(root, relativePath)),
  );
}
