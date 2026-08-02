# Runtime Asset and Audio Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-safe hybrid fantasy/pixel asset, portrait, animation, and music pipeline that upgrades presentation when approved files are present while preserving the complete procedural game as a non-blocking fallback.

**Architecture:** A strict public manifest selects either `procedural-fallback` or a complete authored asset bundle. One app-lifetime asset manager coalesces loads and exposes only successfully decoded bundles; React screens and Pixi rendering continue through existing CSS/Graphics fallbacks for every missing or failed asset. Presentation receives tick-stamped event batches and command-feedback signals outside the deterministic core, while one app-lifetime audio port owns SFX/BGM and route-driven music.

**Tech Stack:** TypeScript 7, React 19, PixiJS 8, @pixi/react 8, Web Audio API, Vitest 4, Playwright 1.62, Node 24.15, Apps-in-Toss web framework 2.10.8

## Global Constraints

- Preserve the exact 10×20 visible boards, equal player/opponent rendering size, 60 Hz deterministic core, replay boundary, AI decisions, item rules, joystick, and input lifecycle.
- Runtime assets live only below `public/assets/`; source masters remain outside the runtime bundle.
- A complete authored bundle contains exactly: 1 opaque 600×600 logo PNG; 7 transparent 1024×1024 full-art WebPs; 38 transparent 256×256 portraits; 1 tower and 5 floor 840×1480 background WebPs; 7 tetromino and 1 garbage 64×64 PNGs; 3 item 64×64 PNGs; 7 SVG UI icons; 1 PNG atlas plus JSON; 8 MP3 SFX; and 5 looping MP3 BGM tracks.
- The 38 portrait paths are exactly: hero `idle/focus/attack/hit/win/loss`; each of four lieutenants `idle/smug/attack/hit/panic/defeat`; demon king `idle/attack/hit/rage/defeat`; owl `idle/worry/cheer`.
- Floor opponents are exactly `1:quartermaster`, `2:alchemist`, `3:guard-captain`, `4:dark-engineer`, and `5:demon-king`; `hero-engineer` and `owl-companion` are common assets.
- Authored floor art carries the original black-gear/gold-crown `gear-crown` organization insignia once per character and once per floor background; lieutenants wear a reversed/misattached form and the serious demon king wears the complete form.
- UI icon IDs are exactly `rotate`, `settings`, `sound-on`, `sound-off`, `haptics-on`, `haptics-off`, and `exit`; SFX IDs are exactly `move`, `rotate`, `land`, `clear`, `attack`, `item`, `win`, and `loss`.
- Full art and portrait WebPs retain alpha; character WebP quality is at least 85 and background WebP quality at least 80. Pixel/item PNGs are transparent 4× exports of a 16×16 logical grid.
- The manifest has `schemaVersion: 1` and is either `{ mode: 'procedural-fallback' }` or a complete `mode: 'assets'` document; partial authored manifests are invalid.
- `loadCommon()` and `loadFloor()` resolve to `'ready'` or `'fallback'`; failures never block boot, input, AI, combat, result routing, or saving.
- Common assets load once; only the current and next floor are retained; rejected prefetch promises are always handled.
- HUD portraits render at 24×24 CSS px in a fixed three-column header and 20×20 at viewport heights at or below 700px; boards shrink only after portraits have reached those limits.
- Portrait priority is terminal > hit/freeze 25 ticks > attack/item 18 ticks > persistent danger > focus 18 ticks / smug 21 ticks > idle.
- Move/rotate feedback is presentation-only `onCommandFeedback(side, command, tick)` and may fire for rejected commands; it must not enter `GameEvent`, match state, replay, or AI observations.
- Atlas format is TexturePacker JSON Hash, `rotated:false`, `meta.image:'battle-atlas.png'`, `meta.format:'RGBA8888'`, `meta.scale:'1'`, with the exact nine animation groups in the approved spec.
- Pixel tiles use nearest-neighbor scaling; the existing Graphics renderer remains the per-ID fallback.
- Music routes are: boot none; tower/floor intro `tower`; floors 1–2 match/result `early-floors`; floors 3–4 `late-floors`; floor 5 `demon-king`; ending `ending`.
- The same music track never restarts; track changes use a 150ms fade; background/resume countdown, mute, failed decode, and root destroy are non-fatal.
- Runtime authored assets stay under 30 MB and the unpacked `.ait` stays under 100 MB.
- `AIT_ICON_URL` must identify the console-hosted copy of the same 600×600 opaque PNG for QR evidence; env-less builds are local-browser evidence only.

