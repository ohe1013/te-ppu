# Upbeat Arcade Audio and Puzzle Rotate Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive, subdued soundtrack with five original upbeat arcade loops, make battle cues react to clear/combo/attack strength, and ship the selected two-block bubble rotate control without changing gameplay timing.

**Architecture:** Keep the existing route-to-track mapping, lazy decoded-buffer cache, and lifecycle ownership. Add a pure UI-boundary mapper from `GameEvent[]` to deduplicated cue playback options, extend the Web Audio adapter with bounded pitch/gain variants and short music ducking, and keep audio authoring in a deterministic Node-only module that writes the existing MP3 paths. The rotate control remains the same accessible command component while its SVG and transform-only CSS become the approved option B.

**Tech Stack:** React 19, TypeScript 7, Web Audio API, Vitest 4, Node test runner, Playwright 1.62, deterministic CommonJS audio authoring, `@breezystack/lamejs@1.2.7` as an authoring-only dev dependency, Apps-in-Toss AIT tooling.

## Global Constraints

- Execute in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on branch `feat/pve-delivery`.
- Prepend `$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH` to every Node/npm command; supported Node is `>=24.15.0 <25`.
- Never inspect, modify, stage, or delete the user-owned untracked `tmp/` directory.
- Compose every melody, rhythm, sound effect, and arrangement specifically for this project; do not copy or sample identifiable material from a commercial puzzle game.
- Keep the five existing `MusicTrack` identifiers, eight `SoundCue` identifiers, manifest keys, and `public/assets/audio/**/*.mp3` runtime paths.
- Keep each BGM between 45 and 60 seconds with intro, A, B, break, and chorus sections; do not add a global fade at the loop seam.
- Keep runtime playback local and offline. The MP3 encoder is a pinned dev dependency and must not enter the browser or AIT runtime bundle.
- Preserve sound enable/disable, app suspend/resume, 3-2-1 return countdown, decode caching, route crossfade, and non-fatal audio behavior.
- Audio feedback must never delay or alter command dispatch, match state, scoring, AI, replay determinism, or persistence.
- Keep the rotate control's Korean accessible name `시계 방향 회전`, one-command-per-activation behavior, and at least a 56px touch target.
- Use only `transform` for the new press/icon motion and disable icon rotation under `prefers-reduced-motion`.
- Run `git add` and `git commit` as separate PowerShell commands and stage only each task's listed files.
- Treat the existing dependency-audit review requirement separately from feature correctness; never refresh its baseline merely to make the gate green.

---

## File Structure

### New files

- `src/ui/match/sound-feedback.ts`: pure mapping and cue deduplication from core events to audio playback options.
- `src/ui/match/sound-feedback.test.ts`: intensity, ordering, deduplication, result-cue, and ducking-threshold tests.
- `scripts/audio-authoring.cjs`: pure deterministic PCM synthesis for all five BGM tracks and eight SFX cues.
- `scripts/audio-authoring.test.mjs`: Node tests for track metadata, duration, signal energy, seam behavior, distinct output, and deterministic rendering.

### Modified files

- `src/platform/audio-port.ts`: shared `CueIntensity`, `SoundPlaybackOptions`, and optional `AudioPort.play` options.
- `src/ui/screens/MatchScreen.tsx`: replace local cue selection and `Set` dedupe with `soundFeedbackForEvents`.
- `src/ui/screens/MatchScreen.test.tsx`: verify command audio remains immediate and event options reach the port.
- `src/ui/match/lifecycle-ui.test.tsx`: update exact cue assertions to include intensity/ducking options.
- `src/platform/web-audio-port.ts`: source playback-rate variants, bounded gain, oscillator parity, music ducking, and lifecycle reset.
- `src/platform/web-audio-port.test.ts`: source fixture support and focused variant/duck/lifecycle tests.
- `scripts/generate-authored-audio.cjs`: thin MP3-writing CLI over the pure authoring module; remove silent fallback.
- `package.json`, `package-lock.json`: exact authoring dependency, generation script, and delivery-gate audio tests.
- `public/assets/audio/bgm/*.mp3`: five regenerated original multi-section loops.
- `public/assets/audio/sfx/*.mp3`: eight regenerated original arcade cues.
- `public/assets/ui/rotate.svg`: transparent two-block orbit icon without an embedded button background.
- `src/ui/match/controls.css`: option-B button styling and motion-safe active state.
- `tests/e2e/portrait-layout.spec.ts`: mobile size and non-overlap assertions for the new control.

