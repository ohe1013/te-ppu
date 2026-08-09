import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checkerPath = fileURLToPath(new URL('./check-authored-source-policy.mjs', import.meta.url));

function withWorkspace(run) {
  const root = mkdtempSync(join(tmpdir(), 'te-ppu-source-policy-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeSource(root, relativePath, source) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}

function runChecker(root) {
  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: root,
    encoding: 'utf8',
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

test('finds every forbidden authored-source pattern case-insensitively', () => {
  withWorkspace((root) => {
    writeSource(root, 'src/runtime.ts', [
      'const a = EVAL ("payload");',
      'const b = NeW Function ("return 1");',
      'const c = "WeBgPu";',
      'const d = NAVIGATOR . GPU;',
      'const e = ReactDomServer;',
      'const f = "<IFRAME src=\\"x\\">";',
      'const g = document.createElement("iFrAmE");',
      'const h = new FUNCTION;',
      'const i = document.createElement(`iframe`);',
    ].join('\n'));

    const result = runChecker(root);

    assert.equal(result.status, 1, result.output);
    for (const rule of [
      'eval-call',
      'function-constructor',
      'webgpu',
      'navigator-gpu',
      'react-dom-server',
      'iframe-markup',
      'iframe-create-element',
    ]) {
      assert.match(result.output, new RegExp(`src/runtime\\.ts:\\d+:\\d+ rule=${rule}`));
    }
    assert.equal(result.output.match(/rule=function-constructor/g)?.length, 2, result.output);
    assert.equal(result.output.match(/rule=iframe-create-element/g)?.length, 2, result.output);
    assert.match(result.output, /SOURCE_POLICY_FAIL files=1 findings=9/);
  });
});

test('does not scan test files or fixture directories as authored runtime source', () => {
  withWorkspace((root) => {
    writeSource(root, 'src/runtime.ts', 'export const ready = true;');
    writeSource(root, 'src/runtime.test.ts', 'eval("fixture")');
    writeSource(root, 'src/fixtures/patterns.ts', 'new Function("fixture")');
    writeSource(root, 'src/__tests__/runtime.ts', '<iframe></iframe>');

    const result = runChecker(root);

    assert.equal(result.status, 0, result.output);
    assert.equal(result.output, 'SOURCE_POLICY_OK files=1 findings=0\n');
  });
});

test('scans the root page, public assets, and authored build configuration', () => {
  withWorkspace((root) => {
    writeSource(root, 'index.html', '<iframe title="blocked"></iframe>');
    writeSource(root, 'public/boot.js', 'navigator.gpu');
    writeSource(root, 'vite.config.ts', 'const renderer = "WebGPU";');

    const result = runChecker(root);

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /index\.html:1:1 rule=iframe-markup/);
    assert.match(result.output, /public\/boot\.js:1:1 rule=navigator-gpu/);
    assert.match(result.output, /vite\.config\.ts:1:\d+ rule=webgpu/);
    assert.match(result.output, /SOURCE_POLICY_FAIL files=3 findings=4/);
  });
});

test('rejects iframe creation calls that pass additional arguments', () => {
  withWorkspace((root) => {
    writeSource(root, 'src/runtime.ts', [
      'document.createElement("iframe", { is: "x-frame" });',
      'React.createElement(`iframe`, { title: "embedded" });',
    ].join('\n'));

    const result = runChecker(root);

    assert.equal(result.status, 1, result.output);
    assert.equal(result.output.match(/rule=iframe-create-element/g)?.length, 2, result.output);
    assert.match(result.output, /SOURCE_POLICY_FAIL files=1 findings=2/);
  });
});
