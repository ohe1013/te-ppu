# Audio Volume Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all authored sound effects clearly audible and add persistent, independent BGM and SFX volume controls to the in-match settings modal.

**Architecture:** Progress schema 5 owns integer percentages and migrates schema 1–4 saves to BGM 70/SFX 100. `AudioPort.setVolumes()` accepts normalized values and drives separate user-volume buses after the existing music dynamics bus and cue-intensity gains. `SettingsPanel` previews slider input immediately through `MatchScreen`, commits only the last value at interaction end, and leaves durable serialization to `TowerController`.

**Tech Stack:** TypeScript 7, React 19, Web Audio API, Vitest, Testing Library, Playwright, Vite, Apps-in-Toss AIT packaging

## Global Constraints

- Keep the existing `soundEnabled` master switch and `hapticsEnabled` setting.
- Expose `BGM 음량` and `효과음 음량` independently from 0 through 100 with `step=10`.
- Use BGM 70 and SFX 100 for new progress and every migrated schema 1–4 save.
- Persist only safe integer percentages from 0 through 100; reject fractional, non-finite, string, out-of-range, and extra settings fields.
- Preview slider movement immediately; persist once at pointer up, keyboard key up, blur, or modal close.
- Play one `rotate` preview only after a changed SFX interaction ends and only while master sound is enabled.
- Preserve music crossfade and ducking independently of the user's BGM volume.
- Preserve master mute, background suspend/resume, 3-2-1 resume, stale-decode cancellation, deterministic gameplay, and non-fatal audio failure boundaries.
- A full page reload must preserve persisted audio settings and show them in the next match.
- A background hidden/visible return must independently preserve the chosen volumes and resume the current match through the existing visible 3-2-1 countdown.
- Restoring the active board or match across a full page reload is explicitly out of scope.
- Do not regenerate or replace MP3 assets in this change.
- Do not modify, inspect, stage, or delete the user-owned untracked `tmp/` directory.
- Keep the dependency-audit review gate separate from feature correctness and release readiness.

## File Structure

- `src/progression/schema.ts`: schema 5 settings contract, exact validation, and schema 1–4 migration.
- `src/app/towerController.ts`: runtime partial-settings validation and durable save queue entry.
- `src/platform/audio-port.ts`: normalized volume command contract.
- `src/platform/web-audio-port.ts`: music dynamics, BGM user-volume, SFX user-volume, and corrected cue balance.
- `src/app/AppRoot.tsx`: synchronize persisted percentages and master sound into the shared root-owned audio port.
- `src/ui/match/SettingsPanel.tsx`: accessible local slider state, immediate preview, deduplicated interaction-end persistence, and preview cue request.
- `src/ui/screens/MatchScreen.tsx`: adapt integer percentages to normalized audio values without transferring audio ownership.
- `src/ui/match/match-layout.css`: compact slider layout that remains usable at 360×640 and 430×932.
- `tests/e2e/lifecycle-controls.spec.ts`: browser-level settings interaction and persistence coverage.
- Existing test helpers containing `ProgressState['settings']` or `AudioPort` literals: compile-compatible schema 5 and `setVolumes()` fixtures.

---

### Task 1: Persist schema 5 audio percentages

**Files:**
- Modify: `src/progression/schema.ts`
- Modify: `src/app/towerController.ts`
- Test: `tests/progression/schema.test.ts`
- Test: `tests/progression/localProgressRepository.test.ts`
- Test: `tests/progression/progressRepositoryFactory.test.ts`
- Test: `tests/progression/tower.test.ts`
- Test: `tests/app/towerController.test.ts`
- Test fixtures: `tests/e2e/helpers.ts`
- Test fixtures: `src/app/AppRoot.test.tsx`
- Test fixtures: `src/app/use-match-loop.test.tsx`
- Test fixtures: `src/ui/match/lifecycle-ui.test.tsx`
- Test fixtures: `src/ui/screens/MatchScreen.test.tsx`

**Interfaces:**
- Consumes: legacy schema 1–4 payloads containing `{ soundEnabled: boolean; hapticsEnabled: boolean }`.
- Produces: `ProgressSettings`, `ProgressState.schemaVersion: 5`, and settings `{ soundEnabled, bgmVolume, sfxVolume, hapticsEnabled }`.

- [ ] **Step 1: Write failing schema and controller tests**