---

### Task 1: Typed Manifest and Coalescing Asset Manager

**Files:**
- Create: `src/assets/types.ts`
- Create: `src/assets/manifest.ts`
- Create: `src/assets/asset-manager.ts`
- Create: `src/assets/index.ts`
- Create: `src/assets/asset-manager.test.ts`
- Create: `public/assets/manifest.json`
- Modify: `src/app/app-services.ts`
- Modify: `src/app/use-boot.ts`
- Modify: `src/app/use-boot.test.tsx`

**Interfaces:**
- Consumes: canonical `Floor` and `MusicTrack` (temporarily define/import the type from `src/platform/audio-port.ts`; Task 3 adds behavior).
- Produces: `AssetManager`, `CommonAssets`, `FloorAssetBundle`, `GAME_ASSET_PATH = '/assets/manifest.json'`, and `createAssetManager(options)`.

- [ ] **Step 1: Write failing parser and manager behavior tests**

```ts
it('coalesces common and per-floor loads and isolates rejected prefetch', async () => {
  const fetchManifest = vi.fn().mockResolvedValue(completeManifest);
  const loadImage = vi.fn().mockResolvedValue(undefined);
  const manager = createAssetManager({ fetchManifest, loadImage });

  await expect(Promise.all([manager.loadCommon(), manager.loadCommon()]))
    .resolves.toEqual(['ready', 'ready']);
  await expect(Promise.all([manager.loadFloor(2), manager.loadFloor(2)]))
    .resolves.toEqual(['ready', 'ready']);
  expect(fetchManifest).toHaveBeenCalledTimes(1);
  expect(loadImage.mock.calls.length).toBeGreaterThan(0);
});
```

Add tests for fallback mode, malformed/unknown IDs, one image rejection returning `fallback` while publishing the other successful refs, `getCommonAssets()`/`getFloorAssets()` returning `null` only while unresolved or in explicit procedural mode, next-floor prefetch swallowing rejection, idempotent release, and invalid floor calls being blocked by the type/runtime guard.

- [ ] **Step 2: Run the new tests and verify imports are missing**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/asset-manager.test.ts src/app/use-boot.test.tsx`

Expected: FAIL because no asset contract or manager exists.

- [ ] **Step 3: Define the complete manifest types**

```ts
export type CharacterId =
  | 'hero-engineer' | 'owl-companion' | 'quartermaster' | 'alchemist'
  | 'guard-captain' | 'dark-engineer' | 'demon-king';

export type PortraitState =
  | 'idle' | 'focus' | 'attack' | 'hit' | 'win' | 'loss'
  | 'panic' | 'smug' | 'defeat' | 'rage' | 'worry' | 'cheer';

export interface FloorAssets {
  readonly floor: Floor;
  readonly opponent: CharacterId;
  readonly backgroundUrl: string;
  readonly music: MusicTrack;
}

export interface AssetManager {
  loadCommon(): Promise<'ready' | 'fallback'>;
  loadFloor(floor: Floor): Promise<'ready' | 'fallback'>;
  prefetchFloor(floor: Floor): void;
  releaseFloor(floor: Floor): void;
  getCommonAssets(): CommonAssets | null;
  getFloorAssets(floor: Floor): FloorAssetBundle | null;
}
```

`CommonAssets` owns optional decoded refs for hero/owl full art and portraits, seven tile URLs, garbage, three items, seven UI icons, atlas PNG/JSON, and typed SFX/BGM catalogs. `FloorAssetBundle` extends `FloorAssets` with optional opponent full art/background refs and the exact portrait-state URL map required for that opponent. The manifest is all-or-nothing structurally, but runtime network/decode failures are represented as missing refs inside an otherwise usable bundle.

- [ ] **Step 4: Implement a strict manifest parser and load promise maps**

Cache one manifest promise, one common promise, and one promise per floor. Publish every successfully loaded ref even when a sibling fails; return `fallback` when at least one required ref failed so each consumer uses its per-ID CSS/Graphics fallback. Delete rejected floor promises so a later explicit load can retry. `prefetchFloor()` calls `void loadFloor(floor).catch(() => undefined)`. `releaseFloor()` removes decoded image handles and cached floor bundles but never common assets or source manifest metadata.

- [ ] **Step 5: Wire the manager into services and boot without blocking gameplay**

Add `assetManager` to `AppServices` and overrides. In `useBoot`, include `assetManager.loadCommon()` in the boot `Promise.all`; manager failures must be caught and converted to `fallback`, not to a blocked or retryable boot state. Start with this exact checked-in fallback manifest:

```json
{
  "schemaVersion": 1,
  "mode": "procedural-fallback"
}
```

- [ ] **Step 6: Run asset, boot, and service tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/asset-manager.test.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx`