---

### Task 1: Map Match Events to Reactive Audio Feedback

**Files:**
- Create: `src/ui/match/sound-feedback.ts`
- Create: `src/ui/match/sound-feedback.test.ts`
- Modify: `src/platform/audio-port.ts`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`

**Interfaces:**
- Consumes: existing `GameEvent`, `PublicMatchView`, `SoundCue`, and `AudioPort`.
- Produces: `CueIntensity`, `SoundPlaybackOptions`, `SoundFeedback`, and `soundFeedbackForEvents(events, view)` for Task 2.

- [ ] **Step 1: Write failing pure mapper tests**

Create `src/ui/match/sound-feedback.test.ts` with a real public match fixture and exact expected output:

```ts
import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type GameEvent,
  type PublicMatchView,
} from '../../core';
import { soundFeedbackForEvents } from './sound-feedback';

function viewWithPlayerCombo(combo: number, status: PublicMatchView['status'] = 'playing') {
  const base = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 41 }));
  return {
    ...base,
    status,
    sides: {
      ...base.sides,
      player: { ...base.sides.player, combo },
    },
  } satisfies PublicMatchView;
}

describe('soundFeedbackForEvents', () => {
  it('keeps first cue order, deduplicates by strongest intensity, and ducks only strong clears and attacks', () => {
    const events: GameEvent[] = [
      { type: 'lines-cleared', side: 'player', amount: 2 },
      { type: 'item-used', side: 'player', item: 'freeze' },
      { type: 'lines-cleared', side: 'opponent', amount: 4 },
      { type: 'attack-sent', side: 'player', amount: 4 },
      { type: 'piece-locked', side: 'player' },
    ];

    expect(soundFeedbackForEvents(events, viewWithPlayerCombo(3))).toEqual([
      { cue: 'clear', options: { intensity: 3, duckMusic: true } },
      { cue: 'item', options: { intensity: 0, duckMusic: false } },
      { cue: 'attack', options: { intensity: 3, duckMusic: true } },
      { cue: 'land', options: { intensity: 0, duckMusic: false } },
    ]);
  });

  it('maps terminal status without inventing a cue for a draw', () => {
    const ended: GameEvent[] = [{ type: 'match-ended', side: 'player' }];
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'player-won')))
      .toEqual([{ cue: 'win', options: { intensity: 0, duckMusic: false } }]);
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'opponent-won')))
      .toEqual([{ cue: 'loss', options: { intensity: 0, duckMusic: false } }]);
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'draw'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/ui/match/sound-feedback.test.ts
```

Expected: FAIL because `./sound-feedback` does not exist.

- [ ] **Step 3: Add the playback option contract**

Add to `src/platform/audio-port.ts` and keep `options` optional so every existing fake remains structurally compatible:

```ts
export type CueIntensity = 0 | 1 | 2 | 3;

export interface SoundPlaybackOptions {
  readonly intensity?: CueIntensity;
  readonly duckMusic?: boolean;
}

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue, options?: SoundPlaybackOptions): void;
  setMusic(track: MusicTrack | null): Promise<void>;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
```

- [ ] **Step 4: Implement the pure mapper**

Create `src/ui/match/sound-feedback.ts` with exact clamping and stable first-occurrence ordering:

```ts
import type { GameEvent, PublicMatchView } from '../../core';
import type {
  CueIntensity,
  SoundCue,
  SoundPlaybackOptions,
} from '../../platform/audio-port';

export interface SoundFeedback {
  readonly cue: SoundCue;
  readonly options: Required<SoundPlaybackOptions>;
}

function clampIntensity(value: number): CueIntensity {
  return Math.max(0, Math.min(3, Math.trunc(Number.isFinite(value) ? value : 0))) as CueIntensity;
}

function cueForEvent(event: GameEvent, view: PublicMatchView): SoundCue | null {
  if (event.type === 'piece-locked' || event.type === 'garbage-landed') return 'land';
  if (event.type === 'lines-cleared') return 'clear';
  if (event.type === 'attack-sent') return 'attack';
  if (event.type === 'item-acquired' || event.type === 'item-used' || event.type === 'freeze-applied') return 'item';
  if (event.type !== 'match-ended') return null;
  if (view.status === 'player-won') return 'win';
  if (view.status === 'opponent-won') return 'loss';
  return null;
}