Add literal expectations that fail if migration defaults or numeric validation are removed:

```ts
const defaultSettings = {
  soundEnabled: true,
  bgmVolume: 70,
  sfxVolume: 100,
  hapticsEnabled: true,
} as const;

it('migrates schema 4 audio settings to schema 5 defaults', () => {
  expect(parsePersistedProgress(currentVersion4)).toMatchObject({
    migrated: true,
    state: { schemaVersion: 5, settings: defaultSettings },
  });
});

it.each([
  { bgmVolume: -1 },
  { bgmVolume: 101 },
  { sfxVolume: 50.5 },
  { sfxVolume: '100' },
])('rejects invalid persisted audio percentages: %j', (patch) => {
  expect(parsePersistedProgress({
    ...currentState,
    settings: { ...defaultSettings, ...patch },
  })).toBeNull();
});
```

Extend the controller behavior test with `{ bgmVolume: 40, sfxVolume: 80 }`, and add rejection cases for `-1`, `101`, `1.5`, `NaN`, and unknown keys. The observable assertions are the detached progress snapshot and repository writes, not private validator calls.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
$env:PATH='C:\Users\USER\AppData\Roaming\nvm\v24.15.0;' + $env:PATH
npm test -- tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/app/towerController.test.ts
```

Expected: FAIL because the current schema is 4, the volume fields do not exist, and the controller rejects numeric settings.

- [ ] **Step 3: Implement the schema 5 contract and migration**

Define the exact public type and defaults in `schema.ts`:

```ts
export interface ProgressSettings {
  soundEnabled: boolean;
  bgmVolume: number;
  sfxVolume: number;
  hapticsEnabled: boolean;
}

const DEFAULT_BGM_VOLUME = 70;
const DEFAULT_SFX_VOLUME = 100;

export interface ProgressState {
  schemaVersion: 5;
  // existing fields unchanged
  settings: ProgressSettings;
}
```

Keep a private legacy settings type for schema 1–4. Rename the current schema-4 parser to parse a legacy `Version4ProgressState`, add an exact schema-5 parser, and convert old settings with:

```ts
function migrateSettings(settings: LegacySettings): ProgressSettings {
  return {
    soundEnabled: settings.soundEnabled,
    bgmVolume: DEFAULT_BGM_VOLUME,
    sfxVolume: DEFAULT_SFX_VOLUME,
    hapticsEnabled: settings.hapticsEnabled,
  };
}
```

Validate both volume fields with `Number.isSafeInteger(value) && value >= 0 && value <= 100`. Make `cloneProgressState()` and every migration return schema 5. Update all typed settings fixtures with literal 70/100 values; retain old two-field literals only where a test intentionally represents schema 1–4 input.

Update `isSettingsUpdate()` in `towerController.ts` so boolean keys accept only booleans and volume keys accept only safe integer percentages:

```ts
function isVolume(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}
```

- [ ] **Step 4: Run focused tests, typecheck, and verify GREEN**

Run:

```powershell
npm test -- tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/progression/progressRepositoryFactory.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts
npm run typecheck
```

Expected: all selected tests pass and TypeScript reports no missing schema 5 settings fields.

- [ ] **Step 5: Commit the independently working persistence change**

```powershell
git add -- src/progression/schema.ts src/app/towerController.ts tests/progression tests/app/towerController.test.ts tests/e2e/helpers.ts src/app/AppRoot.test.tsx src/app/use-match-loop.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/MatchScreen.test.tsx
git commit -m "feat: persist independent audio volumes"
```

---

### Task 2: Separate Web Audio volume buses and restore audible SFX

**Files:**
- Modify: `src/platform/audio-port.ts`
- Modify: `src/platform/web-audio-port.ts`
- Test: `src/platform/web-audio-port.test.ts`
- Test fixtures: `src/platform/app-lifecycle.test.ts`
- Test fixtures: `src/app/AppRoot.test.tsx`
- Test fixtures: `src/app/use-boot.test.tsx`
- Test fixtures: `src/app/use-match-loop.test.tsx`
- Test fixtures: `src/ui/match/lifecycle-ui.test.tsx`
- Test fixtures: `src/ui/screens/MatchScreen.test.tsx`

**Interfaces:**
- Consumes: normalized BGM and SFX values from 0 through 1.
- Produces: `AudioVolumes` and required `AudioPort.setVolumes(volumes: AudioVolumes): void`.

- [ ] **Step 1: Write failing audio graph tests**

Add tests whose literal graph and gain assertions catch bus crossover, duck reset, and the old inaudible `0.14` gain:

```ts
it('remembers independent volumes before unlock and applies them to separate buses', async () => {
  const fixture = createContext();
  const audio = createWebAudioPort({
    createContext: () => fixture.context,
    fetchAudio: async () => new ArrayBuffer(8),
    resolveSources: createCatalog,
  });

  audio.setVolumes({ bgm: 0.4, sfx: 0.8 });
  await audio.unlock();
  await audio.setMusic('tower');
  audio.play('rotate');
  await flushMicrotasks();

  expect(fixture.musicVolumeGain().gain.calls).toContainEqual(['set', 0.4, 4]);
  expect(fixture.sfxVolumeGain().gain.calls).toContainEqual(['set', 0.8, 4]);
  expect(fixture.decodedCueGain().gain.calls).toEqual([['set', 0.75, 4]]);
});
```

Extend the fixture with named selectors based on connection topology rather than fragile global indices. Add tests for:

- updating only BGM while a track is active without restarting its source;
- updating only SFX without changing music dynamics;
- BGM 0 and SFX 0;
- ducking and restoration changing only music dynamics while user BGM remains 0.4;
- oscillator fallback connecting through the SFX bus;
- suspend/resume retaining both values;
- destroy disconnecting both user-volume buses and ignoring later changes.

- [ ] **Step 2: Run the Web Audio test and verify RED**

Run:

```powershell
npm test -- src/platform/web-audio-port.test.ts
```

Expected: FAIL because `setVolumes()` and the two user-volume buses do not exist and intensity zero still uses sample gain 0.14.

- [ ] **Step 3: Add the public volume contract**

Add to `audio-port.ts`:

```ts
export interface AudioVolumes {
  readonly bgm: number;
  readonly sfx: number;
}