Expected: PASS in fallback mode with no intentional 404 request and no boot regression.

- [ ] **Step 7: Commit the asset boundary**

```powershell
git add src/assets src/app/app-services.ts src/app/use-boot.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx public/assets/manifest.json
git commit -m "feat: add non-blocking asset manifest runtime"
```

---

### Task 2: Asset Validation, Logo, and Delivery Gates

**Files:**
- Create: `scripts/validate-assets.mjs`
- Create: `scripts/validate-assets.test.mjs`
- Create: `scripts/qa/check-ait-icon-env.mjs`
- Create: `scripts/qa/check-ait-icon-env.test.mjs`
- Create: `public/assets/brand/app-logo.png`
- Modify: `package.json`
- Modify: `granite.config.ts`
- Modify: `scripts/verify-ait-package.mjs`
- Modify: `scripts/verify-ait-package.test.mjs`
- Modify: `scripts/qa/apps-in-toss-private-qr.test.mjs`

**Interfaces:**
- Consumes: the manifest schema and exact asset tables from Task 1 and the approved design spec.
- Produces: `npm run check:assets`, `ASSETS_REQUIRED=1` full-art gate, and QR icon evidence gate.

- [ ] **Step 1: Write failing validation tests with temporary fixture directories**

```js
test('accepts fallback locally and rejects it when authored assets are required', async () => {
  await assert.doesNotReject(() => validateAssets(fallbackRoot, { assetsRequired: false }));
  await assert.rejects(
    () => validateAssets(fallbackRoot, { assetsRequired: true }),
    /authored asset manifest is required/,
  );
});
```

Add explicit failing fixtures for missing referenced files, `..`/absolute paths, non-ASCII runtime names, wrong PNG/WebP dimensions, transparency on the opaque logo, atlas `rotated:true`, wrong group frame counts/source sizes, wrong `meta.image`, manifest extras/missing keys, and total runtime bytes over 30 MiB.

- [ ] **Step 2: Run the Node tests and confirm the validator is absent**

Run: `npx -y node@24.15.0 --test scripts/validate-assets.test.mjs scripts/qa/check-ait-icon-env.test.mjs scripts/verify-ait-package.test.mjs`

Expected: FAIL with module-not-found for the new validator/gate.

- [ ] **Step 3: Implement binary-header and atlas validation without adding dependencies**

Read PNG IHDR width/height/color flags, parse WebP VP8/VP8L/VP8X dimensions and alpha metadata, inspect MP3/WAV presence/size, and strictly parse the TexturePacker JSON Hash envelope. Enforce the exact files/dimensions/frame counts/FPS/source sizes/anchors defined in the spec; runtime file names must match `^[a-z0-9][a-z0-9/_-]*\.(png|webp|svg|json|mp3)$`.

- [ ] **Step 4: Add the 600×600 opaque local brand image**

Before generating this bitmap, invoke the `imagegen` skill. Use this exact art direction: “600×600 opaque square app icon, cheerful apprentice magic engineer raising a glowing tetromino wand in front of a five-floor fantasy tower, tiny clockwork owl, clean original character design, bright cute fantasy palette, restrained retro pixel spark accents, readable at 48px, no text, no logos from existing games, no transparent background.” Save the final PNG at `public/assets/brand/app-logo.png`, then validate its IHDR dimensions and opacity.

- [ ] **Step 5: Wire build and QR requirements**

Add `"check:assets": "node scripts/validate-assets.mjs"`. Prefix both `build:web` and Granite's Apps build with `npm run check:assets`, and add `scripts/validate-assets.test.mjs` plus `scripts/qa/check-ait-icon-env.test.mjs` to the explicit `test:delivery-gates` command. Set Granite icon to:

```ts
icon: process.env.AIT_ICON_URL ?? '/assets/brand/app-logo.png'
```

`check-ait-icon-env.mjs` requires an HTTPS `AIT_ICON_URL` when `QR_EVIDENCE=1`, rejects localhost/data URLs, and documents that it must be the console-hosted copy of the same PNG. `verify-ait-package.mjs` confirms the local logo and all authored manifest references exist in the archive when `mode:'assets'`.

- [ ] **Step 6: Run asset and delivery-gate tests**

Run: `npx -y node@24.15.0 --test scripts/validate-assets.test.mjs scripts/qa/check-ait-icon-env.test.mjs scripts/verify-ait-package.test.mjs scripts/qa/apps-in-toss-private-qr.test.mjs`

Expected: PASS; fallback mode passes ordinary builds, while `ASSETS_REQUIRED=1` and `QR_EVIDENCE=1` fail with actionable messages until a full pack and hosted icon URL are supplied.

- [ ] **Step 7: Commit validation and branding**

```powershell
git add scripts package.json granite.config.ts public/assets/brand/app-logo.png
git commit -m "build: validate art assets and app branding"
```

---

### Task 3: App-Lifetime SFX and Route Music

**Files:**
- Modify: `src/platform/audio-port.ts`
- Modify: `src/platform/web-audio-port.ts`
- Modify: `src/platform/web-audio-port.test.ts`
- Create: `src/platform/audio-route.ts`
- Create: `src/platform/audio-route.test.ts`
- Modify: `src/app/app-services.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/platform/app-lifecycle.ts`
- Modify: `src/platform/app-lifecycle.test.ts`

**Interfaces:**
- Consumes: asset manifest SFX/BGM source catalogs and `AppRoute`.
- Produces: `MusicTrack`, `AudioPort.setMusic(track|null)`, and `musicForRoute(route)`.

- [ ] **Step 1: Add failing audio contract and route-map tests**

```ts
expect(musicForRoute({ name: 'tower' })).toBe('tower');
expect(musicForRoute({ name: 'match', floor: 1, seed: 1 })).toBe('early-floors');
expect(musicForRoute({ name: 'result', floor: 4, result: 'win' })).toBe('late-floors');
expect(musicForRoute({ name: 'match', floor: 5, seed: 1 })).toBe('demon-king');
expect(musicForRoute({ name: 'ending' })).toBe('ending');
```

Add Web Audio adapter tests for: set-before-unlock remembers the desired track; same track is not restarted; a changed track ramps down for exactly 0.15 seconds before replacement; mute preserves position; foreground resume requires enabled+unlocked; SFX decoded-buffer failure uses the existing oscillator; BGM failure stays silent; destroy is idempotent.

- [ ] **Step 2: Run audio, lifecycle, and AppRoot tests to verify missing methods/ownership failures**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform/web-audio-port.test.ts src/platform/audio-route.test.ts src/platform/app-lifecycle.test.ts src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx`

Expected: FAIL because music and root ownership do not exist.

- [ ] **Step 3: Extend the port and implement route mapping**

```ts
export type MusicTrack = 'tower' | 'early-floors' | 'late-floors' | 'demon-king' | 'ending';

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setMusic(track: MusicTrack | null): Promise<void>;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
```

Implement `musicForRoute()` exactly from Global Constraints. The audio adapter stores `desiredTrack`, `activeTrack`, `unlocked`, `enabled`, and `backgrounded` separately. `CreateWebAudioPortOptions.resolveSources?: () => AudioSourceCatalog` reads the manager's latest common bundle lazily, so the port may be constructed before boot assets load. Decode/load promises are coalesced by URL. Keep the current oscillator `CUES` as the fallback for unavailable SFX samples.

- [ ] **Step 4: Move audio ownership to `AppServices`/`AppRoot`**

Create the port once in `createAppServices`. AppRoot calls `setMusic(musicForRoute(route))` on route changes, `setEnabled` on settings changes, exposes pointer/keyboard unlock capture at `#app-shell`, and schedules `destroy()` only after a 300ms root-unmount grace period. A StrictMode effect re-mount within the grace period cancels destruction. Make `MatchScreen.audioPort` required and remove its own `createWebAudioPort` and delayed-destroy ownership.

