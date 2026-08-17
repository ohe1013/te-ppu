export const COMMAND_LINE_TOOLS = Object.freeze({
  build: '15859902',
  archiveName: 'commandlinetools-win-15859902_latest.zip',
  url: 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip',
  sha256: '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a',
});

export const SDK_PACKAGES = Object.freeze([
  'platform-tools',
  'platforms;android-36',
  'build-tools;36.0.0',
  'emulator',
  'system-images;android-36;google_apis;x86_64',
]);

export function localPropertiesSdkDir(androidSdk) {
  if (!/^[A-Za-z]:\\/u.test(androidSdk)) {
    throw new Error('Android SDK must be an absolute Windows path.');
  }
  const escaped = androidSdk.replaceAll('\\', '\\\\').replace(':', '\\:');
  return `sdk.dir=${escaped}`;
}
