import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkAitIconEnv } from './check-ait-icon-env.mjs';

const checkerPath = fileURLToPath(new URL('./check-ait-icon-env.mjs', import.meta.url));

function runChecker(env) {
  const childEnv = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([, value]) => value !== undefined),
  );
  const result = spawnSync(process.execPath, [checkerPath], {
    env: childEnv,
    encoding: 'utf8',
  });
  return { ...result, output: result.stdout + result.stderr };
}

test('permits env-less local builds and reports their local-evidence status', () => {
  const result = checkAitIconEnv({});

  assert.deepEqual(result, { mode: 'local' });
  const cli = runChecker({
    QR_EVIDENCE: undefined,
    AIT_APP_NAME: undefined,
    AIT_DISPLAY_NAME: undefined,
    AIT_ICON_URL: undefined,
  });
  assert.equal(cli.status, 0, cli.output);
  assert.match(cli.output, /AIT_CONFIG_LOCAL/);
});

for (const name of ['AIT_APP_NAME', 'AIT_DISPLAY_NAME', 'AIT_ICON_URL']) {
  test('requires explicitly supplied ' + name + ' when QR evidence is requested', () => {
    const env = {
      QR_EVIDENCE: '1',
      AIT_APP_NAME: 'te-ppu-console-id',
      AIT_DISPLAY_NAME: 'Tower Block Battle',
      AIT_ICON_URL: 'https://cdn.example.test/icon.png',
    };
    delete env[name];

    assert.throws(() => checkAitIconEnv(env), new RegExp(name + ' is required'));
  });
}

for (const name of ['AIT_APP_NAME', 'AIT_DISPLAY_NAME']) {
  test('rejects blank ' + name + ' in QR evidence mode', () => {
    const env = {
      QR_EVIDENCE: '1',
      AIT_APP_NAME: 'te-ppu-console-id',
      AIT_DISPLAY_NAME: 'Tower Block Battle',
      AIT_ICON_URL: 'https://cdn.example.test/icon.png',
      [name]: '   ',
    };

    assert.throws(() => checkAitIconEnv(env), new RegExp(name + ' is required'));
  });
}

for (const url of [
  'http://cdn.example.test/icon.png',
  'https://localhost/icon.png',
  'https://127.0.0.1/icon.png',
  'data:image/png;base64,AAAA',
]) {
  test('rejects non-public icon URL ' + url, () => {
    assert.throws(
      () => checkAitIconEnv({
        QR_EVIDENCE: '1',
        AIT_APP_NAME: 'te-ppu-console-id',
        AIT_DISPLAY_NAME: 'Tower Block Battle',
        AIT_ICON_URL: url,
      }),
      /public HTTPS/i,
    );
  });
}

test('rejects IPv6 loopback icon URLs in the QR function and CLI gate', () => {
  const env = {
    QR_EVIDENCE: '1',
    AIT_APP_NAME: 'te-ppu-console-id',
    AIT_DISPLAY_NAME: 'Tower Block Battle',
    AIT_ICON_URL: 'https://[::1]/icon.png',
  };

  assert.throws(() => checkAitIconEnv(env), /public HTTPS/i);
  const cli = runChecker(env);
  assert.equal(cli.status, 1, cli.output);
  assert.match(cli.output, /AIT_CONFIG_FAIL.*public HTTPS/i);
});

test('accepts explicit nonblank QR evidence metadata without making a network request', () => {
  const result = checkAitIconEnv({
    QR_EVIDENCE: '1',
    AIT_APP_NAME: 'te-ppu-console-id',
    AIT_DISPLAY_NAME: 'Tower Block Battle',
    AIT_ICON_URL: 'https://cdn.example.test/te-ppu/app-logo.png',
  });

  assert.deepEqual(result, {
    mode: 'qr',
    appName: 'te-ppu-console-id',
    displayName: 'Tower Block Battle',
    iconUrl: 'https://cdn.example.test/te-ppu/app-logo.png',
  });
});