- [ ] **Step 5: Separate audio lifecycle from match pause lifecycle**

Let `createAppLifecycleCoordinator` accept optional `audio`. AppRoot owns one audio-enabled coordinator for all routes with no-op match callbacks. MatchScreen owns a coordinator without audio for input reset, deterministic pause, and the existing 3-second countdown. Both calculate the same foreground deadline; only AppRoot touches the audio context, so there is no duplicate suspend/resume.

- [ ] **Step 6: Run all focused audio and UI tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx src/app/use-match-loop.test.tsx`

Expected: PASS; strict-mode remounts do not close the active port and route changes select exactly one music track.

- [ ] **Step 7: Commit app-lifetime audio**

```powershell
git add src/platform src/app src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx
git commit -m "feat: add route-aware app audio"
```

---

### Task 4: Tick-Accurate Event Batches and Portrait States

**Files:**
- Modify: `src/app/use-match-loop.ts`
- Modify: `src/app/use-match-loop.test.tsx`
- Create: `src/ui/match/portrait-state.ts`
- Create: `src/ui/match/portrait-state.test.ts`
- Create: `src/ui/match/AssetImage.tsx`
- Create: `src/ui/match/AssetImage.test.tsx`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/screens/MatchScreen.tsx`

**Interfaces:**
- Consumes: core `GameEvent`, public board views, character portrait maps, and match ticks.
- Produces: `GameEventBatch`, `PortraitPresentation`, and `resolvePortraitState(input)`.

- [ ] **Step 1: Add failing catch-up and portrait priority tests**

```ts
expect(published.eventBatches).toEqual([
  { tick: 18, events: expect.any(Array), view: expect.objectContaining({ tick: 18 }) },
  { tick: 19, events: expect.any(Array), view: expect.objectContaining({ tick: 19 }) },
]);

expect(resolvePortraitState({ tick: 100, hitUntil: 110, attackUntil: 118, danger: true, terminal: null }))
  .toBe('hit');
```

Test 25-tick hit/freeze, 18-tick attack/focus, 21-tick smug, persistent danger, terminal permanence, later-event-wins ties, and pause/catch-up behavior. Danger is true when any cell in the top four visible rows is occupied or incoming is at least 4. Lieutenants use `panic`, the demon king uses `rage`; the owl never appears in battle HUD.

- [ ] **Step 2: Run loop/HUD tests and verify the current flattened event model fails**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.test.tsx`

Expected: FAIL because per-event ticks and portrait presentation are absent.

- [ ] **Step 3: Preserve event batches during RAF catch-up**

```ts
export interface GameEventBatch {
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly view: PublicMatchView;
}
```

Collect one batch after each `stepMatch` that emits events and attach the public view produced at that same tick. Publish both `eventBatches` and the existing flattened `events` for compatibility. Add `onEventBatches?: (batches, latestView) => void`; never label older catch-up events with only the latest view tick.

- [ ] **Step 4: Implement the pure portrait reducer**

Store absolute match-tick deadlines. Process batches in tick order and events in array order. Return a presentation object `{ state, url, alt }` with deterministic fallbacks to `idle`. Combo display reads the batch's accompanying public view snapshot rather than changing `GameEvent` payloads. On a terminal opponent win, floors 1–4 freeze on `smug` and floor 5 freezes on `rage`; an opponent loss uses `defeat`.

- [ ] **Step 5: Render fixed-size resilient portrait images**

`AssetImage` switches to an accessible CSS silhouette/name fallback on `onError`. Change `.battle-hud__header` to `display:grid; grid-template-columns:24px minmax(0,1fr) auto` and 20px under `max-height:700px`; preserve the card's prior outer height by reducing internal vertical padding/next-list margin. Add `data-portrait-state` for deterministic testing.

- [ ] **Step 6: Run portrait, loop, HUD, and responsive E2E tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/ui/match && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e -- tests/e2e/portrait-layout.spec.ts`

Expected: PASS; portrait sizes are 24/20px and player/opponent board dimensions remain exactly equal at 360×640 and 430×932.

- [ ] **Step 7: Commit tick-accurate portraits**

```powershell
git add src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/ui/match src/ui/screens/MatchScreen.tsx tests/e2e/portrait-layout.spec.ts
git commit -m "feat: add deterministic battle portraits"
```