export interface AudioPort {
  // existing methods unchanged
  setVolumes(volumes: AudioVolumes): void;
}
```

Add `setVolumes: vi.fn()` to every complete `AudioPort` test fixture listed above. Do not make the method optional because root synchronization relies on the contract.

- [ ] **Step 4: Implement independent lazy output buses**

Store clamped normalized values before the context exists:

```ts
let bgmVolume = 0.7;
let sfxVolume = 1;
let musicDynamicsGain: WebAudioGainPort | null = null;
let musicVolumeGain: WebAudioGainPort | null = null;
let sfxVolumeGain: WebAudioGainPort | null = null;
```

Build the graph lazily so music sources connect to `musicDynamicsGain -> musicVolumeGain -> destination`, and cue-local gain nodes connect to `sfxVolumeGain -> destination`. Keep crossfade and duck automation on `musicDynamicsGain` only. Apply user values with `cancelScheduledValues(now)` and `setValueAtTime(value, now)` so zero is legal.

Replace the decoded sample profile with the literal monotonic gains:

```ts
const SAMPLE_GAINS = [0.75, 0.84, 0.92, 1] as const;
```

Give oscillator fallbacks their own monotonic multiplier rather than deriving from the decoded sample baseline:

```ts
const OSCILLATOR_GAIN_MULTIPLIERS = [1, 1.12, 1.24, 1.36] as const;
```

Route every decoded and fallback cue through the shared SFX user bus. Disconnect both user buses in `destroy()` and make `setVolumes()` a no-op after destruction.

- [ ] **Step 5: Run audio tests and typecheck, then verify GREEN**

Run:

```powershell
npm test -- src/platform/web-audio-port.test.ts src/platform/app-lifecycle.test.ts
npm run typecheck
```

Expected: Web Audio and lifecycle tests pass; complete `AudioPort` fixtures all satisfy `setVolumes()`.

- [ ] **Step 6: Commit the independently working audio engine change**

```powershell
git add -- src/platform/audio-port.ts src/platform/web-audio-port.ts src/platform/web-audio-port.test.ts src/platform/app-lifecycle.test.ts src/app/AppRoot.test.tsx src/app/use-boot.test.tsx src/app/use-match-loop.test.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/screens/MatchScreen.test.tsx
git commit -m "fix: separate music and sound effect volume buses"
```

---

### Task 3: Add immediate-preview volume sliders

**Files:**
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/match/SettingsPanel.tsx`
- Modify: `src/ui/match/match-layout.css`
- Test: `src/app/AppRoot.test.tsx`
- Test: `src/ui/screens/MatchScreen.test.tsx`
- Test: `src/ui/match/lifecycle-ui.test.tsx`
- Test: `tests/e2e/lifecycle-controls.spec.ts`

