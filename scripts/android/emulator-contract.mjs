import { isAbsolute, relative, resolve, sep } from 'node:path';

export const TEPPU_AVD_NAME = 'Teppu_API_36';
export const ANDROID_COMPONENT = 'io.github.ohe1013.teppu/.MainActivity';

export function assertAvdName(avdName) {
  if (avdName !== TEPPU_AVD_NAME) {
    throw new Error(`AVD name must equal ${TEPPU_AVD_NAME}.`);
  }
  return avdName;
}

export function resolveEmulatorEvidencePaths(projectRoot) {
  if (!isAbsolute(projectRoot)) throw new Error('Project root must be absolute.');
  const normalizedRoot = resolve(projectRoot);
  const directory = resolve(normalizedRoot, 'artifacts', 'android', 'emulator');
  const relativeDirectory = relative(normalizedRoot, directory);
  if (
    relativeDirectory === '..'
    || relativeDirectory.startsWith(`..${sep}`)
    || isAbsolute(relativeDirectory)
  ) {
    throw new Error('Emulator evidence escaped the project root.');
  }
  return {
    directory,
    titleScreenshot: resolve(directory, 'title.png'),
    titleUi: resolve(directory, 'title.xml'),
    towerScreenshot: resolve(directory, 'tower.png'),
    towerUi: resolve(directory, 'tower.xml'),
    battleScreenshot: resolve(directory, 'battle.png'),
    battleUi: resolve(directory, 'battle.xml'),
    logcat: resolve(directory, 'logcat.txt'),
    report: resolve(directory, 'smoke.txt'),
    stage: resolve(directory, 'stage.txt'),
    failureUi: resolve(directory, 'failure.xml'),
    failureReport: resolve(directory, 'failure.txt'),
  };
}

export function parseBounds(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value);
  if (match === null) throw new Error(`Invalid bounds: ${value}`);
  const [, leftText, topText, rightText, bottomText] = match;
  const left = Number(leftText);
  const top = Number(topText);
  const right = Number(rightText);
  const bottom = Number(bottomText);
  if (right <= left || bottom <= top) throw new Error(`Invalid bounds: ${value}`);
  return {
    left,
    top,
    right,
    bottom,
    centerX: Math.floor((left + right) / 2),
    centerY: Math.floor((top + bottom) / 2),
  };
}

export function hasFatalAndroidLog(value) {
  return /FATAL EXCEPTION|AndroidRuntime[^\n]*(?:FATAL|Unable to start activity)|Unable to start activity|ActivityNotFoundException|\bam_crash\b/iu
    .test(String(value));
}
