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

function capture(source, pattern, label) {
  const match = pattern.exec(source);
  if (match?.[1] === undefined) throw new Error(`Missing Android project value: ${label}`);
  return match[1];
}

export function readCapacitorConfig(root) {
  const config = readJson(join(root, 'capacitor.config.json'));
  return {
    appId: config.appId,
    appName: config.appName,
    webDir: config.webDir,
  };
}

export function readSystemBarsConfig(root) {
  const config = readJson(join(root, 'capacitor.config.json'));
  return {
    style: config.plugins?.SystemBars?.style,
    insetsHandling: config.plugins?.SystemBars?.insetsHandling,
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

export function readNativeAndroidContract(root) {
  const appGradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
  const variables = readFileSync(join(root, 'android/variables.gradle'), 'utf8');
  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const strings = readFileSync(join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  const styles = readFileSync(join(root, 'android/app/src/main/res/values/styles.xml'), 'utf8');

  const application = capture(manifest, /<application\b([\s\S]*?)>/u, 'application element');
  const activity = capture(manifest, /<activity\b([\s\S]*?)>/u, 'main activity element');
  const permissions = [...manifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"[^>]*>/gu)]
    .map((match) => match[1]);

  return {
    applicationId: capture(appGradle, /\bapplicationId\s+["']([^"']+)["']/u, 'applicationId'),
    versionCode: Number(capture(appGradle, /\bversionCode\s+(\d+)/u, 'versionCode')),
    versionName: capture(appGradle, /\bversionName\s+["']([^"']+)["']/u, 'versionName'),
    sdk: {
      min: Number(capture(variables, /\bminSdkVersion\s*=\s*(\d+)/u, 'minSdkVersion')),
      compile: Number(capture(variables, /\bcompileSdkVersion\s*=\s*(\d+)/u, 'compileSdkVersion')),
      target: Number(capture(variables, /\btargetSdkVersion\s*=\s*(\d+)/u, 'targetSdkVersion')),
    },
    appName: capture(strings, /<string\s+name="app_name">([^<]+)<\/string>/u, 'app_name'),
    applicationLabel: capture(application, /android:label="([^"]+)"/u, 'application label'),
    activityLabel: capture(activity, /android:label="([^"]+)"/u, 'activity label'),
    screenOrientation: capture(activity, /android:screenOrientation="([^"]+)"/u, 'screen orientation'),
    usesCleartextTraffic: capture(
      application,
      /android:usesCleartextTraffic="([^"]+)"/u,
      'cleartext traffic policy',
    ) === 'true',
    permissions,
    theme: {
      statusBarColor: capture(
        styles,
        /<item\s+name="android:statusBarColor">([^<]+)<\/item>/u,
        'status bar color',
      ),
      navigationBarColor: capture(
        styles,
        /<item\s+name="android:navigationBarColor">([^<]+)<\/item>/u,
        'navigation bar color',
      ),
      lightStatusBar: capture(
        styles,
        /<item\s+name="android:windowLightStatusBar">([^<]+)<\/item>/u,
        'status bar icon mode',
      ),
      lightNavigationBar: capture(
        styles,
        /<item\s+name="android:windowLightNavigationBar">([^<]+)<\/item>/u,
        'navigation bar icon mode',
      ),
      postSplashScreenTheme: capture(
        styles,
        /<item\s+name="postSplashScreenTheme">([^<]+)<\/item>/u,
        'post splash theme',
      ),
    },
  };
}