**Interfaces:**
- Consumes: persisted integer `bgmVolume`/`sfxVolume`, `AudioPort.setVolumes()`, `AudioPort.play()`, and existing `onSettingsChange()` durability.
- Produces: `onVolumePreview(settings: Pick<ProgressSettings, 'bgmVolume' | 'sfxVolume'>): void` and `onSfxPreview(): void` callbacks on `SettingsPanel`.

- [ ] **Step 1: Write failing root synchronization and settings UI tests**

Add an `AppRoot` assertion that loaded values become normalized audio values:

```ts
expect(audioPort.setVolumes).toHaveBeenLastCalledWith({ bgm: 0.35, sfx: 0.8 });
```

Add Testing Library behavior coverage:

```tsx
expect(screen.getByRole('checkbox', { name: '전체 소리' })).toBeChecked();
expect(screen.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('70');
expect(screen.getByRole('slider', { name: '효과음 음량' })).toHaveValue('100');
expect(screen.getByText('70%')).toBeVisible();
expect(screen.getByText('100%')).toBeVisible();
```

Use `fireEvent.change()` followed by `fireEvent.pointerUp()` to prove multiple changes preview immediately but save once with the final integer. Assert SFX preview fires once after SFX commit, BGM commit never plays it, unchanged blur does not save, and master sound off disables both sliders and suppresses preview.

Extend the browser settings lifecycle coverage to open `게임 설정`, assert 70/100 defaults, change BGM to 40 and SFX to 80, end each interaction, and assert 40/80 remain visible after close/reopen and a full page reload followed by entry into the next match. Separately strengthen the existing background hidden/visible scenario to prove the chosen volumes remain unchanged while the current match resumes through the existing visible 3-2-1 countdown. Do not require the active board or match to survive a full page reload. Use role selectors with the exact names `BGM 음량` and `효과음 음량`.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```powershell
npm test -- src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
npx playwright test tests/e2e/lifecycle-controls.spec.ts
```

Expected: both commands FAIL because root volume synchronization, sliders, percentage labels, preview callbacks, and interaction-end persistence do not exist.

- [ ] **Step 3: Synchronize durable settings from AppRoot**

Extend the existing audio settings effect without coupling it to route changes:

```ts
useEffect(() => {
  if (controller === null) return;
  const { soundEnabled, bgmVolume, sfxVolume } = controller.progress.settings;
  services.audioPort.setEnabled(soundEnabled);
  services.audioPort.setVolumes({
    bgm: bgmVolume / 100,
    sfx: sfxVolume / 100,
  });
}, [
  controller,
  controller?.progress.settings.soundEnabled,
  controller?.progress.settings.bgmVolume,
  controller?.progress.settings.sfxVolume,
  services.audioPort,
]);
```

The effect must not call `setMusic()` or restart an active source.

- [ ] **Step 4: Implement local slider preview and deduplicated commit**

In `SettingsPanel`, store local BGM/SFX integers and refs for the last committed values. On each range change, update local state and call:

```ts
onVolumePreview({ bgmVolume: nextBgm, sfxVolume: nextSfx });
```

Finalize a changed control on pointer up, keyboard key up, blur, and modal close. Assign the final value to the committed ref before awaiting `onSettingsChange()` so pointer-up-plus-blur cannot duplicate the save. Call `onSfxPreview()` once after assigning and only for an enabled, changed SFX commit. Keep local values on save failure and reuse the existing retry message.

Render the controls in this order with exact Korean labels: `전체 소리`, `BGM 음량`, `효과음 음량`, `진동`. Use native range attributes `min={0}`, `max={100}`, `step={10}`, and an adjacent `<output>` containing `${value}%`.

In `MatchScreen`, widen the borrowed audio type to `Pick<AudioPort, 'play' | 'setVolumes'>` and adapt callbacks:

```ts
onVolumePreview={({ bgmVolume, sfxVolume }) => audio.setVolumes({
  bgm: bgmVolume / 100,
  sfx: sfxVolume / 100,
})}
onSfxPreview={() => audio.play('rotate')}
```

Do not unlock, suspend, resume, destroy, or take ownership of the root audio port.

- [ ] **Step 5: Add compact responsive slider styles**

Give range inputs a dedicated class so the existing checkbox rule does not force them to `1.2rem` wide. Use a two-column grid for label and percentage, with the range spanning the row:

```css
.settings-panel__volume {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 0.5rem;
}

.settings-panel input[type='range'] {
  grid-column: 1 / -1;
  width: 100%;
  height: 1.5rem;
}
```

Keep the modal within its existing maximum height and preserve visible focus outlines.

- [ ] **Step 6: Run focused UI tests and typecheck, then verify GREEN**

Run:

```powershell
npm test -- src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
npx playwright test tests/e2e/lifecycle-controls.spec.ts
npm run typecheck
```

Expected: root synchronization and UI behavior pass, with no borrowed-audio ownership regression.

- [ ] **Step 7: Commit the independently working settings UI**

```powershell
git add -- src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/SettingsPanel.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/match/match-layout.css tests/e2e/lifecycle-controls.spec.ts
git commit -m "feat: add persistent audio volume sliders"
```

---

### Task 4: Perform integration and listening validation, then update PR #3

**Files:**
- Modify if verification exposes a focused defect: only the Task 1–3 files responsible for that defect, with a new failing regression test first
- Verify: `artifacts/ait/game.ait`

**Interfaces:**
- Consumes: completed schema, Web Audio, and settings UI behavior from Tasks 1–3.
- Produces: complete regression evidence, mobile visual evidence, listening approval, verified AIT artifact, and updated remote PR branch.

- [ ] **Step 1: Run the complete automated verification matrix**

Run each command independently and record exact exit status and counts:

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run test:delivery-gates
npm run check:assets
npm run check:source-policy
npm run build:web
npm run build:ait
node scripts/verify-ait-package.mjs artifacts/ait/game.ait
npm run check:dependency-audit
git diff --check origin/main...HEAD
```

The dependency audit may remain a release blocker; report its exact `new`, `changed`, `versionChanged`, and `expired` counts rather than treating it as a feature-test failure.

- [ ] **Step 2: Perform mobile visual and listening validation**

At 360×640 and 430×932, verify the settings modal shows the four controls without hiding the close or retry actions. Listen at BGM 0/70/100 and SFX 0/50/100, then specifically verify move, rotate, land, clear, attack, item, win, and loss at the default 70/100 mix. Confirm SFX commit plays exactly one rotate preview and master mute suppresses it.

If listening requires coefficient tuning, change only the literal cue balance constants in `web-audio-port.ts`, update their behavioral tests first, and rerun the focused audio test before the full matrix.

- [ ] **Step 3: Add a regression test before any validation-driven correction**

If automated, visual, or listening validation exposes a defect, identify the owning Task 1–3 boundary, add the smallest automated test that fails for that defect, verify RED, implement one correction, and verify GREEN. Do not adjust multiple coefficients or subsystems in one experiment.

- [ ] **Step 4: Commit any validation-driven correction**

```powershell
git add -- src/progression/schema.ts src/app/towerController.ts src/platform/audio-port.ts src/platform/web-audio-port.ts src/app/AppRoot.tsx src/ui/screens/MatchScreen.tsx src/ui/match/SettingsPanel.tsx src/ui/match/match-layout.css tests/progression/schema.test.ts tests/progression/localProgressRepository.test.ts tests/app/towerController.test.ts src/platform/web-audio-port.test.ts src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx tests/e2e/lifecycle-controls.spec.ts
git commit -m "fix: address audio volume validation finding"
```

Skip this commit step when validation requires no correction; never create an empty commit.

- [ ] **Step 5: Push the existing branch and verify PR #3**

```powershell
git status --short --branch
git push origin feat/pve-delivery
git ls-remote --heads origin feat/pve-delivery
```

Verify the remote SHA equals local `HEAD`, PR #3 remains open against `main`, and a fresh `git merge-tree --write-tree origin/main HEAD` exits zero. Keep the linked worktree for review feedback and leave `tmp/` untouched.