function intensityForEvent(event: GameEvent, view: PublicMatchView): CueIntensity {
  if (event.type === 'lines-cleared') {
    const amount = event.amount ?? 1;
    const combo = view.sides[event.side].combo;
    return clampIntensity(Math.max(amount - 1, combo - 1));
  }
  if (event.type === 'attack-sent') return clampIntensity((event.amount ?? 1) - 1);
  return 0;
}

export function soundFeedbackForEvents(
  events: readonly GameEvent[],
  view: PublicMatchView,
): readonly SoundFeedback[] {
  const feedback = new Map<SoundCue, SoundFeedback>();
  for (const event of events) {
    const cue = cueForEvent(event, view);
    if (cue === null) continue;
    const intensity = intensityForEvent(event, view);
    const current = feedback.get(cue);
    if (current !== undefined && current.options.intensity >= intensity) continue;
    feedback.set(cue, {
      cue,
      options: {
        intensity,
        duckMusic: (cue === 'clear' || cue === 'attack') && intensity >= 2,
      },
    });
  }
  return [...feedback.values()];
}
```

- [ ] **Step 5: Run the pure mapper tests and make them green**

Run the focused command from Step 2.

Expected: 2 tests PASS.

- [ ] **Step 6: Write failing MatchScreen integration expectations**

In `src/ui/match/lifecycle-ui.test.tsx`, retain the existing event batch and replace string-only assertions with exact option assertions:

```ts
expect(audio.play).toHaveBeenCalledWith('land', { intensity: 0, duckMusic: false });
expect(audio.play).toHaveBeenCalledWith('clear', { intensity: 0, duckMusic: false });
expect(audio.play).toHaveBeenCalledWith('attack', { intensity: 0, duckMusic: false });
expect(audio.play).toHaveBeenCalledWith('item', { intensity: 0, duckMusic: false });
```

Add a `MatchScreen.test.tsx` batch with a four-line clear and amount-four attack and expect the `intensity: 3, duckMusic: true` calls. Keep the existing direct rotate expectation `play('rotate')` because Task 2 owns its internal variation.

- [ ] **Step 7: Run the integration tests and confirm the red state**

Run:

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
```

Expected: FAIL because `MatchScreen` still calls `play(cue)` through its local `Set`.

- [ ] **Step 8: Integrate the mapper without changing haptic or scoring flow**

Remove the local `cueForEvent` from `MatchScreen.tsx`, import `soundFeedbackForEvents`, and replace only the sound section of `handleMatchEvents`:

```ts
if (feedback.settings.soundEnabled) {
  for (const sound of soundFeedbackForEvents(events, view)) {
    try {
      feedback.audio.play(sound.cue, sound.options);
    } catch {
      // Audio ports are optional and isolated from gameplay.
    }
  }
}

const sentHaptics = new Set<HapticType>();
for (const event of events) {
  if (feedback.settings.hapticsEnabled) {
    const haptic = hapticForEvent(event, view.status);
    if (haptic !== null && !sentHaptics.has(haptic)) {
      sentHaptics.add(haptic);
      ignoreEffect(() => feedback.platform.haptic(haptic));
    }
  }
}
feedback.onScoreEvents?.(events);
```

- [ ] **Step 9: Verify Task 1**

Run:

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
npm run typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 10: Commit Task 1**

```powershell
git add -- src/platform/audio-port.ts src/ui/match/sound-feedback.ts src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
git commit -m "feat: map battle intensity to audio feedback"
```

---

### Task 2: Add Cue Variation and Safe Music Ducking to Web Audio

**Files:**
- Modify: `src/platform/web-audio-port.ts`
- Modify: `src/platform/web-audio-port.test.ts`

**Interfaces:**
- Consumes: `SoundPlaybackOptions` from Task 1.
- Produces: `AudioPort.play(cue, options)` behavior with deterministic rotate variants, bounded intensity, oscillator parity, and non-stale duck scheduling.

- [ ] **Step 1: Extend the Web Audio test fixture and write failing variant tests**

Add `cancelScheduledValues` to `TestParam` and `playbackRate` to every fake buffer source:

```ts
class TestParam implements WebAudioParamPort {
  readonly calls: Array<readonly [string, number, number]> = [];

  cancelScheduledValues(cancelTime: number): void {
    this.calls.push(['cancel', 0, cancelTime]);
  }

  // Keep the existing setValueAtTime and exponentialRampToValueAtTime methods.
}

const source = {
  buffer: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  loop: false,
  onended: null as ((event: Event) => void) | null,
  playbackRate: new TestParam(),
  start: vi.fn(),
  stop: vi.fn(),
};
```

