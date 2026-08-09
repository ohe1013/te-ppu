import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(name + ' is required when QR_EVIDENCE=1');
  }
  return value;
}

function publicHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('AIT_ICON_URL must be a public HTTPS URL');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const localHost = host === 'localhost'
    || host.endsWith('.localhost')
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1';
  if (
    url.protocol !== 'https:'
    || localHost
    || url.username !== ''
    || url.password !== ''
  ) {
    throw new Error('AIT_ICON_URL must be a public HTTPS URL');
  }
  return value;
}

export function checkAitIconEnv(env = process.env) {
  if (env.QR_EVIDENCE !== '1') return { mode: 'local' };
  const appName = required(env, 'AIT_APP_NAME');
  const displayName = required(env, 'AIT_DISPLAY_NAME');
  const iconUrl = publicHttpsUrl(required(env, 'AIT_ICON_URL'));
  return {
    mode: 'qr',
    appName,
    displayName,
    iconUrl,
  };
}

function main() {
  try {
    const result = checkAitIconEnv();
    if (result.mode === 'local') {
      console.log('AIT_CONFIG_LOCAL');
    } else {
      console.log(
        'AIT_CONFIG_QR appName=' + result.appName
        + ' displayName=' + result.displayName
        + ' iconUrl=' + result.iconUrl,
      );
    }
  } catch (error) {
    console.error('AIT_CONFIG_FAIL ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