---

### Task 5: Presentation-Only Command Feedback and Atlas Registry

**Files:**
- Modify: `src/app/use-match-loop.ts`
- Modify: `src/app/use-match-loop.test.tsx`
- Create: `src/render/battle-animation-registry.ts`
- Create: `src/render/battle-animation-registry.test.ts`
- Modify: `src/render/event-animation-queue.ts`
- Modify: `src/render/event-animation-queue.test.ts`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`
- Modify: `src/render/BoardScene.tsx`
- Modify: `src/render/pixi-elements.ts`
- Modify: `src/ui/screens/MatchScreen.tsx`

**Interfaces:**
- Consumes: `GameEventBatch`, loaded atlas textures, and scheduled `TimedCommand`s.
- Produces: `CommandFeedback`, `onCommandFeedback`, and an exact animation registry for nine atlas groups.

- [ ] **Step 1: Add failing presentation-signal tests**

```ts
expect(feedback).toEqual([
  { sequence: 0, tick: 12, side: 'player', command: { type: 'move', dx: -1 } },
  { sequence: 1, tick: 12, side: 'opponent', command: expect.any(Object) },
]);
```

Assert player-before-AI order, exact scheduled tick, one monotonic sequence, feedback for a subsequently rejected command, no callback during pause, callback exceptions swallowed, and no change to `GameEvent`, replay serialization, or match state.

- [ ] **Step 2: Add exact atlas-registry tests**

```ts
expect(BATTLE_ANIMATIONS['move-dust']).toEqual({ frames: 4, fps: 20, loop: false, sourceSize: [64, 64], anchor: [.5, 1] });
expect(BATTLE_ANIMATIONS['freeze-overlay']).toEqual({ frames: 8, fps: 12, loop: true, sourceSize: [64, 64], anchor: [0, 0] });
```

The complete registry under test is:

```ts
const BATTLE_ANIMATIONS = {
  'move-dust':      { frames: 4, fps: 20, loop: false, sourceSize: [64, 64],   anchor: [.5, 1] },
  'rotate-spark':   { frames: 5, fps: 24, loop: false, sourceSize: [64, 64],   anchor: [.5, .5] },
  'land-impact':    { frames: 5, fps: 24, loop: false, sourceSize: [128, 64],  anchor: [.5, 1] },
  'line-clear':     { frames: 6, fps: 30, loop: false, sourceSize: [640, 64],  anchor: [.5, .5] },
  'attack-shot':    { frames: 6, fps: 20, loop: true,  sourceSize: [64, 64],   anchor: [.5, .5] },
  'garbage-land':   { frames: 5, fps: 24, loop: false, sourceSize: [128, 64],  anchor: [.5, 1] },
  'item-acquire':   { frames: 8, fps: 24, loop: false, sourceSize: [128, 128], anchor: [.5, .5] },
  'freeze-overlay': { frames: 8, fps: 12, loop: true,  sourceSize: [64, 64],   anchor: [0, 0] },
  'combo-pop':      { frames: 6, fps: 24, loop: false, sourceSize: [256, 128], anchor: [.5, .5] },
} as const;
```

Validate generated frame names start at `00` and match atlas JSON counts.

- [ ] **Step 3: Run loop/render tests to verify signals and sprites are absent**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/render`

Expected: FAIL on missing feedback/registry and current fixed 140ms event timing.

- [ ] **Step 4: Emit feedback immediately before deterministic command application**

After combining queued player commands and AI commands for a tick, call `onCommandFeedback(side, command, tick)` for every scheduled command inside a try/catch, then call the unchanged `stepMatch`. The presentation resolver filters move/rotate cues; other command feedback is harmless. Maintain a presentation-only sequence in the hook; do not add IDs to core commands or state.

- [ ] **Step 5: Generalize the animation queue and Pixi effect layers**

Calculate non-loop duration as `frames / fps * 1000`; use RAF progress for every active effect. Board-local effects are move dust, rotate spark, land, line clear, garbage land, item acquire, freeze tile, and combo pop. `attack-shot` is a BattleCanvas-root sprite travelling between equal board rect centers. `freeze-overlay` loops while `model.freezeTicks > 0`, not for a 140ms FIFO slot. Extend Pixi elements with `Sprite` and `AnimatedSprite`.