Add tests that unlock sample audio, call rotate three times, and assert playback rates approximately `1`, `1.122462`, and `1.259921`. Add an intensity-three clear assertion for rate `1.15` and gain `0.20`.

- [ ] **Step 2: Write failing ducking and lifecycle reset tests**

Start `tower`, play a cue with `{ intensity: 3, duckMusic: true }`, and assert the music gain receives this sequence at `currentTime = 4`:

```ts
expect(musicGain.calls.slice(-5)).toEqual([
  ['cancel', 0, 4],
  ['set', 1, 4],
  ['exponential', 0.65, 4.02],
  ['set', 0.65, 4.09],
  ['exponential', 1, 4.27],
]);
```

Then add cases proving no duck occurs without active music and that `setEnabled(false)`, `suspend()`, a track replacement, and `destroy()` cancel scheduled gain changes before cleanup.

- [ ] **Step 3: Run focused tests and confirm the red state**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/platform/web-audio-port.test.ts
```

Expected: FAIL because buffer sources have no playback-rate contract and `play` ignores options.

- [ ] **Step 4: Add the minimal Web Audio parameter contracts and profiles**

In `web-audio-port.ts`:

```ts
export interface WebAudioParamPort {
  cancelScheduledValues(cancelTime: number): void;
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

export interface WebAudioBufferSourcePort {
  buffer: WebAudioBufferPort | null;
  loop: boolean;
  onended: ((event: Event) => void) | null;
  playbackRate: WebAudioParamPort;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

const INTENSITY_RATES = [1, 1.04, 1.09, 1.15] as const;
const SAMPLE_GAINS = [0.14, 0.16, 0.18, 0.20] as const;
const ROTATE_RATES = [1, 2 ** (2 / 12), 2 ** (4 / 12)] as const;
const DUCK_GAIN = 0.65;
const DUCK_ATTACK_SECONDS = 0.02;
const DUCK_HOLD_SECONDS = 0.09;
const DUCK_RELEASE_SECONDS = 0.18;
```

Normalize missing options to intensity zero. Capture and increment the rotate index synchronously in `play()` before any asynchronous decode so rapid taps preserve call order.

- [ ] **Step 5: Apply profiles to sample and oscillator cues**

Change the private cue creators to consume a captured profile:

```ts
type CuePlaybackProfile = {
  readonly duckMusic: boolean;
  readonly gain: number;
  readonly rate: number;
};

function profileFor(cue: SoundCue, options: SoundPlaybackOptions | undefined): CuePlaybackProfile {
  const intensity = Math.max(0, Math.min(3, options?.intensity ?? 0)) as CueIntensity;
  const rotateRate = cue === 'rotate' ? ROTATE_RATES[rotateVariant++ % ROTATE_RATES.length] : 1;
  return {
    duckMusic: options?.duckMusic === true,
    gain: SAMPLE_GAINS[intensity],
    rate: INTENSITY_RATES[intensity] * rotateRate,
  };
}
```

Set `source.playbackRate.setValueAtTime(profile.rate, start)` and `gain.gain.setValueAtTime(profile.gain, start)` for decoded samples. Multiply fallback oscillator frequency by `profile.rate` and scale its peak gain by `profile.gain / SAMPLE_GAINS[0]` while retaining the existing envelope and non-fatal catch boundary.

- [ ] **Step 6: Implement stable duck scheduling and reset**

Only duck when music is active, audible, and not being replaced:

```ts
function duckActiveMusic(start: number): void {
  if (
    musicGain === null
    || activeSource === null
    || activeTrack === null
    || desiredTrack !== activeTrack
    || !isActiveMusicAudible()
  ) return;
  try {
    musicGain.gain.cancelScheduledValues(start);
    musicGain.gain.setValueAtTime(1, start);
    musicGain.gain.exponentialRampToValueAtTime(DUCK_GAIN, start + DUCK_ATTACK_SECONDS);
    musicGain.gain.setValueAtTime(DUCK_GAIN, start + DUCK_HOLD_SECONDS);
    musicGain.gain.exponentialRampToValueAtTime(
      1,
      start + DUCK_HOLD_SECONDS + DUCK_RELEASE_SECONDS,
    );
  } catch {
    // Ducking is optional and must not interrupt a cue.
  }
}
```

Add `cancelMusicGainAutomation(now)` and call it before track fade/replacement, disable, suspend, and destroy. The helper cancels future values and sets the stable value to `1` only while the gain remains connected; track-start code still owns its `MIN_GAIN → 1` fade-in.

- [ ] **Step 7: Wire options through the public play method**

```ts
play(cue: SoundCue, options?: SoundPlaybackOptions): void {
  if (!isCuePlayable()) return;
  const profile = profileFor(cue, options);
  const source = catalog()?.sfx[cue];
  if (source === undefined) {
    createOscillatorCue(cue, profile);
    return;
  }
  const expectedContext = context!;
  void loadBuffer(source, expectedContext)
    .then((buffer) => {
      if (isCuePlayable(expectedContext)) createSampleCue(buffer, profile);
    })
    .catch(() => {
      if (isCuePlayable(expectedContext)) createOscillatorCue(cue, profile);
    });
}
```

Each cue creator calls `duckActiveMusic(start)` once, immediately before source start, only when `profile.duckMusic` is true.

- [ ] **Step 8: Verify Task 2**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/platform/web-audio-port.test.ts src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.test.tsx
npm run typecheck
```

Expected: focused tests PASS and typecheck exits 0.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- src/platform/web-audio-port.ts src/platform/web-audio-port.test.ts
git commit -m "feat: add reactive cue variation and music ducking"
```

---

### Task 3: Author and Generate the New Original Soundtrack

**Files:**
- Create: `scripts/audio-authoring.cjs`
- Create: `scripts/audio-authoring.test.mjs`
- Modify: `scripts/generate-authored-audio.cjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/assets/audio/bgm/demon-king.mp3`
- Modify: `public/assets/audio/bgm/early-floors.mp3`
- Modify: `public/assets/audio/bgm/ending.mp3`
- Modify: `public/assets/audio/bgm/late-floors.mp3`
- Modify: `public/assets/audio/bgm/tower.mp3`
- Modify: `public/assets/audio/sfx/attack.mp3`
- Modify: `public/assets/audio/sfx/clear.mp3`
- Modify: `public/assets/audio/sfx/item.mp3`
- Modify: `public/assets/audio/sfx/land.mp3`
- Modify: `public/assets/audio/sfx/loss.mp3`
- Modify: `public/assets/audio/sfx/move.mp3`
- Modify: `public/assets/audio/sfx/rotate.mp3`
- Modify: `public/assets/audio/sfx/win.mp3`

**Interfaces:**
- Consumes: no runtime source; authoring runs only under Node.
- Produces: `BGM_DEFINITIONS`, `SFX_IDS`, `renderBgm(track)`, and `renderSfx(cue)` for deterministic tests and the MP3 CLI.

- [ ] **Step 1: Write failing authoring tests against a non-existent pure module**

Create `scripts/audio-authoring.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
```

- [ ] **Step 2: Run the Node test and confirm the red state without touching assets**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
node --test scripts/audio-authoring.test.mjs
```

Expected: FAIL with module-not-found for `scripts/audio-authoring.cjs`. Because the existing CLI is not imported, no MP3 file changes during the red run.

- [ ] **Step 3: Implement exact track metadata and original motifs**

Create `scripts/audio-authoring.cjs` with `SAMPLE_RATE = 44_100`, mono `Int16Array` output, MIDI-to-frequency conversion, per-note attack/release envelopes, pulse/triangle/sine oscillators, and deterministic index-hash noise. Use these exact definitions:

```js
const BGM_DEFINITIONS = Object.freeze({
  tower: { bpm: 150, bars: 32, key: 60, motif: [0, 4, 7, 9, 7, 4, 2, 4, 7, 9, 12, 9, 7, 4, 2, null] },
  'early-floors': { bpm: 162, bars: 32, key: 62, motif: [0, 7, 4, 9, 7, 12, 9, 7, 4, 7, 11, 14, 12, 9, 7, 4] },
  'late-floors': { bpm: 174, bars: 36, key: 57, motif: [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 14, 10, 8, 5] },
  'demon-king': { bpm: 168, bars: 36, key: 55, motif: [0, 6, 7, 3, 10, 7, 6, 3, 0, 3, 7, 10, 6, 3, 1, 0] },
  ending: { bpm: 152, bars: 32, key: 60, motif: [0, 4, 7, 12, 11, 9, 7, 4, 5, 9, 12, 16, 14, 12, 11, 12] },
});

const CHORDS = Object.freeze({
  tower: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  'early-floors': [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]],
  'late-floors': [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  'demon-king': [[0, 3, 7], [6, 10, 13], [7, 10, 14], [1, 5, 8]],
  ending: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
});

function deterministicNoise(sampleIndex, seed) {
  let value = (sampleIndex + 1) ^ Math.imul(seed + 17, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff * 2 - 1;
}
```

Map bars to sections as `0..3 intro`, `4..11 a`, `12..19 b`, `20..23 break`, and remaining bars chorus. Intro omits counter-melody, B transposes alternate motif notes by a fifth, break keeps bass plus half-time drums, and chorus adds an octave counter-line and eighth-note hats. Kick hits beats 0 and 2, snare hits 1 and 3, and the section logic must vary their density rather than changing the requested BPM.

- [ ] **Step 4: Implement exact SFX phrases and finish pure exports**

Use short note/sweep definitions rather than commercial samples:

```js
const SFX_IDS = Object.freeze(['move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss']);
const SFX_PHRASES = Object.freeze({
  move: [{ at: 0, seconds: 0.055, from: 55, to: 59, wave: 'square', gain: 0.18 }],
  rotate: [
    { at: 0, seconds: 0.075, from: 72, to: 79, wave: 'triangle', gain: 0.24 },
    { at: 0.055, seconds: 0.095, from: 79, to: 86, wave: 'pulse', gain: 0.18 },
  ],
  land: [
    { at: 0, seconds: 0.12, from: 43, to: 31, wave: 'triangle', gain: 0.34 },
    { at: 0.055, seconds: 0.08, from: 67, to: 62, wave: 'pulse', gain: 0.12 },
  ],
  clear: [72, 79, 84, 91].map((midi, index) => ({ at: index * 0.045, seconds: 0.11, from: midi, to: midi + 2, wave: 'triangle', gain: 0.18 })),
  attack: [
    { at: 0, seconds: 0.22, from: 45, to: 72, wave: 'saw', gain: 0.25 },
    { at: 0.12, seconds: 0.12, from: 36, to: 31, wave: 'noise', gain: 0.20 },
  ],
  item: [67, 74, 79].map((midi, index) => ({ at: index * 0.05, seconds: 0.14, from: midi, to: midi, wave: 'sine', gain: 0.20 })),
  win: [72, 76, 79, 84].map((midi, index) => ({ at: index * 0.075, seconds: 0.18, from: midi, to: midi, wave: 'pulse', gain: 0.22 })),
  loss: [55, 52, 48].map((midi, index) => ({ at: index * 0.08, seconds: 0.16, from: midi, to: midi - 1, wave: 'triangle', gain: 0.18 })),
});
```

Export the definitions and render functions through `module.exports`. Clamp the final mix once per sample and apply envelopes per musical event, not as one fade across the whole BGM.

- [ ] **Step 5: Run pure authoring tests and tune only within approved bounds**

Run the command from Step 2.

Expected: 2 tests PASS. If a peak, RMS, or seam bound fails, adjust per-voice mix gain or the last note release; do not weaken the bounds or add a whole-track fade.

- [ ] **Step 6: Install and pin the authoring-only encoder**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm install --save-dev --save-exact @breezystack/lamejs@1.2.7
```

Expected: `package.json` and `package-lock.json` change; runtime dependencies remain unchanged.

- [ ] **Step 7: Replace the CLI's silent fallback with explicit authoring**

Refactor `scripts/generate-authored-audio.cjs` to require `@breezystack/lamejs` and the pure module. If the encoder import fails, print `AUTHORED_AUDIO_ENCODER_REQUIRED` to stderr and set a nonzero exit code; never write a structurally valid silent MP3.

The CLI uses 160 kbps for BGM and 128 kbps for SFX, writes all existing canonical paths, and prints one stable summary line per file plus `AUTHORED_AUDIO_OK bgm=5 sfx=8`.

Add these scripts and include the pure authoring test in delivery gates:

```json
{
  "scripts": {
    "generate:audio": "node scripts/generate-authored-audio.cjs",
    "test:audio-authoring": "node --test scripts/audio-authoring.test.mjs"
  }
}
```

Append `scripts/audio-authoring.test.mjs` to the existing `node --test` file list in `test:delivery-gates`.

- [ ] **Step 8: Generate the MP3 assets**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm run generate:audio
```

Expected: 13 stable file summaries and `AUTHORED_AUDIO_OK bgm=5 sfx=8`; only the five canonical BGM files and eight canonical SFX files change.

- [ ] **Step 9: Verify signal contracts, package contracts, and distinct BGM files**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm run test:audio-authoring
npm run check:assets
npm run test:delivery-gates
Get-ChildItem -LiteralPath 'public\assets\audio\bgm' -Filter '*.mp3' | Get-FileHash -Algorithm SHA256 | Format-Table -AutoSize
```

Expected: authoring tests PASS, `ASSETS_OK`, delivery gates PASS, and five different SHA-256 hashes. Verify `git status --short` lists the 13 audio files, the two script files, and package metadata, plus the untouched user-owned `tmp/` only.

- [ ] **Step 10: Commit Task 3**

```powershell
git add -- package.json package-lock.json scripts/audio-authoring.cjs scripts/audio-authoring.test.mjs scripts/generate-authored-audio.cjs public/assets/audio/bgm public/assets/audio/sfx
git commit -m "feat: replace soundtrack with upbeat arcade audio"
```

---

### Task 4: Ship the Selected Two-Block Bubble Rotate Control

**Files:**
- Modify: `public/assets/ui/rotate.svg`
- Modify: `src/ui/match/controls.css`
- Modify: `tests/e2e/portrait-layout.spec.ts`

**Interfaces:**
- Consumes: unchanged `RotateButtonProps`, `AssetIcon`, and `rotate.svg` manifest path.
- Produces: the approved option-B visual with unchanged command and accessibility behavior.

- [ ] **Step 1: Write failing mobile geometry expectations**

In `tests/e2e/portrait-layout.spec.ts`, after obtaining `rotate`, add:

```ts
const rotateWidth = viewport.width <= 360
  ? { minimum: 75, maximum: 76 }
  : { minimum: 79, maximum: 80 };
expect(rotate.width).toBeGreaterThanOrEqual(rotateWidth.minimum);
expect(rotate.width).toBeLessThanOrEqual(rotateWidth.maximum);
expect(Math.abs(rotate.width - rotate.height)).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Run focused tests and record the red geometry result**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npx playwright test tests/e2e/portrait-layout.spec.ts --project=chromium-360x640
```

Expected: E2E fails at the exact width assertion because the current `min(22vw, 5.5rem)` is about 79.2px at 360px and 88px at 430px. The approved CSS has not been applied yet.

- [ ] **Step 3: Replace the nested-background SVG**

Set `public/assets/ui/rotate.svg` to a transparent icon with no outer `<rect>`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M5 9.2A7.4 7.4 0 0 1 17.8 5.8" stroke="#fff4cf" stroke-width="2" stroke-linecap="round"/>
  <path d="m16.5 3.8 2.3 1.5-1.4 2.4" stroke="#fff4cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 14.8A7.4 7.4 0 0 1 6.2 18.2" stroke="#fff4cf" stroke-width="2" stroke-linecap="round"/>
  <path d="m7.5 20.2-2.3-1.5 1.4-2.4" stroke="#fff4cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="5.2" y="5.1" width="6.4" height="6.4" rx="1.8" fill="#fff06a" stroke="#171239" stroke-width="1.4"/>
  <rect x="12.4" y="12.5" width="6.4" height="6.4" rx="1.8" fill="#68e3c1" stroke="#171239" stroke-width="1.4"/>
</svg>
```

- [ ] **Step 4: Apply the approved option-B CSS**

Replace only `.rotate-control` visual rules while retaining shared button/touch/focus rules:

```css
.rotate-control {
  width: clamp(4.5rem, 21vw, 5rem);
  overflow: hidden;
  color: #171239;
  background: radial-gradient(circle at 35% 25%, #fff 0 5%, #ff83bf 14%, #e64f9b 58%, #8b2a87 100%);
  box-shadow:
    inset 0 0.14rem 0.22rem rgb(255 255 255 / 42%),
    0 0 0 0.22rem #65d8ff,
    0 0.38rem 0 #171239;
  font: inherit;
}

.rotate-control .asset-icon {
  width: 72%;
  height: 72%;
  object-fit: contain;
  transition: transform 120ms cubic-bezier(0.2, 0.9, 0.3, 1.25);
}

.rotate-control:active {
  transform: translateY(2px);
  box-shadow: inset 0 0.12rem 0.2rem rgb(255 255 255 / 28%), 0 0 0 0.22rem #65d8ff, 0 0.16rem 0 #171239;
}

.rotate-control:active .asset-icon {
  transform: rotate(32deg) scale(0.92);
}

@media (prefers-reduced-motion: reduce) {
  .rotate-control .asset-icon { transition: none; }
  .rotate-control:active .asset-icon { transform: scale(0.96); }
}
```

- [ ] **Step 5: Verify unit, asset, and both mobile layouts**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- src/ui/match/RotateButton.test.tsx
npm run check:assets
npx playwright test tests/e2e/portrait-layout.spec.ts --project=chromium-360x640 --project=webkit-430x932
```

Expected: unit tests PASS, `ASSETS_OK`, both viewport projects PASS, and existing non-overlap checks remain green.

- [ ] **Step 6: Capture and inspect current-screen evidence**

Capture the match screen at 360×640 and 430×932. Confirm the icon has no embedded square background, the two blocks remain legible, the button does not overlap item controls or the board, and the joystick remains visually dominant. Save evidence under `.superpowers/sdd/2026-08-12-upbeat-arcade-audio-rotate-control/evidence/task-4/`; do not stage that ignored directory.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- public/assets/ui/rotate.svg src/ui/match/controls.css tests/e2e/portrait-layout.spec.ts
git commit -m "feat: redesign the puzzle rotate control"
```

---

### Task 5: Listening Acceptance and Full Delivery Verification

**Files:**
- No required tracked source file unless listening feedback produces a composition adjustment.
- Create ignored evidence only under `.superpowers/sdd/2026-08-12-upbeat-arcade-audio-rotate-control/`.

**Interfaces:**
- Consumes: every deliverable from Tasks 1-4.
- Produces: user listening approval, fresh full verification evidence, and a branch ready for the already requested GitHub PR flow.

- [ ] **Step 1: Build a browser listening sheet**

Start Vite on `127.0.0.1:5173`, start the approved brainstorming visual companion with `--project-dir` and `--open`, and create a new `audio-preview.html` screen containing:

- five labeled `<audio controls loop>` players for the canonical BGM URLs;
- eight labeled `<audio controls>` players for the canonical SFX URLs;
- a short note identifying tower, early, late, boss/owl, and ending use;
- no autoplay.

Confirm the companion server is alive before sharing its complete keyed URL.

- [ ] **Step 2: Pause for user listening approval**

Ask the user to listen for mood, repetition seam, cue harshness, and BGM/effect balance. If approved, stop both servers and continue. If adjustments are requested, edit only `scripts/audio-authoring.cjs`, run `npm run generate:audio`, rerun `test:audio-authoring` and `check:assets`, and commit the bounded adjustment:

```powershell
git add -- scripts/audio-authoring.cjs public/assets/audio/bgm public/assets/audio/sfx
git commit -m "fix: tune the arcade soundtrack mix"
```

- [ ] **Step 3: Run fresh focused and complete test suites**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm run typecheck
npm run test:audio-authoring
npm test
python scripts/generate-authored-assets.test.py -v
python scripts/import-player-character-sheet.test.py -v
npm run test:e2e
npm run test:delivery-gates
```

Expected: all commands exit 0. Record exact test counts rather than carrying forward counts from an earlier commit.

- [ ] **Step 4: Run delivery builds and package verification**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm run check:assets
npm run check:source-policy
npm run build:web
npm run build:ait
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
```

Expected: asset and source checks exit 0, both builds succeed, and package verification prints `AIT_OK` with zero vulnerable package markers. Record chunk-size or deprecation warnings separately from failures.

- [ ] **Step 5: Run and classify the dependency audit without changing its baseline**

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm run check:dependency-audit
```

Record the exact fresh output. If it still reports unreviewed new/changed production advisories, keep release readiness blocked while reporting feature tests and merge readiness separately. Do not edit `security/dependency-audit-baseline.json` in this feature.

- [ ] **Step 6: Verify repository hygiene and request final independent review**

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: no diff-check findings and only the user-owned `?? tmp/` remains untracked. Request a whole-branch review focused on audio lifecycle races, duplicated cue playback, generation reproducibility, copyright-expression separation, mobile control overlap, and test gaps. Fix Critical or Important findings with a new test-first commit and rerun affected gates.

- [ ] **Step 7: Hand off to the PR flow**

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. The user already selected push-and-PR against `main`; fetch `origin/main`, verify a conflict-free merge tree, push `feat/pve-delivery`, create or update one open PR, include exact verification results and the dependency-audit blocker, and preserve this worktree for review feedback.
