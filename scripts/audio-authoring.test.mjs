import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  BGM_DEFINITIONS,
  SFX_IDS,
  renderBgm,
  renderSfx,
} = require('./audio-authoring.cjs');

function signalStats(samples) {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  return { peak, rms: Math.sqrt(sumSquares / samples.length) };
}

function sampleHash(samples) {
  return createHash('sha256')
    .update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest('hex');
}

test('renders five distinct deterministic multi-section BGM loops between 45 and 60 seconds', () => {
  const first = Object.keys(BGM_DEFINITIONS).map((track) => renderBgm(track));
  const second = Object.keys(BGM_DEFINITIONS).map((track) => renderBgm(track));
  const hashes = first.map(({ samples }) => sampleHash(samples));
  assert.equal(new Set(hashes).size, 5);
  assert.deepEqual(hashes, second.map(({ samples }) => sampleHash(samples)));
  for (const rendered of first) {
    assert.ok(rendered.durationSeconds >= 45 && rendered.durationSeconds <= 60);
    assert.deepEqual(rendered.sections, ['intro', 'a', 'b', 'break', 'chorus']);
    const { peak, rms } = signalStats(rendered.samples);
    assert.ok(peak >= 5_000 && peak <= 32_767);
    assert.ok(rms >= 700);
    assert.ok(Math.abs(rendered.samples[0] ?? 0) <= 64);
    assert.ok(Math.abs(rendered.samples.at(-1) ?? 0) <= 512);
  }
});

test('renders all eight short non-silent and distinct arcade cues', () => {
  assert.deepEqual(SFX_IDS, ['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss']);
  const rendered = SFX_IDS.map((cue) => renderSfx(cue));
  assert.equal(new Set(rendered.map(({ samples }) => sampleHash(samples))).size, 8);
  for (const cue of rendered) {
    assert.ok(cue.durationSeconds >= 0.04 && cue.durationSeconds <= 0.55);
    assert.ok(signalStats(cue.samples).peak >= 4_000);
  }
});

test('fails explicitly without the MP3 encoder and writes no fallback assets', () => {
  const testRoot = mkdtempSync(join(tmpdir(), 'te-ppu-audio-encoder-'));
  const scriptsDirectory = join(testRoot, 'scripts');
  mkdirSync(scriptsDirectory);
  copyFileSync(
    new URL('./generate-authored-audio.cjs', import.meta.url),
    join(scriptsDirectory, 'generate-authored-audio.cjs'),
  );

  try {
    const result = spawnSync(process.execPath, ['scripts/generate-authored-audio.cjs'], {
      cwd: testRoot,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AUTHORED_AUDIO_ENCODER_REQUIRED/);
    assert.equal(existsSync(join(testRoot, 'public', 'assets', 'audio')), false);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