- [ ] **Step 6: Preserve per-effect Graphics fallback**

If a texture/frame is missing, feed the same effect to existing `draw-primitives`; never hide a critical state. Cap decorative concurrent effects at 6 and keep critical FIFO order. The atlas path may not allocate a texture or array every 60Hz tick after load.

- [ ] **Step 7: Run loop/render tests and commit**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/render src/ui/screens/MatchScreen.test.tsx`

Expected: PASS with presentation callback failures isolated and fallback renderer intact.

```powershell
git add src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/render src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx
git commit -m "feat: render tick-aware battle effects"
```

---

### Task 6: Pixel Tile Skin and Garbage Identity

**Files:**
- Modify: `src/core/model.ts`
- Modify: `src/core/board.ts`
- Modify: `src/core/replay.ts`
- Modify: `src/core/invariants.ts`
- Modify: `src/render/draw-primitives.ts`
- Modify: `src/render/draw-primitives.test.ts`
- Modify: `src/render/BoardScene.tsx`
- Create: `src/render/board-skin.ts`
- Create: `src/render/board-skin.test.ts`
- Modify: `tests/core/board.test.ts`
- Modify: `tests/core/public-view.test.ts`
- Modify: `tests/core/replay-and-properties.test.ts`

**Interfaces:**
- Consumes: seven block textures, `garbage.png`, and three item textures.
- Produces: deterministic `Cell.garbage?: true` and `partitionBoardPrimitives(...)`.

- [ ] **Step 1: Add failing garbage identity/replay tests**

```ts
expect(garbageCells.every((cell) => cell?.garbage === true)).toBe(true);
expect(lockedOPieceCells.every((cell) => cell?.garbage !== true)).toBe(true);
expect(replay(replayLog)).toEqual(originalFinalState);
```

Add public-view sanitation, invariant, clone, row-clear, and attack insertion cases proving the marker survives deterministic transformations and never appears on normal O cells.

- [ ] **Step 2: Run core/render tests and verify garbage cannot be distinguished**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/core src/render/draw-primitives.test.ts`

Expected: FAIL because garbage is currently represented only as `{ kind:'O' }`.

- [ ] **Step 3: Add the minimal deterministic cell flag**

```ts
export interface Cell {
  readonly kind: PieceKind;
  readonly marker?: ItemMarker;
  readonly garbage?: true;
}
```

Set it only in garbage insertion. Preserve it through board clones/public views/replay and validate that it is either absent or exactly `true`. Do not alter collision, clear, scoring, AI board occupancy, or serialization order.

- [ ] **Step 4: Partition textured cells from procedural fallbacks**

`partitionBoardPrimitives(primitives, skin, width, height)` maps known loaded kind/garbage/item URLs to cached Pixi textures and leaves every unresolved primitive for `drawBoardPrimitives`. Set Pixi texture scale mode to `nearest`; scale logical 16×16 art to the computed board cell rectangle without smoothing.

- [ ] **Step 5: Run core, replay, render, and simulation smoke tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/core src/render tests/sim/aiSimulation.test.ts`

Expected: PASS with identical combat outcomes and distinct render classification for garbage.

- [ ] **Step 6: Commit the board skin seam**

```powershell
git add src/core src/render tests/core tests/sim/aiSimulation.test.ts
git commit -m "feat: support pixel board skins"
```

---

### Task 7: Screen Art, Floor Loading, and Cache Release

**Files:**
- Create: `src/assets/use-floor-assets.ts`
- Create: `src/assets/use-floor-assets.test.tsx`
- Create: `src/ui/screens/ScreenBackdrop.tsx`
- Create: `src/ui/screens/ScreenBackdrop.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/ui/match/match-layout.css`

**Interfaces:**
- Consumes: `AssetManager`, common/floor bundles, and app route/floor.
- Produces: `useFloorAssets(manager, floor)` and resilient authored backdrops/full art.

- [ ] **Step 1: Add failing load/prefetch/release tests**

```ts
expect(manager.loadFloor).toHaveBeenCalledWith(3);
expect(manager.prefetchFloor).toHaveBeenCalledWith(4);
expect(manager.releaseFloor).toHaveBeenCalledWith(2);
```

Test stale async completion after route/floor change, a rejected load retaining the procedural screen, same-floor deduplication, final floor having no floor-6 prefetch, and release only after leaving the result route.

- [ ] **Step 2: Run asset/AppRoot tests and verify no screen bundle wiring exists**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/use-floor-assets.test.tsx src/app/AppRoot.test.tsx src/ui/screens/ScreenBackdrop.test.tsx`

Expected: FAIL on missing hook/components/props.

- [ ] **Step 3: Implement non-blocking floor bundle state**

The hook begins synchronously with `null` so screens render existing UI. On ready, publish `manager.getFloorAssets(floor)` only if the request is still current. Prefetch `floor + 1` when it is a canonical floor. Schedule previous-floor release after the result screen is left; never release common assets.

- [ ] **Step 4: Apply screen art without layout ownership**

`ScreenBackdrop` uses an absolutely positioned image with `object-fit:cover; object-position:center top`, low contrast overlay, and `aria-hidden=true`. The center 70% remains readable behind boards. Tower uses `tower-exterior`; floor intro/result use the current floor background and full opponent art; ending uses hero/owl/demon-king result art. An image error removes only that image and exposes the current CSS gradient.

- [ ] **Step 5: Pass one resolved battle bundle to HUD and Canvas**

MatchScreen must not fetch. AppRoot supplies its floor bundle; MatchScreen maps the hero/opponent portrait records to BattleHud and the tile/atlas bundle to BattleCanvas. A `null` bundle means existing labels, colors, and Graphics only.

- [ ] **Step 6: Run screen, asset, and responsive tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets src/app src/ui src/render && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e -- tests/e2e/portrait-layout.spec.ts tests/e2e/app-flow.spec.ts`

Expected: PASS in both fallback and injected-authored modes; no horizontal overflow and equal board dimensions remain unchanged.

- [ ] **Step 7: Commit screen integration**

```powershell
git add src/assets src/app src/ui src/render tests/e2e
git commit -m "feat: integrate floor art with safe fallbacks"
```

---

### Task 8: Full Runtime, Build, and Apps-in-Toss Verification

**Files:**
- Modify only when a verification failure demonstrates an in-scope defect.
- Produce (ignored artifact): `te-ppu-prototype.ait`

**Interfaces:**
- Consumes: Tasks 1–7 and the completed five-floor progression plan.
- Produces: a verified fallback-capable build and, when external inputs exist, full-art/QR evidence.

- [ ] **Step 1: Verify the checked-in manifest mode and exact inventory report**

Run: `npx -y node@24.15.0 scripts/validate-assets.mjs --report`

Expected: the report explicitly says `procedural-fallback`, or in authored mode lists exactly 1 logo, 7 full art, 38 portraits, 6 backgrounds, 11 block/item PNGs, 7 SVG icons, 1 atlas pair, 8 SFX, and 5 BGM with no missing ID.

- [ ] **Step 2: Validate fallback assets and all authored-source policy gates**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:assets`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:delivery-gates`

Expected: PASS; fallback mode is explicitly reported and not mistaken for a completed art-pack/QR proof.

- [ ] **Step 3: Run complete unit/type/build/browser verification**

Run each command separately:

```powershell
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:web
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e
```

Expected: all tests, typecheck, Vite build, and Playwright scenarios PASS.

- [ ] **Step 4: Run the five-floor simulation gate**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run validate:ai`

Expected: 5,000 matches, zero rejected/capped cases, strict floor-1-to-floor-5 controlled-AI win-rate increase, and all heap limits PASS.

- [ ] **Step 5: Build and inspect the local `.ait`**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:ait`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:ait -- te-ppu-prototype.ait`

Expected: archive markers/assets are present, unpacked size is below 100 MiB, and package checks PASS.

- [ ] **Step 6: Record the external-art boundary accurately**

Run `$env:ASSETS_REQUIRED='1'; npm run check:assets` only after all approved artist files are installed; run `$env:QR_EVIDENCE='1'` only with the console-hosted HTTPS `AIT_ICON_URL`. Until then, report the game/runtime as verified in procedural-fallback mode, not as full-art or QR-approved. Clear those task-specific environment variables after the command.

- [ ] **Step 7: Commit any evidence-driven fixes and leave a clean worktree**

```powershell
git status --short
git log -12 --oneline
```

Expected: no uncommitted tracked files; the ignored `.ait` may remain as the local artifact.
