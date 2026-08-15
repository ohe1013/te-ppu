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
- `loadCommon()` and `loadFloor()` resolve `'fallback'` for explicit procedural mode, manifest transport/JSON-I/O failure or deadline, and per-ref runtime failure or deadline. Successfully decoded JSON with an invalid manifest structure rejects with one cached structural error instead; `useBoot`, `prefetchFloor()`, and Task 7 catch that rejection locally, so asset failures never block input, AI, combat, result routing, or saving.
- A `'fallback'` result does not imply that every authored ref is discarded. Before manifest validation it has a `null` getter; after a valid authored manifest it publishes a partial `CommonAssets`/`FloorAssetBundle` even when every image decode fails, because metadata/audio refs and generation remain usable. `null` is also used while unresolved, in explicit `procedural-fallback` mode, after release, and after destroy. Structural manifest rejection is never relabeled as a manager-level `'fallback'`.
- Common assets load once; only the current and next floor are retained. Rejected prefetch promises are always handled, and the first explicit floor entry after a prefetched operational-failure `'fallback'` receives exactly one manager-owned retry before using fallback presentation. A valid intentional `procedural-fallback` result is cached and never retried.
- HUD portraits render at 24×24 CSS px in a fixed three-column header and 20×20 at viewport heights at or below 700px; boards shrink only after portraits have reached those limits.
- Portrait priority is terminal > hit/freeze 25 ticks > attack/item 18 ticks > persistent danger > focus 18 ticks / smug 21 ticks > idle.
- Move/rotate feedback is presentation-only `onCommandFeedback(feedback: CommandFeedback)` and may fire for rejected commands; it must not enter `GameEvent`, match state, replay, or AI observations.
- Atlas format is TexturePacker JSON Hash, `rotated:false`, `meta.image:'battle-atlas.png'`, `meta.format:'RGBA8888'`, `meta.scale:'1'`, with the exact nine animation groups in the approved spec.
- Pixel tiles use nearest-neighbor scaling; the existing Graphics renderer remains the per-ID fallback.
- Music routes are: boot none; tower/floor intro `tower`; floors 1–2 match/result `early-floors`; floors 3–4 `late-floors`; floor 5 `demon-king`; ending `ending`.
- The same music track never restarts; track changes use a 150ms fade; background/resume countdown, mute, failed decode, and root destroy are non-fatal.
- Runtime authored assets stay under 30 MB and the unpacked `.ait` stays under 100 MB.
- A `QR_EVIDENCE=1` Apps build requires `AIT_APP_NAME`, `AIT_DISPLAY_NAME`, and a public-HTTPS-shaped `AIT_ICON_URL` intended to be the console-hosted copy of the same 600×600 opaque PNG. Automation validates syntax/config only; reachability, console ownership, upload status, and byte equality remain external evidence. Env-less builds use local metadata and are local-browser/package evidence only.
- Execute in this exact order: Runtime Tasks 1–7, every task in `2026-08-03-identity-aware-progress.md`, then Runtime Task 8. Task 8 is the only identity-inclusive final `.ait` build and evidence-classification gate.
- Final AI verification follows the 2026-08-03 user-requested execution override: Task 8 runs the focused 50-test simulation regressions plus a fresh 500-match filtered smoke, not the default unfiltered 5,000-match command. The fresh smoke is not a canonical 5,000-match PASS; ordering and long-memory claims refer only to retained hardened evidence from the five-floor progression plan's Task 6.

---

### Task 1: Typed Manifest and Coalescing Asset Manager

**Files:**
- Create: `src/assets/types.ts`
- Create: `src/assets/manifest.ts`
- Create: `src/assets/asset-manager.ts`
- Create: `src/assets/index.ts`
- Create: `src/assets/asset-manager.test.ts`
- Create: `src/assets/test-fixtures/complete-manifest.ts`
- Create: `src/app/app-services.test.ts`
- Create: `public/assets/manifest.json`
- Modify: `src/platform/audio-port.ts`
- Modify: `src/app/app-services.ts`
- Modify: `src/app/use-boot.ts`
- Modify: `src/app/use-boot.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`

**Interfaces:**
- Consumes: canonical `Floor`, `PieceKind`, and `ItemType`, plus the existing `SoundCue` from `src/platform/audio-port.ts`.
- Produces: `MusicTrack` in `src/platform/audio-port.ts`; exact `AssetManifestV1`, validated `ManifestRef`, `ResolvedAudioRef`, `LoadedImageRef`, `AtlasData`, `CommonAssets`, `FloorAssetBundle`, `AssetManager`, `AssetLoadScheduler`, `CreateAssetManagerOptions`, `GAME_ASSET_PATH = '/assets/manifest.json'`, `parseAssetManifest(value: unknown): AssetManifestV1`, and `createAssetManager(options: CreateAssetManagerOptions): AssetManager`. Task 3 adds music behavior to the audio port; it imports this Task 1 type instead of redefining it.

- [ ] **Step 1: Write failing parser and manager behavior tests**

```ts
it('coalesces common and per-floor loads and resolves URLs only in the manager', async () => {
  const fetchManifest = vi.fn().mockResolvedValue(COMPLETE_ASSET_MANIFEST);
  const loadImage = vi.fn().mockImplementation(async () =>
    ({ close: vi.fn() }) as unknown as ImageBitmap);
  const loadAtlasJson = vi.fn().mockResolvedValue({
    frames: {},
    meta: {
      image: 'battle-atlas.png',
      format: 'RGBA8888',
      scale: '1',
      size: { w: 1, h: 1 },
    },
  });
  const manager = createAssetManager({ fetchManifest, loadImage, loadAtlasJson });

  const commonA = manager.loadCommon();
  const commonB = manager.loadCommon();
  expect(commonA).toBe(commonB);
  await expect(Promise.all([commonA, commonB]))
    .resolves.toEqual(['ready', 'ready']);
  const floorA = manager.loadFloor(2);
  const floorB = manager.loadFloor(2);
  expect(floorA).toBe(floorB);
  await expect(Promise.all([floorA, floorB]))
    .resolves.toEqual(['ready', 'ready']);

  expect(fetchManifest).toHaveBeenCalledWith('/assets/manifest.json');
  expect(fetchManifest).toHaveBeenCalledTimes(1);
  expect(loadAtlasJson).toHaveBeenCalledWith('/assets/effects/battle-atlas.json');
  expect(loadImage).toHaveBeenCalledWith('/assets/effects/battle-atlas.png');
  expect(loadImage.mock.calls.every(([url]) =>
    typeof url === 'string' && url.startsWith('/assets/'))).toBe(true);
});
```

Import the runtime under test from `src/assets/index.ts` in `asset-manager.test.ts`; only the explicit fixture may use its test-fixture path. Add parser tables for missing/extra keys and malformed or unknown IDs. For every `ManifestRef.path`, reject `/absolute.png`, `C:/absolute.png`, `blocks\\tile-i.png`, `./blocks/tile-i.png`, `../tile-i.png`, `blocks/../tile-i.png`, `blocks/tile_i.png`, `blocks/tile-i.png?x=1`, `blocks/tile-i.png#x`, `blocks/TILE-I.png`, and `blocks/타일-i.png` before any loader sees a URL. Assert accepted paths match Task 2's exact `^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$` expression.

Test the load-result taxonomy directly. Explicit `procedural-fallback`, manifest fetch/JSON-I/O synchronous throw or rejection, and manifest I/O timeout resolve `'fallback'`; without validated authored metadata their getters are `null`. A successfully returned JSON value with an invalid manifest shape/path rejects instead. Call `loadCommon()` once and observe that structural rejection, then call it again; assert the second call is the exact same cached rejected promise/error and `fetchManifest` ran once. In a separate manifest-I/O case, reject the first cached fetch and then succeed: prove the exact rejected promise is removed, the next eligible floor-entry retry calls `fetchManifest` a second time, and the authored attempt can become ready. `useBoot` and `prefetchFloor()` catch structural rejection without an unhandled promise; Task 7 adds the equivalent hook boundary.

For authored data, test one image rejection returning `'fallback'` while publishing other refs and all image rejections retaining a non-null metadata/audio-only `CommonAssets`. Assert `common.audio.bgm.tower` equals `{ ref: { path: 'audio/bgm/tower.mp3' }, url: '/assets/audio/bgm/tower.mp3', generation }`, every `SoundCue`/`MusicTrack` key is present, and neither image nor atlas loaders receive MP3 URLs. Repeat mixed/all-image failure for `FloorAssetBundle`, retaining floor/opponent/music/generation with optional images absent and partial portraits empty. Make each injected seam throw synchronously in its own test: `fetchManifest` is manifest-I/O fallback, `loadImage` is per-image fallback, and `loadAtlasJson` is per-atlas fallback.

Exercise atlas JSON with `null`, an array, extra envelope/nested keys, wrong literal metadata, non-boolean flags, negative/fractional/non-finite geometry, zero dimensions, out-of-bounds rectangles, `frame.w/h !== spriteSourceSize.w/h`, and `trimmed:false` with nonzero source offsets or non-full frame/source dimensions. Each is per-ref fallback, never partially trusted `AtlasData`. Cover both late-orphan orders: JSON rejects before a deferred closeable image resolves, and the image resolves while JSON remains pending past the deadline. Neither publishes an atlas; the image closes exactly once when it becomes orphaned.

Use `vi.useFakeTimers()` and `loadTimeoutMs: 5` for deterministic absolute-deadline tests. Start the common load at `t=0`, resolve the manifest at `t=3`, start parallel refs, and prove the same single timer seals them at total `t=5`, not `t=8`; a late closeable completion cannot publish and closes once. Repeat for a floor to prove each coalesced attempt owns one deadline while duplicate callers share its exact promise/timer. A prefetch and its later entry retry are two distinct coalesced attempts: assert the retry receives one fresh absolute timer starting at retry creation, not the prefetch's expired timer. Prove natural completion clears its attempt timer. Add a scheduler-spy assertion that omitting the override schedules `5_000`ms. Constructing a manager with `loadTimeoutMs` equal to `NaN`, `Infinity`, `-Infinity`, or a negative finite number throws synchronously; `0` is valid and produces an immediate attempt deadline.

Add settled and pending prefetch-entry retry tests. For a settled prefetched operational `'fallback'`, capture its partial bundle/generation, then call `loadFloor(floor)` twice: both calls return the exact same entry-retry promise, the old bundle is removed and its sources close once, the generation increases, and exactly one fresh attempt starts. For a still-pending prefetch, two explicit calls share one wrapper that awaits the prefetch; `'ready'` reuses it, while only an operational `'fallback'` starts exactly one retry. If the retry also returns `'fallback'`, a later third call returns the cached final promise/bundle and performs no third attempt. Late first-attempt completions close and cannot replace the retry generation. Structural rejection propagates through the wrapper for Task 7 to catch and never triggers a retry. A prefetched valid `procedural-fallback` is instead reused as the intentional cached fallback, with no retry attempt, generation change, fresh timer, or additional I/O.

Distinguish manifest-cache lifetime from floor-attempt lifetime. Leave the manifest promise pending past the prefetch attempt's deadline, then explicitly enter that floor: the entry wrapper starts one retry with its fresh timer but reuses the still-pending manifest promise, so `fetchManifest` remains at one call. Resolve that manifest during the retry window and prove the retry can become ready. Contrast this with the rejected-manifest case above, which refetches because only the exact I/O-rejected manifest promise was evicted.

Capture already-returned operational promises before cancellation. `releaseFloor(floor)` must make the original pending floor promise and any pending entry wrapper resolve `'fallback'`; prove it clears only timers owned by that floor's records while a common attempt and another floor's timer remain scheduled. `destroy()` must do the same for original common/floor/wrapper promises. Call `destroy()` twice and assert promises settle once, every source closes once, and the second call creates no timer, state, or I/O. Then assert null getters, all remaining timers cleared, no new I/O after destroy, and one close for every late closeable completion. Treat generation increments on destroy as an internal invariant; black-box tests prove sealing, non-publication, closure, and no restart. Floor release/retry generation change remains observable through old/new bundle generations. Test stale cleanup with promise identity so old `finally` handlers cannot delete newer records. For each of `loadFloor`, `prefetchFloor`, `releaseFloor`, and `getFloorAssets`, pass invalid floor values before and after destroy and assert the same synchronous `RangeError` occurs before any state mutation or destroyed-manager no-op.

In `use-boot.test.tsx`, make one manager throw synchronously and another return the cached structural rejection; both are caught locally as asset fallback while identity/progress still reach ready. Never-settling I/O belongs in manager tests because the manager's deadline, not `useBoot`, guarantees settlement.

In `AppRoot.test.tsx`, extend the central service fixture with a complete manager stub. With fake timers and separate `<StrictMode>` roots, prove a true unmount/remount using the same manager cancels its 300ms finalizer, different managers never cancel each other, stale callbacks cannot delete a newer registry entry, and final expiry calls each manager's `destroy()` once. Restore real timers and do not add route-driven floor expectations.

Create `src/app/app-services.test.ts` for the non-overridden production boundary. Stub `fetch` and `Image` to prove `/assets/manifest.json` and `/assets/effects/battle-atlas.json` require successful HTTP plus `json()`, every manager-resolved image URL is assigned to `image.src` and awaited through `decode()`, and the atlas URL is fetched only by the JSON seam. Manifest HTTP or `response.json()` rejection must resolve fallback with a null common getter; atlas HTTP/JSON rejection and image `decode()` rejection must produce per-ref partial fallback. Also pass an `assetManager` override and assert `createAppServices` returns that exact instance without touching `fetch` or `Image`.

Import one explicit `COMPLETE_ASSET_MANIFEST` literal from `src/assets/test-fixtures/complete-manifest.ts`. This type-checked literal is the canonical full authored JSON fixture: assert `JSON.parse(JSON.stringify(COMPLETE_ASSET_MANIFEST))` deep-equals the literal so it contains only JSON values and survives serialization unchanged. It lists every logo, common character/full-art/portrait, floor/background/opponent portrait, tile, item, icon, atlas, SFX, and BGM ref shown in Step 3; do not construct it with loops, spreads, defaults, or merge helpers, because missing exact keys must be visible to parser tests and review.

- [ ] **Step 2: Run the new tests and verify imports are missing**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/asset-manager.test.ts src/app/app-services.test.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx`

Expected: FAIL because the asset contract, manager service/production adapters, boot dependency, and root finalizer do not exist.

- [ ] **Step 3: Define the complete manifest types**

```ts
// src/platform/audio-port.ts: add beside the existing SoundCue and AudioPort exports.
export type MusicTrack =
  | 'tower'
  | 'early-floors'
  | 'late-floors'
  | 'demon-king'
  | 'ending';

// src/assets/types.ts
import type { ItemType, PieceKind } from '../core';
import type { MusicTrack, SoundCue } from '../platform/audio-port';
import type { Floor } from '../progression';

export type CharacterId =
  | 'hero-engineer' | 'owl-companion' | 'quartermaster' | 'alchemist'
  | 'guard-captain' | 'dark-engineer' | 'demon-king';

export type PortraitState =
  | 'idle' | 'focus' | 'attack' | 'hit' | 'win' | 'loss'
  | 'panic' | 'smug' | 'defeat' | 'rage' | 'worry' | 'cheer';

export interface ManifestRef {
  readonly path: string;
}

export type HeroPortraitState =
  | 'idle' | 'focus' | 'attack' | 'hit' | 'win' | 'loss';
export type LieutenantPortraitState =
  | 'idle' | 'smug' | 'attack' | 'hit' | 'panic' | 'defeat';
export type DemonKingPortraitState =
  | 'idle' | 'attack' | 'hit' | 'rage' | 'defeat';
export type OwlPortraitState = 'idle' | 'worry' | 'cheer';
export type UiIconId =
  | 'rotate' | 'settings' | 'sound-on' | 'sound-off'
  | 'haptics-on' | 'haptics-off' | 'exit';

type HeroPortraits = Readonly<Record<HeroPortraitState, ManifestRef>>;
type LieutenantPortraits = Readonly<Record<LieutenantPortraitState, ManifestRef>>;
type DemonKingPortraits = Readonly<Record<DemonKingPortraitState, ManifestRef>>;
type OwlPortraits = Readonly<Record<OwlPortraitState, ManifestRef>>;

interface CharacterManifest<P extends object> {
  readonly fullArt: ManifestRef;
  readonly portraits: P;
}

interface AuthoredAssetManifestV1 {
  readonly schemaVersion: 1;
  readonly mode: 'assets';
  readonly brand: { readonly logo: ManifestRef };
  readonly common: {
    readonly backgrounds: { readonly tower: ManifestRef };
    readonly characters: {
      readonly 'hero-engineer': CharacterManifest<HeroPortraits>;
      readonly 'owl-companion': CharacterManifest<OwlPortraits>;
    };
    readonly tiles: Readonly<Record<PieceKind | 'garbage', ManifestRef>>;
    readonly items: Readonly<Record<ItemType, ManifestRef>>;
    readonly icons: Readonly<Record<UiIconId, ManifestRef>>;
    readonly atlas: { readonly image: ManifestRef; readonly data: ManifestRef };
    readonly audio: {
      readonly sfx: Readonly<Record<SoundCue, ManifestRef>>;
      readonly bgm: Readonly<Record<MusicTrack, ManifestRef>>;
    };
  };
  readonly floors: {
    readonly '1': {
      readonly opponent: 'quartermaster';
      readonly background: ManifestRef;
      readonly music: 'early-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '2': {
      readonly opponent: 'alchemist';
      readonly background: ManifestRef;
      readonly music: 'early-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '3': {
      readonly opponent: 'guard-captain';
      readonly background: ManifestRef;
      readonly music: 'late-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '4': {
      readonly opponent: 'dark-engineer';
      readonly background: ManifestRef;
      readonly music: 'late-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '5': {
      readonly opponent: 'demon-king';
      readonly background: ManifestRef;
      readonly music: 'demon-king';
      readonly character: CharacterManifest<DemonKingPortraits>;
    };
  };
}

export type AssetManifestV1 =
  | { readonly schemaVersion: 1; readonly mode: 'procedural-fallback' }
  | AuthoredAssetManifestV1;

export interface LoadedImageRef {
  readonly ref: ManifestRef;
  readonly url: string;
  readonly source: ImageBitmap | HTMLImageElement;
  readonly generation: number;
}

export interface ResolvedAudioRef {
  readonly ref: ManifestRef;
  readonly url: string;
  readonly generation: number;
}

export interface TexturePackerFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly rotated: false;
  readonly trimmed: boolean;
  readonly spriteSourceSize: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly sourceSize: { readonly w: number; readonly h: number };
}

export interface TexturePackerAtlasJson {
  readonly frames: Readonly<Record<string, TexturePackerFrame>>;
  readonly meta: {
    readonly image: 'battle-atlas.png';
    readonly format: 'RGBA8888';
    readonly scale: '1';
    readonly size: { readonly w: number; readonly h: number };
  };
}

export interface AtlasData {
  readonly image: LoadedImageRef;
  readonly json: TexturePackerAtlasJson;
  readonly generation: number;
}

export interface CommonAssets {
  readonly generation: number;
  readonly logo?: LoadedImageRef;
  readonly towerBackdrop?: LoadedImageRef;
  readonly hero: {
    readonly fullArt?: LoadedImageRef;
    readonly portraits: Partial<Record<HeroPortraitState, LoadedImageRef>>;
  };
  readonly owl: {
    readonly fullArt?: LoadedImageRef;
    readonly portraits: Partial<Record<OwlPortraitState, LoadedImageRef>>;
  };
  readonly tiles: Partial<Record<PieceKind | 'garbage', LoadedImageRef>>;
  readonly items: Partial<Record<ItemType, LoadedImageRef>>;
  readonly icons: Partial<Record<UiIconId, LoadedImageRef>>;
  readonly atlas?: AtlasData;
  readonly audio: {
    readonly sfx: Readonly<Record<SoundCue, ResolvedAudioRef>>;
    readonly bgm: Readonly<Record<MusicTrack, ResolvedAudioRef>>;
  };
}

export type FloorOpponentId =
  | 'quartermaster' | 'alchemist' | 'guard-captain'
  | 'dark-engineer' | 'demon-king';

export interface FloorAssetBundle {
  readonly floor: Floor;
  readonly opponent: FloorOpponentId;
  readonly music: MusicTrack;
  readonly generation: number;
  readonly background?: LoadedImageRef;
  readonly fullArt?: LoadedImageRef;
  readonly portraits: Partial<Record<PortraitState, LoadedImageRef>>;
}

export interface AssetManager {
  loadCommon(): Promise<'ready' | 'fallback'>;
  loadFloor(floor: Floor): Promise<'ready' | 'fallback'>;
  prefetchFloor(floor: Floor): void;
  releaseFloor(floor: Floor): void;
  getCommonAssets(): CommonAssets | null;
  getFloorAssets(floor: Floor): FloorAssetBundle | null;
  destroy(): void;
}

export interface AssetLoadScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CreateAssetManagerOptions {
  readonly fetchManifest: (url: string) => Promise<unknown>;
  readonly loadImage: (url: string) => Promise<ImageBitmap | HTMLImageElement>;
  readonly loadAtlasJson: (url: string) => Promise<unknown>;
  readonly loadTimeoutMs?: number;
  readonly scheduler?: AssetLoadScheduler;
}
```

`src/assets/manifest.ts` owns and exports the concrete `parseAssetManifest(value: unknown): AssetManifestV1` implementation. `src/assets/asset-manager.ts` owns the path constant and the concrete `createAssetManager(options: CreateAssetManagerOptions): AssetManager` implementation:

```ts
// src/assets/asset-manager.ts
export const GAME_ASSET_PATH = '/assets/manifest.json' as const;
```

`src/assets/index.ts` is the only public import seam used by consumers and tests:

```ts
// src/assets/index.ts
export * from './types';
export { parseAssetManifest } from './manifest';
export { GAME_ASSET_PATH, createAssetManager } from './asset-manager';
```

Do not place declaration-only function signatures in `types.ts`; both functions above are implemented in their owning `.ts` modules in Step 4 and re-exported through `index.ts`.

`TexturePackerAtlasJson` is the structural JSON contract consumed by Task 2's validator; it contains frame rectangles/source sizes and `meta`, never FPS/loop/anchor policy. The public runtime bundles are exactly `CommonAssets` and `FloorAssetBundle`. `CommonAssets` always carries its generation, empty-capable `hero`/`owl` containers, partial tile/item/icon maps, and complete manager-produced SFX/BGM `ResolvedAudioRef` catalogs, while every loaded image field and `AtlasData` is optional. `FloorAssetBundle` always carries floor/opponent/music/generation and partial portraits, while background/full art are optional. The manifest is all-or-nothing structurally, but runtime I/O failures become missing image refs inside an otherwise usable authored bundle whenever manifest metadata was validated.

`ManifestRef` remains inert raw metadata. Only the manager constructs `/assets/${path}` and passes those resolved URL strings to `loadImage`/`loadAtlasJson`; components, the parser, and Task 3's audio port never construct asset URLs. The audio port borrows complete resolved catalogs and owns fetches, decoded `AudioBuffer`s, gain/source nodes, and their cleanup; the asset manager never fetches MP3s or owns audio decode resources.

The complete fixture is this explicit literal (paths are relative to `/assets/`):

```ts
export const COMPLETE_ASSET_MANIFEST = {
  schemaVersion: 1,
  mode: 'assets',
  brand: { logo: { path: 'brand/app-logo.png' } },
  common: {
    backgrounds: { tower: { path: 'backgrounds/tower-exterior.webp' } },
    characters: {
      'hero-engineer': {
        fullArt: { path: 'characters/hero-engineer/full.webp' },
        portraits: {
          idle: { path: 'characters/hero-engineer/portrait-idle.webp' },
          focus: { path: 'characters/hero-engineer/portrait-focus.webp' },
          attack: { path: 'characters/hero-engineer/portrait-attack.webp' },
          hit: { path: 'characters/hero-engineer/portrait-hit.webp' },
          win: { path: 'characters/hero-engineer/portrait-win.webp' },
          loss: { path: 'characters/hero-engineer/portrait-loss.webp' },
        },
      },
      'owl-companion': {
        fullArt: { path: 'characters/owl-companion/full.webp' },
        portraits: {
          idle: { path: 'characters/owl-companion/portrait-idle.webp' },
          worry: { path: 'characters/owl-companion/portrait-worry.webp' },
          cheer: { path: 'characters/owl-companion/portrait-cheer.webp' },
        },
      },
    },
    tiles: {
      I: { path: 'blocks/tile-i.png' }, J: { path: 'blocks/tile-j.png' },
      L: { path: 'blocks/tile-l.png' }, O: { path: 'blocks/tile-o.png' },
      S: { path: 'blocks/tile-s.png' }, T: { path: 'blocks/tile-t.png' },
      Z: { path: 'blocks/tile-z.png' }, garbage: { path: 'blocks/garbage.png' },
    },
    items: {
      'row-clear': { path: 'items/row-clear.png' },
      freeze: { path: 'items/freeze.png' },
      'queue-swap': { path: 'items/queue-swap.png' },
    },
    icons: {
      rotate: { path: 'ui/rotate.svg' },
      settings: { path: 'ui/settings.svg' },
      'sound-on': { path: 'ui/sound-on.svg' },
      'sound-off': { path: 'ui/sound-off.svg' },
      'haptics-on': { path: 'ui/haptics-on.svg' },
      'haptics-off': { path: 'ui/haptics-off.svg' },
      exit: { path: 'ui/exit.svg' },
    },
    atlas: {
      image: { path: 'effects/battle-atlas.png' },
      data: { path: 'effects/battle-atlas.json' },
    },
    audio: {
      sfx: {
        move: { path: 'audio/sfx/move.mp3' },
        rotate: { path: 'audio/sfx/rotate.mp3' },
        land: { path: 'audio/sfx/land.mp3' },
        clear: { path: 'audio/sfx/clear.mp3' },
        attack: { path: 'audio/sfx/attack.mp3' },
        item: { path: 'audio/sfx/item.mp3' },
        win: { path: 'audio/sfx/win.mp3' },
        loss: { path: 'audio/sfx/loss.mp3' },
      },
      bgm: {
        tower: { path: 'audio/bgm/tower.mp3' },
        'early-floors': { path: 'audio/bgm/early-floors.mp3' },
        'late-floors': { path: 'audio/bgm/late-floors.mp3' },
        'demon-king': { path: 'audio/bgm/demon-king.mp3' },
        ending: { path: 'audio/bgm/ending.mp3' },
      },
    },
  },
  floors: {
    '1': {
      opponent: 'quartermaster', music: 'early-floors',
      background: { path: 'backgrounds/floor-01.webp' },
      character: {
        fullArt: { path: 'characters/quartermaster/full.webp' },
        portraits: {
          idle: { path: 'characters/quartermaster/portrait-idle.webp' },
          smug: { path: 'characters/quartermaster/portrait-smug.webp' },
          attack: { path: 'characters/quartermaster/portrait-attack.webp' },
          hit: { path: 'characters/quartermaster/portrait-hit.webp' },
          panic: { path: 'characters/quartermaster/portrait-panic.webp' },
          defeat: { path: 'characters/quartermaster/portrait-defeat.webp' },
        },
      },
    },
    '2': {
      opponent: 'alchemist', music: 'early-floors',
      background: { path: 'backgrounds/floor-02.webp' },
      character: {
        fullArt: { path: 'characters/alchemist/full.webp' },
        portraits: {
          idle: { path: 'characters/alchemist/portrait-idle.webp' },
          smug: { path: 'characters/alchemist/portrait-smug.webp' },
          attack: { path: 'characters/alchemist/portrait-attack.webp' },
          hit: { path: 'characters/alchemist/portrait-hit.webp' },
          panic: { path: 'characters/alchemist/portrait-panic.webp' },
          defeat: { path: 'characters/alchemist/portrait-defeat.webp' },
        },
      },
    },
    '3': {
      opponent: 'guard-captain', music: 'late-floors',
      background: { path: 'backgrounds/floor-03.webp' },
      character: {
        fullArt: { path: 'characters/guard-captain/full.webp' },
        portraits: {
          idle: { path: 'characters/guard-captain/portrait-idle.webp' },
          smug: { path: 'characters/guard-captain/portrait-smug.webp' },
          attack: { path: 'characters/guard-captain/portrait-attack.webp' },
          hit: { path: 'characters/guard-captain/portrait-hit.webp' },
          panic: { path: 'characters/guard-captain/portrait-panic.webp' },
          defeat: { path: 'characters/guard-captain/portrait-defeat.webp' },
        },
      },
    },
    '4': {
      opponent: 'dark-engineer', music: 'late-floors',
      background: { path: 'backgrounds/floor-04.webp' },
      character: {
        fullArt: { path: 'characters/dark-engineer/full.webp' },
        portraits: {
          idle: { path: 'characters/dark-engineer/portrait-idle.webp' },
          smug: { path: 'characters/dark-engineer/portrait-smug.webp' },
          attack: { path: 'characters/dark-engineer/portrait-attack.webp' },
          hit: { path: 'characters/dark-engineer/portrait-hit.webp' },
          panic: { path: 'characters/dark-engineer/portrait-panic.webp' },
          defeat: { path: 'characters/dark-engineer/portrait-defeat.webp' },
        },
      },
    },
    '5': {
      opponent: 'demon-king', music: 'demon-king',
      background: { path: 'backgrounds/floor-05.webp' },
      character: {
        fullArt: { path: 'characters/demon-king/full.webp' },
        portraits: {
          idle: { path: 'characters/demon-king/portrait-idle.webp' },
          attack: { path: 'characters/demon-king/portrait-attack.webp' },
          hit: { path: 'characters/demon-king/portrait-hit.webp' },
          rage: { path: 'characters/demon-king/portrait-rage.webp' },
          defeat: { path: 'characters/demon-king/portrait-defeat.webp' },
        },
      },
    },
  },
} as const satisfies AssetManifestV1;
```

- [ ] **Step 4: Implement a strict manifest parser and load promise maps**

Implement `parseAssetManifest(value: unknown): AssetManifestV1` in `manifest.ts`. It accepts only the two exact manifest shapes, rejects extra keys at every level, and validates every `{ path }` with the same runtime expression Task 2 uses:

```ts
const RUNTIME_ASSET_PATH =
  /^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$/;
```

Before URL construction, also explicitly reject absolute/rooted paths, `\\`, `_`, empty/`.`/`..` path segments (including embedded traversal), `?`, `#`, and every non-ASCII code point. The regex is case-sensitive. The parser returns inert `ManifestRef` metadata and never constructs a URL or stores a DOM/Pixi/Web-Audio object. Task 2 re-parses this manifest and validates referenced file existence and binary/SVG/atlas formats; Task 1 does not substitute runtime shape checks for those delivery checks.

Only `asset-manager.ts` prefixes validated refs with `/assets/`. Call `fetchManifest(GAME_ASSET_PATH)`, `loadImage(resolvedUrl)`, and `loadAtlasJson(resolvedUrl)` with URL strings; never pass a `ManifestRef` to an I/O seam. Normalize each injected call separately through `Promise.resolve().then(...)`. A synchronous or asynchronous manifest acquisition/JSON-I/O error is operational fallback; a successfully returned value that `parseAssetManifest` rejects is a structural error. A synchronous/asynchronous image or atlas-JSON error affects only that ref.

Validate unknown atlas JSON before pairing it with the image as `AtlasData`: reject arrays/null and extra keys at every level; require a plain `frames` object and exact frame keys; require `rotated === false`, boolean `trimmed`, finite nonnegative integer positions, positive integer dimensions, and atlas-frame containment; require `frame.w === spriteSourceSize.w` and `frame.h === spriteSourceSize.h`, then check `spriteSourceSize.x + frame.w <= sourceSize.w` and `spriteSourceSize.y + frame.h <= sourceSize.h`; and when `trimmed === false`, require `spriteSourceSize.x/y === 0` plus frame, sprite-source, and full-source dimensions to be equal. Require exact `meta.image`/`format`/`scale` literals and positive-integer `meta.size`. Empty `frames` is structurally valid in Task 1 seams; Task 2 revalidates exact names/groups/counts and binary bounds. If either atlas half fails, times out, releases, or destroys before a pair is published, close any present or later closeable image half once. Without fetching audio, map every valid SFX/BGM ref to `ResolvedAudioRef { ref, url, generation }`.

Cache at most one manifest promise. Tag manifest acquisition errors separately from `parseAssetManifest` errors: remove an I/O-rejected promise only if it is still the cached identity, allowing a later attempt to refetch; retain the successfully fetched but structurally rejected promise/error so every later caller rejects identically without another fetch. An attempt deadline does not evict a still-pending manifest promise: a later attempt reuses that exact promise under its own fresh deadline. Valid procedural mode is cached and resolves operational attempts as an intentional, non-retryable `'fallback'`.

Each common/floor attempt owns a manager-created deferred result, one absolute timer, captured generation, accumulated successes, and a seal operation. `loadTimeoutMs` defaults to exactly `5_000`; manager construction throws a synchronous `RangeError` for a non-finite or negative override, while `0` is an allowed immediate deadline. Start the timer before awaiting the manifest. Manifest resolution at `t=3` therefore leaves only 2ms for refs under a 5ms deadline; never start a second per-ref deadline. Natural completion, timeout, release, or destroy seals once, clears that attempt's timer, and settles the already-returned operational promise. Timeout publishes the current authored snapshot when metadata is valid and resolves `'fallback'`; manifest I/O fallback has no bundle. Structural manifest errors reject unless an earlier release/destroy seal already settled that operational promise.

Every continuation checks the attempt's open flag, numeric generation, and exact owning promise identity. After timeout/release/destroy it cannot publish. Detect closeability through a callable `close` property rather than `instanceof ImageBitmap`; close each source once and drop non-closeable elements. Atlas pairing has the same late-orphan rule. A fully successful current attempt resolves `'ready'`; any operational loss resolves `'fallback'`, preserving a valid partial authored bundle. Cleanup compares identities so an old `finally` cannot remove a newer record.

Track each floor record internally as `origin: 'entry' | 'prefetch' | 'entry-retry'`, its generation, attempt promise, public promise, status, sources, `fallbackKind: 'none' | 'procedural' | 'operational'`, and whether its one entry retry was consumed. This internal reason does not widen the public `LoadResult`. `prefetchFloor()` starts an internal `'prefetch'` attempt instead of calling public `loadFloor()`, and immediately attaches `.catch(() => undefined)` so cached structural rejection is handled. An ordinary explicit load with no prefetch starts `'entry'` and coalesces normally; it receives no automatic retry.

When explicit entry finds a pending prefetched record, create or reuse one manager-owned wrapper keyed by floor, prefetch promise identity, and generation. All explicit callers return that exact wrapper while it is pending. If prefetch resolves `'ready'`, reuse its bundle with no retry. If it resolves an intentional procedural `'fallback'`, reuse that cached result with no retry, generation change, new timer, or I/O. Only if it resolves with `fallbackKind: 'operational'` atomically mark the retry consumed, verify record identity/generation, seal and close the old partial record, increment the floor generation, and install exactly one fresh `'entry-retry'` attempt with its own absolute timer; keep the wrapper as the public cached promise while it awaits that attempt. A settled procedural prefetch may return its existing public promise directly; a settled operational prefetch creates/reuses the same entry-retry wrapper. Cache the retry's final `'ready'` or `'fallback'` normally, so later calls cannot create a third attempt. A structural rejection propagates through the wrapper for Task 7 to catch and never triggers retry. Late prefetch completions fail the generation/identity checks and close once.

Guard every floor-taking method with canonical `isFloor` and throw one consistent synchronous `RangeError` before touching state, including before the post-destroy no-op branch. `releaseFloor(floor)` seals the current attempt and entry wrapper as `'fallback'`, clears only timers owned by that floor's records, increments that floor's internal generation, removes identity-matching records/bundles, closes current and late sources, and leaves common, manifest, and other-floor state/timers alone. `destroy()` similarly settles every already-returned pending operational/common/floor/wrapper promise as `'fallback'`, clears all timers/state/catalogs, advances generations internally, closes sources once, and is idempotent. After destroy, getters return `null`, loads resolve `'fallback'` without I/O, and valid prefetch/release calls are no-ops. Verify these effects through public promises/getters/loader calls/source closure rather than inspecting private counters. Task 5 owns Pixi wrappers; Task 7 exclusively owns route retention and catches `loadFloor` rejection.

- [ ] **Step 5: Wire the manager into services and boot without blocking gameplay**

Add `assetManager` to `AppServices` and optional overrides. In `app-services.ts`, supply the required production loaders explicitly: JSON loaders require an HTTP-success response and return `response.json()` as unknown; the image loader creates one `Image`, assigns the manager-resolved URL, and awaits `decode()`. HTTP/JSON failure through `fetchManifest` is manifest-I/O fallback, the same failure through `loadAtlasJson` is per-atlas fallback, and image decode failure is per-image fallback. Hung requests/decodes remain bounded by the manager deadline.

```ts
async function fetchAssetJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Asset request failed with status ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function loadAssetImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

const assetManager = overrides.assetManager ?? createAssetManager({
  fetchManifest: fetchAssetJson,
  loadImage: loadAssetImage,
  loadAtlasJson: fetchAssetJson,
});
```

Construct that default exactly once per `createAppServices` call and return it on the service object. Boot/root tests inject complete manager stubs; `app-services.test.ts` alone exercises the production browser adapters. In `useBoot`, add the asset work to the existing `Promise.all`, but create it through a microtask and catch it locally so both a synchronous throw and the manager's cached structural rejection become app-level asset fallback rather than a blocked/retryable boot state:

```ts
const assetLoad = Promise.resolve()
  .then(() => assetManager.loadCommon())
  .catch((): 'fallback' => 'fallback');

const [, identity, loadResult] = await Promise.all([
  platform.lockPortrait(),
  platform.getIdentity(),
  progressRepository.load(),
  assetLoad,
]);
```

Make the Step 1 boot/root tests pass by extending the central service factories, preserving the existing boot concurrency assertion, and keeping AppRoot able to reach the tower after fallback. The manager's deadline already converts never-settling loader I/O to fallback, so `useBoot` needs no second timeout.

Task 1 gives `AppRoot` exactly one asset lifecycle responsibility: delayed final destruction. Use one module-level `WeakMap<AssetManager, { handle: ReturnType<typeof setTimeout>; token: object }>` rather than a component-local ref, so finalizer state survives a true root instance unmount. Mount cancels/deletes only the matching manager's entry. Cleanup installs one 300ms entry; its callback checks the same entry/token identity before deleting and calling `assetManager.destroy()`, so an old callback cannot destroy after a newer remount/cleanup. Different managers have independent entries. Do not call `loadFloor`, `prefetchFloor`, or `releaseFloor` from AppRoot or any route effect in Task 1; Task 7 exclusively wires current/next-floor retention, prefetch, and release. Task 1 tests the manager's `releaseFloor()` method directly. Start with this exact checked-in fallback manifest:

```json
{
  "schemaVersion": 1,
  "mode": "procedural-fallback"
}
```

- [ ] **Step 6: Run asset, boot, and root lifecycle tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/asset-manager.test.ts src/app/app-services.test.ts src/app/use-boot.test.tsx src/app/AppRoot.test.tsx`

Expected: PASS with strict path/parser coverage, one bounded entry retry after a prefetched operational fallback, intentional procedural mode remaining non-retryable, original canceled promises settling, one shared 5ms absolute deadline per coalesced attempt, late closeable results disposed without publication, production browser-loader wiring covered, no intentional fallback-mode 404 request, partial authored bundles retained, AppRoot reaching the tower after asset fallback, and StrictMode preserving then finally destroying each manager.

- [ ] **Step 7: Commit the asset boundary**

```powershell
git add -- src/platform/audio-port.ts src/assets/types.ts src/assets/manifest.ts src/assets/asset-manager.ts src/assets/index.ts src/assets/asset-manager.test.ts src/assets/test-fixtures/complete-manifest.ts public/assets/manifest.json src/app/app-services.ts src/app/app-services.test.ts src/app/use-boot.ts src/app/use-boot.test.tsx src/app/AppRoot.tsx src/app/AppRoot.test.tsx
git commit -m "feat: add non-blocking asset manifest runtime"
```

---

### Task 2: Asset Validation, Logo, and Delivery Gates

**Files:**
- Create: `scripts/validate-assets.mjs`
- Create: `scripts/validate-assets.test.mjs`
- Create: `scripts/qa/check-ait-icon-env.mjs`
- Create: `scripts/qa/check-ait-icon-env.test.mjs`
- Create: `scripts/build-ait.mjs`
- Create: `scripts/build-ait.test.mjs`
- Create: `public/assets/brand/app-logo.png`
- Modify: `package.json`
- Modify: `granite.config.ts`
- Modify: `scripts/verify-ait-package.mjs`
- Modify: `scripts/verify-ait-package.test.mjs`
- Modify: `scripts/qa/apps-in-toss-private-qr.test.mjs`
- Modify: `docs/qa/apps-in-toss-private-qr.md`

**Interfaces:**
- Consumes: the manifest schema and exact asset tables from Task 1 and the approved design spec.
- Produces: `npm run check:assets`, `npm run check:ait-config`, `ASSETS_REQUIRED=1` full-art gate, isolated `artifacts/ait/game.ait` output, explicit-path `.ait` verification, and a `QR_EVIDENCE=1` Apps build gate that validates supplied console metadata/hosted-icon URL shape before `ait build` starts.

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

Add explicit failing fixtures for missing referenced files, `..`/absolute paths, an underscore path such as `blocks/tile_i.png`, non-ASCII runtime names, wrong PNG/WebP dimensions, alpha color types or a PNG `tRNS` chunk on the opaque logo, missing alpha support on transparent PNGs, atlas `rotated:true`, wrong group frame counts/source sizes, mismatched `frame` versus `spriteSourceSize` dimensions, inconsistent untrimmed offsets/full dimensions, wrong `meta.image`, manifest extras/missing keys, and total runtime bytes over 30 MiB.

Add bounded malicious/invalid format fixtures: SVG containing `<script>`, any `on*=` event attribute, `<foreignObject>`, `DOCTYPE`/`ENTITY`, `<style>`/`<text>` font usage, `href`/`xlink:href`, or any nonlocal `url(...)`; PNG chunks whose declared length crosses EOF; and MP3 data with neither a valid ID3-skipped MPEG audio frame nor a direct valid MPEG frame. Add one accepted geometry-only SVG and one accepted ID3-plus-complete-frame MP3. The MP3 gate proves only a bounded container/first-frame check, not decode success, duration, loudness, or seamless looping.

Add `build-ait.test.mjs` cases proving dynamic `AIT_APP_NAME` locates exactly the CLI-produced root `${appName}.ait`, copies it to the validated relative `AIT_ARTIFACT_PATH` (default `artifacts/ait/game.ait`), removes only that exact source after a successful copy, and ignores stale sibling `.ait` files. Reject blank/path-separator/source-escaping app names, absolute/output-escaping artifact paths, a nonzero CLI exit, and missing CLI output. Seed an old destination and prove either CLI failure leaves it untouched; only a successful exact-source staging may replace it. Change `verify-ait-package.test.mjs` so the CLI requires one explicit `.ait` path and never scans the workspace or chooses a sibling artifact.

In `check-ait-icon-env.test.mjs`, cover the env-less no-op, `QR_EVIDENCE=1` with each required variable absent, blank app/display values, HTTP/localhost/data icon URLs, and one accepted triple of explicitly supplied nonblank `AIT_APP_NAME`, nonblank `AIT_DISPLAY_NAME`, and public HTTPS `AIT_ICON_URL`. In `apps-in-toss-private-qr.test.mjs`, require the checklist to name all three variables and to distinguish automated config/package proof from external console/device proof.

- [ ] **Step 2: Run the Node tests and confirm the validator is absent**

Run: `npx -y node@24.15.0 --test scripts/validate-assets.test.mjs scripts/qa/check-ait-icon-env.test.mjs scripts/build-ait.test.mjs scripts/verify-ait-package.test.mjs`

Expected: FAIL with module-not-found for the new validator/gate.

- [ ] **Step 3: Implement binary-header and atlas validation without adding dependencies**

Walk PNG chunks with length bounds. Read IHDR width/height/color type; reject alpha color types and any `tRNS` chunk for the opaque logo, and require alpha-capable color type or `tRNS` for transparent tile/item/atlas PNGs. Parse WebP VP8/VP8L/VP8X dimensions and alpha metadata. Limit each SVG to 64 KiB of valid UTF-8 and reject case-insensitive script/event/foreignObject/entity/style/text/href/external-URL/font constructs listed in Step 1; accepted icons use only inline geometry, paint values, and local fragment IDs. Parse an optional ID3v2 synchsafe length, then require a valid MPEG version/layer/bitrate/sample-rate header and use those fields to prove the computed first-frame length remains within EOF. Do not claim browser decode, full-file validity, duration, audio quality, or looping from this check.

Strictly parse the `TexturePackerAtlasJson` envelope and exact frame-name sets/counts, rectangles, `sourceSize`, `rotated:false`, `meta.image`, `meta.format`, and `meta.scale`. Require `frame.w/h === spriteSourceSize.w/h` and source offsets plus those frame dimensions to remain inside `sourceSize`; for `trimmed:false`, require zero source offsets and frame/sprite/full-source dimensions to match. Task 2 does **not** validate or own FPS, loop, anchor, or effect-duration policy; those values exist only in Task 5's `BATTLE_ANIMATIONS` registry and its tests. Runtime file names must match `^[a-z0-9][a-z0-9/-]*\.(png|webp|svg|json|mp3)$`. Source WAV masters remain outside `public/assets` and are not runtime-validator inputs.

- [ ] **Step 4: Add the 600×600 opaque local brand image**

Before generating this bitmap, invoke the `imagegen` skill. Use this exact art direction: “600×600 opaque square app icon, cheerful apprentice magic engineer raising a glowing tetromino wand in front of a five-floor fantasy tower, tiny clockwork owl, clean original character design, bright cute fantasy palette, restrained retro pixel spark accents, readable at 48px, no text, no logos from existing games, no transparent background.” Save the final PNG at `public/assets/brand/app-logo.png`, then validate its IHDR dimensions and opacity.

- [ ] **Step 5: Wire build and QR requirements**

Add these scripts and keep them literal so the delivery-gate tests can inspect the real build chain:

```json
{
  "check:assets": "node scripts/validate-assets.mjs",
  "check:ait-config": "node scripts/qa/check-ait-icon-env.mjs",
  "build:web": "npm run check:assets && vite build --mode browser",
  "build:ait": "npm run check:ait-config && node scripts/build-ait.mjs",
  "check:ait": "node scripts/verify-ait-package.mjs"
}
```

Prefix Granite's Apps web command with `npm run check:assets`, before typecheck/Vite, and add `scripts/validate-assets.test.mjs`, `scripts/qa/check-ait-icon-env.test.mjs`, and `scripts/build-ait.test.mjs` to the explicit `test:delivery-gates` command. Keep the existing dependency/source-policy, explicit-package verifier, and private-QR contract tests in that script, so Runtime Task 8 re-runs the wrapper's dynamic-name/output-isolation contract. Consume the same metadata in Granite:

```ts
appName: process.env.AIT_APP_NAME ?? 'te-ppu-prototype',
brand: {
  displayName: process.env.AIT_DISPLAY_NAME ?? '탑 블록 대전',
  primaryColor: '#6c5ce7',
  icon: process.env.AIT_ICON_URL ?? '/assets/brand/app-logo.png',
},
```

`scripts/build-ait.mjs` resolves `@apps-in-toss/framework/package.json`, joins its package directory to `bin/ait.js`, and launches that local CLI as `process.execPath ait.js build`. This avoids platform-specific `.bin/ait` versus `.bin/ait.cmd` behavior and guarantees the wrapper's current Node 24 process runs the CLI. Normalize `AIT_APP_NAME ?? 'te-ppu-prototype'` as one nonblank basename with no `/` or `\`, and prove the resolved `${appName}.ait` has the package root as its parent before launch. After a zero CLI exit, require that exact documented package-root output, then stage it at `AIT_ARTIFACT_PATH ?? 'artifacts/ait/game.ait'`. Require the destination to be a relative `.ait` path whose resolved parent stays under `artifacts/ait/`; create parents, copy through a destination-local temporary file, atomically replace only that exact destination after the copy succeeds, remove only the exact package-root source after successful replacement, and print `AIT_ARTIFACT appName=... path=...`. A CLI/copy failure preserves any prior destination. The wrapper does not scan/delete sibling artifacts. `verify-ait-package.mjs <artifact-path>` requires one explicit regular `.ait` file, inspects only it, and reports the same normalized path; remove recursive workspace discovery from its contract.

When `QR_EVIDENCE` is absent, `check-ait-icon-env.mjs` reports `AIT_CONFIG_LOCAL` and permits the checked-in local defaults. When `QR_EVIDENCE=1`, it requires all of `AIT_APP_NAME`, `AIT_DISPLAY_NAME`, and `AIT_ICON_URL` to be explicitly present and nonblank, so Granite's implicit local defaults alone cannot satisfy the gate. It rejects non-HTTPS/localhost/data icon URL shapes and reports the supplied app/display/icon strings. This is syntax/config evidence only: the gate performs no network request and cannot prove URL reachability, console ownership, icon-byte equality, or upload status. `build:ait` invokes the gate before the wrapper launches `ait build`, so QR mode cannot bypass it. `verify-ait-package.mjs` confirms the local logo and all authored manifest references exist in the explicitly selected archive when `mode:'assets'`.

Update `docs/qa/apps-in-toss-private-qr.md` automated row A6 and artifact-identity table to record `QR_EVIDENCE`, `AIT_APP_NAME`, `AIT_DISPLAY_NAME`, `AIT_ICON_URL`, the explicit `AIT_ARTIFACT_PATH`, and its SHA-256 from the exact build. Keep URL reachability, console registration/ownership, icon upload/byte equality, Sandbox launch, real-Toss QR launch, and physical-device behavior `PENDING_EXTERNAL`; a passing config gate is not evidence for those rows.

- [ ] **Step 6: Run asset and delivery-gate tests**

Run: `npx -y node@24.15.0 --test scripts/validate-assets.test.mjs scripts/qa/check-ait-icon-env.test.mjs scripts/build-ait.test.mjs scripts/verify-ait-package.test.mjs scripts/qa/apps-in-toss-private-qr.test.mjs`

Expected: PASS; fallback mode passes ordinary builds. `ASSETS_REQUIRED=1` fails until a full pack is installed, while `QR_EVIDENCE=1 npm run build:ait` fails before `ait build` until all three console metadata variables are supplied. Neither local success is relabeled as console/device evidence.

- [ ] **Step 7: Commit validation and branding**

```powershell
git add -- scripts/validate-assets.mjs scripts/validate-assets.test.mjs scripts/qa/check-ait-icon-env.mjs scripts/qa/check-ait-icon-env.test.mjs scripts/build-ait.mjs scripts/build-ait.test.mjs scripts/verify-ait-package.mjs scripts/verify-ait-package.test.mjs scripts/qa/apps-in-toss-private-qr.test.mjs package.json granite.config.ts public/assets/brand/app-logo.png docs/qa/apps-in-toss-private-qr.md
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
- Modify: `src/ui/match/lifecycle-ui.test.tsx`

**Interfaces:**
- Consumes: Task 1's `MusicTrack` export from `src/platform/audio-port.ts`, manager-produced `ResolvedAudioRef` SFX/BGM catalogs, and `AppRoute`.
- Produces: `AudioSourceCatalog`, `AudioPort.setMusic(track|null)`, and `musicForRoute(route)` behavior; it does not redeclare `MusicTrack`.

- [ ] **Step 1: Add failing audio contract and route-map tests**

```ts
expect(musicForRoute({ name: 'tower' })).toBe('tower');
expect(musicForRoute({ name: 'match', floor: 1, seed: 1 })).toBe('early-floors');
expect(musicForRoute({ name: 'result', floor: 4, result: 'win' })).toBe('late-floors');
expect(musicForRoute({ name: 'match', floor: 5, seed: 1 })).toBe('demon-king');
expect(musicForRoute({ name: 'ending' })).toBe('ending');
```

Add Web Audio adapter tests for: set-before-unlock remembers the desired track; same track is not restarted; a changed track ramps down for exactly 0.15 seconds before replacement; mute/suspend preserve and resume from the correct modulo-buffer offset; foreground resume requires enabled+unlocked; SFX decoded-buffer failure uses the existing oscillator; BGM failure stays silent; a null source catalog selects those fallbacks without a fetch; destroy is idempotent. Supply one `ResolvedAudioRef` whose `url` deliberately differs from a path-derived guess and assert fetch receives only the supplied `url`, proving the adapter never resolves `ManifestRef.path` itself.

Add a stale-decode generation test: defer `tower` decode, request `tower`, then request and resolve `early-floors`, then resolve the older `tower` promise. Assert only the early-floors source starts, the stale source never connects/replaces active music, and `activeTrack`/offset/gain remain early-floors. Also resolve a decode after `setMusic(null)` and after `destroy()` and assert neither starts.

Add ownership tests before implementation: `AppRoot.test.tsx` proves tower-route background/foreground signals call the one service audio port without mounting `MatchScreen`; `MatchScreen.test.tsx` proves its lifecycle pauses/reset/counts down but never calls `audioPort.suspend`, `audioPort.resume`, or `audioPort.destroy`; `app-lifecycle.test.ts` proves the coordinator works with `audio` omitted and still preserves the absolute 3-second match deadline.

- [ ] **Step 2: Run audio, lifecycle, and AppRoot tests to verify missing methods/ownership failures**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform/web-audio-port.test.ts src/platform/audio-route.test.ts src/platform/app-lifecycle.test.ts src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx`

Expected: FAIL because music and root ownership do not exist.

- [ ] **Step 3: Extend the port and implement route mapping**

```ts
// Task 1 already exports MusicTrack from src/platform/audio-port.ts.
// audio-route.ts and web-audio-port.ts import that type; do not redeclare it.

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setMusic(track: MusicTrack | null): Promise<void>;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}

export interface AudioSourceRef {
  readonly url: string;
  readonly generation: number;
}

export interface AudioSourceCatalog {
  readonly sfx: Readonly<Record<SoundCue, AudioSourceRef>>;
  readonly bgm: Readonly<Record<MusicTrack, AudioSourceRef>>;
}
```

`ResolvedAudioRef` structurally satisfies `AudioSourceRef`; keep the platform port generic and do not import `ManifestRef` into the Web Audio module. This makes the ownership handoff one-way: the manager resolves/catalogs URLs, while the adapter sees only borrowed URL/generation values.

Implement `musicForRoute()` exactly from Global Constraints. The audio adapter stores these states separately: `desiredTrack`, `activeTrack`, `unlocked`, `enabled`, `backgrounded`, `pausedOffset`, `startedAt`, `activeSource`, one persistent `musicGain`, and monotonic `requestGeneration`. `pausedOffset` is seconds modulo the active buffer duration; `startedAt` is the audio-context time corresponding to that offset. Muting/backgrounding stops and clears `activeSource` after calculating the new offset. Resume creates a new source at `pausedOffset` only when enabled, unlocked, foregrounded, and the desired track is still current.

Every `setMusic` change/null and `destroy()` increments `requestGeneration`; changing to a different non-null track also resets `pausedOffset` to zero. Capture the generation before asynchronous fetch/decode and, after every await, return without creating/connecting a source unless the generation and `desiredTrack` still match, the port is not destroyed, and playback is still enabled, unlocked, and foregrounded. Reuse `musicGain` for the exact 150ms ramp; never let an older decode ramp or replace a newer source. `CreateWebAudioPortOptions.resolveSources?: () => AudioSourceCatalog | null` reads the manager's latest common bundle lazily, so the port may be constructed before boot assets load and returns `null` for unresolved/procedural mode; fetch only the supplied `AudioSourceRef.url` and never rebuild `/assets/...` from `ManifestRef.path` inside the audio adapter. Fetch/decode promises are coalesced by `{ generation, url }`, but playback `requestGeneration`s are not coalesced. Keep the current oscillator `CUES` as the fallback for unavailable SFX samples.

- [ ] **Step 4: Move audio ownership to `AppServices`/`AppRoot`**

Create the port once in `createAppServices`; this service instance is the sole owner of audio construction and final destruction. AppRoot calls `setMusic(musicForRoute(route))` on route changes, `setEnabled` on settings changes, and exposes pointer/keyboard unlock capture at `#app-shell`. Extend Task 1's module-level manager-keyed finalizer registry so one identity-checked 300ms callback owns both audio and asset cleanup; do not replace it with component-local state or add a second timer. After the grace period, call/await `audioPort.destroy()` and then call `assetManager.destroy()` in `finally`; a StrictMode effect re-mount cancels the shared finalizer. Child BattleCanvas cleanup therefore drops Pixi wrappers before common images close, while the audio port invalidates pending decode/playback before resolved catalogs are cleared. Make `MatchScreen.audioPort` required only as a borrowed cue-playing port and remove its own `createWebAudioPort`, suspend/resume calls, and delayed-destroy ownership.

- [ ] **Step 5: Separate audio lifecycle from match pause lifecycle**

Let `createAppLifecycleCoordinator` accept optional `audio`. AppRoot owns one coordinator for the app lifetime with the service audio and no-op match callbacks; it is responsible only for audio suspend/resume and remains mounted on boot, tower, intro, match, result, and ending routes. MatchScreen owns a separate coordinator with `audio: undefined`; it is responsible only for held-input reset, deterministic match pause, and the existing 3-second countdown, and is destroyed when the match route unmounts. Both coordinators use the same absolute-deadline algorithm, but only AppRoot can touch the audio context and only MatchScreen can touch match time. Do not move the countdown into AppRoot and do not let route changes recreate the audio coordinator.

Update `app-lifecycle.test.ts` helpers so `audio` is optional and assert no exception/call path when absent. Update `AppRoot.test.tsx` service fixtures with a fake audio port and verify route music plus one root-level suspend/resume pair. Update `MatchScreen.test.tsx` and `src/ui/match/lifecycle-ui.test.tsx` to inject that borrowed fake port, retain pause/countdown assertions, and explicitly assert no audio lifecycle/finalization calls from the match owner.

- [ ] **Step 6: Run all focused audio and UI tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/platform src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.test.tsx src/app/use-match-loop.test.tsx`

Expected: PASS; strict-mode remounts do not close the active port, route changes select exactly one music track, non-match routes still suspend/resume audio, and MatchScreen neither suspends nor destroys the borrowed port.

- [ ] **Step 7: Commit app-lifetime audio**

```powershell
git add -- src/platform/audio-port.ts src/platform/web-audio-port.ts src/platform/web-audio-port.test.ts src/platform/audio-route.ts src/platform/audio-route.test.ts src/platform/app-lifecycle.ts src/platform/app-lifecycle.test.ts src/app/app-services.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
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
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `tests/e2e/portrait-layout.spec.ts`

**Interfaces:**
- Consumes: core `GameEvent`, public board views, character portrait maps, and match ticks.
- Produces: `GameEventBatch`, `MatchLoopView.eventBatches`, required `BattleCanvasProps.eventBatches`, `PortraitPresentation`, optional `BattleHudProps.portrait`, optional `MatchScreenProps.portraitSources`, and `resolvePortraitState(input)`.

- [ ] **Step 1: Add failing catch-up and portrait priority tests**

```ts
expect(published.eventBatches).toEqual([
  { tick: 18, events: expect.any(Array), view: expect.objectContaining({ tick: 18 }) },
  { tick: 19, events: expect.any(Array), view: expect.objectContaining({ tick: 19 }) },
]);

for (const batch of published.eventBatches) {
  expect(batch.tick).toBe(batch.view.tick);
}

expect(resolvePortraitState({ tick: 100, hitUntil: 110, attackUntil: 118, danger: true, terminal: null }))
  .toBe('hit');
```

Test 25-tick hit/freeze, 18-tick attack/focus, 21-tick smug, persistent danger, terminal permanence, later-event-wins ties, and pause/catch-up behavior. For every catch-up frame, assert batches are strictly tick-ascending and `batch.tick === batch.view.tick`; combo/danger decisions must use that batch's view rather than the frame's latest view. Danger is true when any cell in the top four visible rows is occupied or incoming is at least 4. Lieutenants use `panic`; demon-king `rage` is a danger state only. Add BattleHud/MatchScreen compatibility tests that omit all portrait props and still render the existing labels/status without image requests.

Add a BattleCanvas propagation test with two eventful batches published in one React frame. Assert MatchScreen passes both objects unchanged and the canvas queues IDs from `tick-18` and `tick-19` separately rather than assigning both events the latest tick.

Update every manually constructed `MatchLoopView`, including `src/ui/match/lifecycle-ui.test.tsx`, with `eventBatches: []` when it has no events. Add a lifecycle fixture with two batches to prove pause/resume plumbing preserves the readonly array rather than flattening or replacing it.

- [ ] **Step 2: Run loop/HUD tests and verify the current flattened event model fails**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.test.tsx src/ui/screens/MatchScreen.test.tsx src/render/BattleCanvas.test.tsx`

Expected: FAIL because per-event ticks and portrait presentation are absent.

- [ ] **Step 3: Preserve event batches during RAF catch-up**

```ts
export interface GameEventBatch {
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly view: PublicMatchView;
}

export interface MatchLoopView {
  readonly view: PublicMatchView;
  readonly eventBatches: readonly GameEventBatch[];
  readonly events: readonly GameEvent[];
  dispatch(command: GameCommand): void;
  setPaused(reason: PauseReason, paused: boolean): void;
  stop(): void;
}

export interface BattleCanvasProps {
  readonly eventBatches: readonly GameEventBatch[];
  readonly playerBoardOverlay?: ReactNode;
  readonly selectedRow: number | null;
  readonly view: PublicMatchView;
}
```

These interfaces show the timing-relevant members only. Retain every existing non-event `MatchLoopView`/`BattleCanvasProps` member and make only `eventBatches` newly required; do not replace unrelated rendering, input, audio, or overlay props with this excerpt.

Collect one batch after each `stepMatch` that emits events and attach the public view produced immediately from that same `step.state`. Enforce by construction and test that `batch.tick === batch.view.tick`, batches are strictly ascending, and no view object from a later catch-up step is reused. Publish `eventBatches` on `MatchLoopView` and pass that readonly array through MatchScreen to `BattleCanvas.eventBatches`. BattleCanvas iterates the array and enqueues each batch independently with `effectsForEvents(batch.events, batch.tick, batch.view)`; it never reconstructs timing from the frame's latest `view.tick`.

Keep flattened `MatchLoopView.events` and the existing `onEvents(events, latestView)` callback only for source compatibility. Do not pass flattened events to BattleCanvas or use them for portraits/animations. Add `onEventBatches?: (batches: readonly GameEventBatch[]) => void`; consumers read each batch's own view.

- [ ] **Step 4: Implement the pure portrait reducer**

Store absolute match-tick deadlines. Process batches in tick order and events in array order. Accept `urls?: Partial<Record<PortraitState, string>>` and return a presentation object `{ state, url?: string, alt }`; missing state art falls back to the supplied `idle` URL and then to `undefined`, never to a request for a fabricated path. Combo display reads the batch's accompanying public view snapshot rather than changing `GameEvent` payloads. Terminal mapping is exact: player win gives hero `win` and opponent `defeat`; player loss gives hero `loss`, floors 1–4 opponent `smug`, and floor-5 opponent `idle`; draw gives both sides `idle`. Demon-king `rage` is used only for persistent danger and never as a terminal pose.

- [ ] **Step 5: Render fixed-size resilient portrait images**

Add `portrait?: PortraitPresentation` to `BattleHudProps` and `portraitSources?: { readonly player?: Partial<Record<PortraitState, string>>; readonly opponent?: Partial<Record<PortraitState, string>> }` to `MatchScreenProps`. Both are optional so Tasks 1–3, E2E drivers, and procedural fallback callers remain source-compatible. `AssetImage` receives an optional URL and switches to an accessible CSS silhouette/name fallback when absent or after `onError`; it never renders `<img src="">`. Its failed-URL state is keyed by the URL: rerendering from a failed `a.webp` to `b.webp` must attempt `b.webp` and clear the old error, while rerendering the same failed URL stays on fallback. Change `.battle-hud__header` to `display:grid; grid-template-columns:24px minmax(0,1fr) auto` and 20px under `max-height:700px`; preserve the card's prior outer height by reducing internal vertical padding/next-list margin. Add `data-portrait-state` for deterministic testing.

- [ ] **Step 6: Run portrait, loop, HUD, and responsive E2E tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/ui/match src/ui/screens/MatchScreen.test.tsx && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e -- tests/e2e/portrait-layout.spec.ts`

Expected: PASS; portrait sizes are 24/20px and player/opponent board dimensions remain exactly equal at 360×640 and 430×932.

- [ ] **Step 7: Commit tick-accurate portraits**

```powershell
git add -- src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/ui/match/portrait-state.ts src/ui/match/portrait-state.test.ts src/ui/match/AssetImage.tsx src/ui/match/AssetImage.test.tsx src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/ui/match/match-layout.css src/ui/match/lifecycle-ui.test.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/render/BattleCanvas.tsx src/render/BattleCanvas.test.tsx tests/e2e/portrait-layout.spec.ts
git commit -m "feat: add deterministic battle portraits"
```

---

### Task 5: Presentation-Only Command Feedback and Atlas Registry

**Files:**
- Modify: `src/app/use-match-loop.ts`
- Modify: `src/app/use-match-loop.test.tsx`
- Create: `src/render/battle-animation-registry.ts`
- Create: `src/render/battle-animation-registry.test.ts`
- Create: `src/render/battle-texture-cache.ts`
- Create: `src/render/battle-texture-cache.test.ts`
- Modify: `src/render/event-animation-queue.ts`
- Modify: `src/render/event-animation-queue.test.ts`
- Modify: `src/render/draw-primitives.ts`
- Modify: `src/render/draw-primitives.test.ts`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`
- Modify: `src/render/BoardScene.tsx`
- Modify: `src/render/pixi-elements.ts`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`

**Interfaces:**
- Consumes: `GameEventBatch`, loaded atlas textures, and scheduled `TimedCommand`s.
- Produces: `CommandFeedback`, `UseMatchLoopOptions.onCommandFeedback(feedback)`, `MatchLoopView.commandFeedback`, `BattleTextureCache`, `BattleAtlasTextures`, optional `BattleCanvasProps.atlas`, and exact animation/lifetime registries for nine atlas groups.

- [ ] **Step 1: Add failing presentation-signal tests**

```ts
export interface CommandFeedback {
  readonly sequence: number;
  readonly tick: number;
  readonly side: SideId;
  readonly command: GameCommand;
}

expect(feedback).toEqual([
  { sequence: 0, tick: 12, side: 'player', command: { type: 'move', dx: -1 } },
  { sequence: 1, tick: 12, side: 'opponent', command: expect.any(Object) },
]);
```

Add `onCommandFeedback?: (feedback: CommandFeedback) => void` to `UseMatchLoopOptions`, `readonly commandFeedback: readonly CommandFeedback[]` to `MatchLoopView`, and a required readonly `commandFeedback` prop to BattleCanvas. Assert player-before-AI order, exact scheduled tick, one monotonic sequence, feedback for a subsequently rejected command, no callback during pause, callback exceptions swallowed, and no change to `GameEvent`, replay serialization, or match state. MatchScreen passes the frame's published feedback array unchanged to BattleCanvas.

Update manually constructed loop views in `MatchScreen.test.tsx` and `lifecycle-ui.test.tsx` with `commandFeedback: []` by default, plus one nonempty propagation case. No test helper may fabricate the field inside MatchScreen/BattleCanvas; callers own the frame's readonly feedback array.

In `BattleCanvas.test.tsx`, add one case with `atlas` omitted and one with an incomplete atlas. Both must keep the critical effect visible through the Graphics/BoardScene fallback. Add one complete-atlas case proving only effects with all named frames select Pixi sprites. In `draw-primitives.test.ts`, cover visible procedural primitives for all nine groups, including command-only move/rotate feedback and batch-view-dependent combo/freeze cases; extend primitive roles for move dust, rotate spark, land impact, and combo pop instead of forcing them into fake `GameEvent`s. Existing production and E2E callers must continue compiling without an atlas prop.

In `battle-texture-cache.test.ts`, prove one `LoadedImageRef` generation creates one Pixi base texture, repeated resolution reuses it, changing generation destroys the old Pixi textures with `destroy(false)`, and cache `destroy()` is idempotent. Assert it never calls `ImageBitmap.close()` or mutates manager-owned `LoadedImageRef`/`AtlasData`.

- [ ] **Step 2: Add exact atlas-registry tests**

```ts
expect(BATTLE_ANIMATIONS['move-dust']).toEqual({ frames: 4, fps: 20, loop: false, sourceSize: [64, 64], anchor: [.5, 1] });
expect(BATTLE_ANIMATIONS['freeze-overlay']).toEqual({ frames: 8, fps: 12, loop: true, sourceSize: [64, 64], anchor: [0, 0] });
expect(BATTLE_EFFECT_LIFETIMES['attack-shot']).toEqual({ kind: 'fixed', durationMs: 300 });
expect(BATTLE_EFFECT_LIFETIMES['freeze-overlay']).toEqual({ kind: 'state', field: 'freezeTicks' });
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

const BATTLE_EFFECT_LIFETIMES = {
  'move-dust':      { kind: 'animation' },
  'rotate-spark':   { kind: 'animation' },
  'land-impact':    { kind: 'animation' },
  'line-clear':     { kind: 'animation' },
  'attack-shot':    { kind: 'fixed', durationMs: 300 },
  'garbage-land':   { kind: 'animation' },
  'item-acquire':   { kind: 'animation' },
  'freeze-overlay': { kind: 'state', field: 'freezeTicks' },
  'combo-pop':      { kind: 'animation' },
} as const;
```

Validate generated frame names start at `00` and match atlas JSON counts. `kind:'animation'` lasts exactly `frames / fps * 1000`; the looping attack sprite travels between board centers for exactly 300ms and then exits; freeze alone is state-owned and persists until that side's public `freezeTicks` reaches zero. These are Task-5 presentation policies and never enter atlas JSON or deterministic core state.

Test this complete source-to-group mapping; no group may rely on a frame's flattened event list:

| Atlas group | Exact source | Placement/state rule |
| --- | --- | --- |
| `move-dust` | `CommandFeedback.command.type === 'move'` | Feedback side's active-piece base, even if the core later rejects the move. |
| `rotate-spark` | `CommandFeedback.command.type === 'rotate-clockwise'` | Feedback side's active-piece center, even if the core later rejects rotation. |
| `land-impact` | batch event `piece-locked` | Event side and that batch's landing/public board state. |
| `line-clear` | batch event `lines-cleared` | Event side and rows from the event at `batch.tick`. |
| `attack-shot` | batch event `attack-sent` | From event side board center toward the other board center. |
| `garbage-land` | batch event `garbage-landed` | Event side, column, and landing row. |
| `item-acquire` | batch event `item-acquired` | Event side and item from the event. |
| `freeze-overlay` | `batch.view.sides[side].freezeTicks > 0` or latest view while frozen | Loop on that side until its view reaches zero; do not enqueue one fixed-duration slot. |
| `combo-pop` | batch event `lines-cleared` with `batch.view.sides[event.side].combo >= 2` | Use that batch's combo/view and tick, never the frame-latest view. |

One `lines-cleared` event may produce both `line-clear` and `combo-pop`. `item-used`/`freeze-applied` still drive portrait/audio behavior, but do not invent a tenth atlas group.

- [ ] **Step 3: Run loop/render tests to verify signals and sprites are absent**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/render`

Expected: FAIL on missing feedback/registry and current fixed 140ms event timing.

- [ ] **Step 4: Emit feedback immediately before deterministic command application**

After combining queued player commands and AI commands for a tick, create one `CommandFeedback` object for every scheduled command in player-before-AI order, append it to the frame's published `commandFeedback`, and call `onCommandFeedback(feedback)` inside a try/catch immediately before the unchanged `stepMatch`. The presentation resolver filters move/rotate cues; other command feedback is harmless. Maintain one presentation-only monotonic sequence in the hook; do not add IDs to core commands or state.

- [ ] **Step 5: Generalize the animation queue and Pixi effect layers**

Define `BattleAtlasTextures` as a readonly partial mapping from exact generated frame names to loaded Pixi textures and add `atlas?: BattleAtlasTextures | null` to `BattleCanvasProps`/`BoardSceneProps`. Convert command feedback independently by its own `feedback.tick`. Convert events by iterating `eventBatches` and calling `effectsForEvents(batch.events, batch.tick, batch.view)` for each batch, so catch-up ticks never merge. Apply `BATTLE_EFFECT_LIFETIMES` identically to Pixi and Graphics paths and use RAF progress for every active effect. Board-local effects are move dust, rotate spark, land, line clear, garbage land, item acquire, `freeze-overlay`, and combo pop. `attack-shot` is a looping BattleCanvas-root sprite travelling between equal board rect centers for the registry's exact 300ms. `freeze-overlay` loops while `model.freezeTicks > 0`, not for a fixed-duration FIFO slot. Extend Pixi elements with `Sprite` and `AnimatedSprite`, but instantiate either only after the registry verifies that every frame for that effect exists.

`BattleTextureCache` is the sole owner of Pixi base textures/subtextures created from common tile/item `LoadedImageRef.source` values and `AtlasData.json`. Key entries by loaded ref identity plus `generation`; reuse them across 60Hz renders. On any consumed common generation change or BattleCanvas unmount, destroy obsolete Pixi textures with `destroy(false)` before AppRoot's delayed final `assetManager.destroy()`. The `false` flag is required: the cache destroys only Pixi wrappers and never the manager-owned image source. Atlas frame arrays are cached by atlas generation and group. Floor background/full-art/portrait refs are URL-driven screen inputs and never enter this Pixi cache, so `releaseFloor` must not tear down or recreate unchanged common textures.

- [ ] **Step 6: Preserve per-effect Graphics fallback**

If `atlas` is absent, null, or missing any required frame, feed that same effect to existing `draw-primitives`; never drop it merely because some sibling atlas group loaded. Atlas and Graphics paths are mutually exclusive per effect so a partial bundle does not double-render. Cap decorative concurrent effects at 6 and keep critical FIFO order. Cache resolved frame arrays by atlas identity/group; the atlas path may not allocate a texture or array every 60Hz tick after load.

Update the hoisted `@pixi/react`/`pixi.js` mocks in `BattleCanvas.test.tsx` before importing `BattleCanvas`: export inert `Sprite`, `AnimatedSprite`, and `Texture` constructors in addition to the existing `Container`, `Graphics`, and `Text`, and make the mocked BoardScene capture the optional atlas/skin props. This keeps `pixi-elements.ts` registration tests representative instead of failing at module evaluation. The no-atlas test remains the required procedural fallback regression.

- [ ] **Step 7: Run loop/render tests and commit**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/use-match-loop.test.tsx src/render src/ui/screens/MatchScreen.test.tsx`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS with presentation callback failures isolated, optional atlas props source-compatible, complete groups using Pixi, and absent/incomplete groups using the fallback renderer.

```powershell
git add -- src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/render/battle-animation-registry.ts src/render/battle-animation-registry.test.ts src/render/battle-texture-cache.ts src/render/battle-texture-cache.test.ts src/render/event-animation-queue.ts src/render/event-animation-queue.test.ts src/render/draw-primitives.ts src/render/draw-primitives.test.ts src/render/BattleCanvas.tsx src/render/BattleCanvas.test.tsx src/render/BoardScene.tsx src/render/pixi-elements.ts src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx
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
expect(runReplay(replayLog).state).toEqual(originalFinalState);
```

Add public-view sanitation, invariant, clone, row-clear, and attack insertion cases proving the marker survives deterministic transformations and never appears on normal O cells.

Add renderer-priority cases for an item-marked normal cell, a garbage cell, and a defensive synthetic cell containing both flags. The required lookup order is item marker, then garbage, then piece kind, so an item is never hidden by its base block; invariants reject the synthetic marker+garbage combination before it can occur in real match state. Add a hash test proving `{ kind:'O', garbage:true }` and `{ kind:'O' }` produce different authoritative hashes.

- [ ] **Step 2: Run core/render tests and verify garbage cannot be distinguished**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/core src/render/draw-primitives.test.ts`

Expected: FAIL because garbage is currently represented only as `{ kind:'O' }`.

- [ ] **Step 3: Add the minimal deterministic cell flag**

```ts
export type Cell = {
  readonly kind: PieceKind;
  readonly marker?: ItemType;
  readonly garbage?: true;
};
```

Set it only in garbage insertion. Preserve it through board clones/public views/replay and validate that it is either absent or exactly `true`. Do not alter collision, clear, scoring, AI board occupancy, or replay command ordering.

Reject cells that combine `marker` with `garbage:true`, because garbage is created only by attack insertion and never carries an item. Extend replay's authoritative `projectCell` tuple from `[kind, marker]` to `[kind, marker, garbage]`. Keep `ReplayV1` and its serialized `{ version, config, endTick, commands }` envelope unchanged: replay logs contain commands, not board snapshots, so no replay schema bump is needed. Existing fixed hash expectations may be updated only where the newly authoritative garbage bit is present; equal seed/command replays must still converge to identical hashes.

- [ ] **Step 4: Partition textured cells from procedural fallbacks**

`partitionBoardPrimitives(primitives, skin, width, height)` resolves each occupied cell with the exact priority `marker item texture > garbage texture > piece-kind texture`. `skin` carries only optional manager-owned `LoadedImageRef`s; resolve them through Task 5's `BattleTextureCache`, never by creating a new Pixi texture from a URL during render. Leave every unresolved primitive for `drawBoardPrimitives`; a missing item texture therefore falls back to the existing item-marked procedural primitive rather than silently degrading to a plain block. Set Pixi texture scale mode to `nearest`; scale logical 16×16 art to the computed board cell rectangle without smoothing.

- [ ] **Step 5: Run core, replay, render, and simulation smoke tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/core src/render tests/sim/aiSimulation.test.ts`

Expected: PASS with identical combat outcomes, replay v1 command compatibility, the garbage bit included in authoritative hashes, and item/garbage/kind render priority deterministic under partial assets.

- [ ] **Step 6: Commit the board skin seam**

```powershell
git add -- src/core/model.ts src/core/board.ts src/core/replay.ts src/core/invariants.ts src/render/draw-primitives.ts src/render/draw-primitives.test.ts src/render/BoardScene.tsx src/render/board-skin.ts src/render/board-skin.test.ts tests/core/board.test.ts tests/core/public-view.test.ts tests/core/replay-and-properties.test.ts
git commit -m "feat: support pixel board skins"
```

---

### Task 7: Screen Art, Floor Loading, and Cache Release

**Files:**
- Create: `src/assets/use-floor-assets.ts`
- Create: `src/assets/use-floor-assets.test.tsx`
- Create: `src/ui/screens/ScreenBackdrop.tsx`
- Create: `src/ui/screens/ScreenBackdrop.test.tsx`
- Create: `src/ui/match/AssetIcon.tsx`
- Create: `src/ui/match/AssetIcon.test.tsx`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`
- Modify: `src/ui/match/RotateButton.tsx`
- Modify: `src/ui/match/RotateButton.test.tsx`
- Modify: `src/ui/match/SettingsPanel.tsx`
- Modify: `src/ui/match/ExitConfirmation.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/ui/match/match-layout.css`

**Interfaces:**
- Consumes: `AssetManager`, common/floor bundles, and app route/floor.
- Produces: `useFloorAssets(manager, floor: Floor | null)`, optional screen/battle/UI-icon props, and resilient authored backdrops/full art.

- [ ] **Step 1: Add failing load/prefetch/release tests**

```ts
expect(manager.loadFloor).toHaveBeenCalledWith(3);
expect(manager.prefetchFloor).toHaveBeenCalledWith(4);
expect(manager.releaseFloor).toHaveBeenCalledWith(2);
```

Test stale async completion after route/floor change, `floor:null` doing no new load/prefetch, and a cached structural-manifest rejection being caught locally with no unhandled rejection while the procedural screen remains. A `loadFloor()` result of `'fallback'` still publishes `getFloorAssets(floor)` when it contains successful refs. Cover the manager's pending-prefetch entry wrapper by asserting the hook issues only its one explicit entry call and awaits the wrapper's final retry result; retry orchestration stays inside Task 1's manager. Also cover same-floor deduplication, final floor having no floor-6 prefetch, floor 5 remaining retained across result-to-ending, and floor 5 releasing only when ending returns to the tower. Prove abandoning a run for the tower releases displayed and speculative floors, the obsolete generation is no longer passed to UI before release, unchanged common Pixi textures survive floor-only release, and final AppRoot unmount destroys the BattleCanvas cache before manager destruction.

Add `AssetIcon` and `ScreenBackdrop` rerender tests matching Task 4's `AssetImage` contract: after `a.svg`/`a.webp` fails, changing to `b.svg`/`b.webp` clears failed state and attempts the new URL; rerendering the same failed URL remains on CSS/text fallback. Also cover present and absent icon URLs while containing buttons retain identical accessible names.

- [ ] **Step 2: Run asset/AppRoot tests and verify no screen bundle wiring exists**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets/use-floor-assets.test.tsx src/app/AppRoot.test.tsx src/ui/screens/ScreenBackdrop.test.tsx`

Expected: FAIL on missing hook/components/props.

- [ ] **Step 3: Implement non-blocking floor bundle state**

The hook begins synchronously with `null` so screens render existing UI. Its signature is `useFloorAssets(manager: AssetManager, floor: Floor | null)`. Store state as a keyed `{ floor, bundle }` result and synchronously return `null` whenever the requested floor differs from that key; do not wait for an effect to clear a prior bundle. For `null`, do not start work. For a floor, call `loadFloor(floor)` once inside `try/catch`; after `'ready'` or `'fallback'`, publish `manager.getFloorAssets(floor)` only if the request remains current, because the manager's prefetch-entry wrapper has already completed its optional one retry. On structural rejection, keep/publish `null` for that current key and do not rethrow. Prefetch a valid `floor + 1` through `prefetchFloor()`; that method owns its rejection handler. Track the requested current/prefetch set: a floor route retains exactly `{ current, valid next }`, ending retains `{ FINAL_FLOOR }`, and boot/tower retain `{}`. Release every previously requested floor outside the new set, including a speculative next floor when a run is abandoned; generation checks make its late completion stale.

In AppRoot derive the displayed floor as: `route.floor` for floor-intro/match/result, `FINAL_FLOOR` for ending, and `null` for boot/tower. This keeps floor 5 available throughout the ending and releases it only on ending-to-tower. When the desired set changes, first render without any obsolete displayed bundle, then schedule `releaseFloor(floor)` for every removed displayed or speculative floor in a microtask guarded by the current route/generation. A removed prefetch has no consumer; an old displayed ref is released only after no screen/HUD receives it. This floor-only transition leaves unchanged common BattleCanvas textures intact. Ignore stale async completions, and on final AppRoot unmount let BattleCanvas destroy its common Pixi wrappers before the 300ms-grace `assetManager.destroy()` closes common sources.

- [ ] **Step 4: Apply screen art without layout ownership**

`ScreenBackdrop` uses an absolutely positioned image with `object-fit:cover; object-position:center top`, low contrast overlay, and `aria-hidden=true`. The center 70% remains readable behind boards. Tower uses the optional common `tower-exterior`; floor intro/result use whichever current-floor background/full-opponent refs succeeded; ending uses common hero/owl plus the retained floor-5 demon-king result art. An absent or failed image removes only that layer and exposes the current CSS gradient; key its error state by `LoadedImageRef.url` plus generation so a new ref retries. Never build a URL from an ID in a component.

- [ ] **Step 5: Pass one resolved battle bundle to HUD and Canvas**

MatchScreen must not fetch. AppRoot supplies optional common and floor bundles; MatchScreen maps the hero/opponent portrait records to the optional Task-4 portrait props and the optional tile/atlas bundle to BattleCanvas. A null or partial bundle means each missing portrait, tile, or atlas group independently uses existing labels, colors, silhouettes, and Graphics.

Consume all seven optional UI icon refs without changing interaction contracts: `rotate` on `RotateButton`, `settings` on the settings opener, `sound-on`/`sound-off` and `haptics-on`/`haptics-off` inside `SettingsPanel`, and `exit` on the exit button/confirmation. `AssetIcon` renders `aria-hidden="true"` only for a nonempty URL, keys failure by URL/generation, removes the image after `onError`, and leaves the existing text/CSS glyph and button accessible name in place. The icon map and all component icon props are optional so procedural fallback and existing test/E2E wiring remain valid.

- [ ] **Step 6: Run screen, asset, and responsive tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/assets src/app src/ui src/render && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e -- tests/e2e/portrait-layout.spec.ts tests/e2e/app-flow.spec.ts`

Expected: PASS in procedural, complete-authored, and injected partial-runtime-fallback cases; ending retains floor-5 art, missing/broken icons preserve usable labeled controls, and no horizontal overflow/equal-board dimensions remain unchanged.

- [ ] **Step 7: Commit screen integration**

```powershell
git add -- src/assets/use-floor-assets.ts src/assets/use-floor-assets.test.tsx src/ui/screens/ScreenBackdrop.tsx src/ui/screens/ScreenBackdrop.test.tsx src/ui/match/AssetIcon.tsx src/ui/match/AssetIcon.test.tsx src/app/AppRoot.tsx src/app/AppRoot.test.tsx src/ui/screens/TowerScreen.tsx src/ui/screens/FloorIntroScreen.tsx src/ui/screens/ResultScreen.tsx src/ui/screens/EndingScreen.tsx src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx src/ui/match/RotateButton.tsx src/ui/match/RotateButton.test.tsx src/ui/match/SettingsPanel.tsx src/ui/match/ExitConfirmation.tsx src/ui/match/lifecycle-ui.test.tsx src/render/BattleCanvas.tsx src/render/BattleCanvas.test.tsx src/ui/screens/screens.css src/ui/match/match-layout.css
git commit -m "feat: integrate floor art with safe fallbacks"
```

---

### Required Inter-Plan Gate Before Task 8

Stop this plan after Task 7 and execute all four tasks in `docs/superpowers/plans/2026-08-03-identity-aware-progress.md`. Return here only after its focused tests, full unit suite, typecheck, browser build, and E2E checks pass. Do not build or classify a final `.ait` before the identity-aware repository factory and identity-first boot are present; Task 8 is the single final gate over both plans.

---

### Task 8: Full Runtime, Build, and Apps-in-Toss Verification

**Files:**
- Modify only when a verification failure demonstrates an in-scope defect.
- Update evidence cells in `docs/qa/apps-in-toss-private-qr.md` only when the exact command/artifact or external device evidence actually exists.
- Produce (ignored artifact): `artifacts/ait/game.ait`

**Interfaces:**
- Consumes: Runtime Tasks 1–7, the complete identity-aware progress plan, and the completed five-floor progression plan.
- Produces: a verified fallback-capable build plus four explicitly separate evidence classes: procedural fallback automation, authored-pack validation, QR-configured package construction, and external console/Sandbox/physical-device results.

- [ ] **Step 1: Verify the checked-in manifest mode and exact inventory report**

Run: `npx -y node@24.15.0 scripts/validate-assets.mjs --report`

Expected: the report explicitly says `procedural-fallback`, or in authored mode lists exactly 1 logo, 7 full art, 38 portraits, 6 backgrounds, 11 block/item PNGs, 7 SVG icons, 1 atlas pair, 8 SFX, and 5 BGM with no missing ID. A fallback report proves the runtime can ship without authored files; it is not authored-pack evidence.

- [ ] **Step 2: Validate fallback assets and all authored-source policy gates**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:assets`

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:delivery-gates`

Expected: PASS; fallback mode is explicitly reported and not mistaken for a completed art pack, QR-configured artifact, console upload, or device launch.

- [ ] **Step 3: Run complete unit/type/build/browser verification**

Run each command separately:

```powershell
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:web
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e
```

Expected: all tests, typecheck, Vite build, and Playwright scenarios PASS.

- [ ] **Step 4: Run focused simulation regressions and a 500-match five-floor smoke**

Run the focused three-file regression set first; Vitest must report exactly 50 passing tests:

```powershell
npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/ai/profiles.test.ts tests/sim/aiSimulation.test.ts tests/sim/validation-workers.test.ts
```

This includes the known-cap unit matrix: the deliberate floor-1/seed-5 cap sentinel at test tick limit 5; floor-3 seeds `75`, `111`, and `552` resolving below the production cap; and floor-4 seeds `27`, `61`, `85`, `86`, `111`, `129`, `150`, `169`, `272`, `406`, `429`, `435`, `608`, `620`, `642`, `832`, and `881` resolving with zero rejected commands below the production cap.

Then run exactly 100 filtered results for each floor under Node 24, 500 fresh matches total:

```powershell
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
foreach ($floor in 1..5) {
  npx -y node@24.15.0 $npmCli run validate:ai -- --floor $floor --seed-from 1 --seed-to 100
  if ($LASTEXITCODE -ne 0) {
    throw "AI smoke failed for floor $floor with exit code $LASTEXITCODE"
  }
}
```

Expected: the harness proves exact index/floor/seed result coverage and each invocation reports exactly 100 results for its selected floor and seeds `1..100`; across all five invocations there are exactly 500 results, `rejected=0`, and `capped=0`. The known-cap unit matrix and all 50 focused tests PASS.

This fresh 500-match smoke is not a canonical 5,000-match PASS. Any ordering or long-memory statement must cite the retained evidence from the five-floor progression plan's Task 6: stopped checkpoint `3504` with rates `2.5% < 4.4% < 50.0% < 93.5%`, `rejected=0`, `capped=0`, heap `+0.83 MiB`, peak `+5.08 MiB`; final floor-4 seeds `1..1000` at `93.9%` with zero rejected/capped; and hardened floor-5 seeds `1..100` at `100/100`, zero rejected/capped, heap `+0.43 MiB`. If an AI profile or simulation implementation changes later, make a new explicit calibration/evidence-count decision instead of silently restoring the 5,000-match default.

- [ ] **Step 5: Build and inspect the local `.ait`**

Run with one explicit isolated destination and temporarily clear QR metadata so this artifact cannot be misclassified as a console-configured build:

```powershell
$artifactPath = 'artifacts/ait/game.ait'
$priorArtifactPath = $env:AIT_ARTIFACT_PATH
$priorQrEvidence = $env:QR_EVIDENCE
$priorAppName = $env:AIT_APP_NAME
$priorDisplayName = $env:AIT_DISPLAY_NAME
$priorIconUrl = $env:AIT_ICON_URL
try {
  Remove-Item Env:QR_EVIDENCE, Env:AIT_APP_NAME, Env:AIT_DISPLAY_NAME, Env:AIT_ICON_URL -ErrorAction SilentlyContinue
  $env:AIT_ARTIFACT_PATH = $artifactPath
  npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:ait
  npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:ait -- $artifactPath
} finally {
  if ($null -eq $priorArtifactPath) { Remove-Item Env:AIT_ARTIFACT_PATH -ErrorAction SilentlyContinue }
  else { $env:AIT_ARTIFACT_PATH = $priorArtifactPath }
  if ($null -eq $priorQrEvidence) { Remove-Item Env:QR_EVIDENCE -ErrorAction SilentlyContinue }
  else { $env:QR_EVIDENCE = $priorQrEvidence }
  if ($null -eq $priorAppName) { Remove-Item Env:AIT_APP_NAME -ErrorAction SilentlyContinue }
  else { $env:AIT_APP_NAME = $priorAppName }
  if ($null -eq $priorDisplayName) { Remove-Item Env:AIT_DISPLAY_NAME -ErrorAction SilentlyContinue }
  else { $env:AIT_DISPLAY_NAME = $priorDisplayName }
  if ($null -eq $priorIconUrl) { Remove-Item Env:AIT_ICON_URL -ErrorAction SilentlyContinue }
  else { $env:AIT_ICON_URL = $priorIconUrl }
}
```

Expected: the wrapper reports `te-ppu-prototype` and exact `artifacts/ait/game.ait` path; the explicit-path verifier reports the same file, archive markers/assets are present, unpacked size is below 100 MiB, and package checks PASS. This deliberately cleared-metadata run is a local-default `.ait` package check only.

- [ ] **Step 6: Run only the evidence gates whose external inputs are actually present**

For authored-pack evidence, preserve the caller's environment and require the complete installed pack:

```powershell
$priorAssetsRequired = $env:ASSETS_REQUIRED
try {
  $env:ASSETS_REQUIRED = '1'
  npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:assets
} finally {
  if ($null -eq $priorAssetsRequired) { Remove-Item Env:ASSETS_REQUIRED -ErrorAction SilentlyContinue }
  else { $env:ASSETS_REQUIRED = $priorAssetsRequired }
}
```

Expected: PASS only when the complete authored manifest and files are installed. This proves local inventory/format/size validation, not artist authorship, license clearance, console upload, or device rendering.

For a QR-configured `.ait`, first load the exact console values into `AIT_APP_NAME`, `AIT_DISPLAY_NAME`, and `AIT_ICON_URL`, then run this build gate:

```powershell
$requiredAitEnv = 'AIT_APP_NAME', 'AIT_DISPLAY_NAME', 'AIT_ICON_URL'
$missingAitEnv = $requiredAitEnv | Where-Object {
  [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
}
if ($missingAitEnv.Count -gt 0) { throw "Missing QR build environment: $($missingAitEnv -join ', ')" }

$priorQrEvidence = $env:QR_EVIDENCE
$priorArtifactPath = $env:AIT_ARTIFACT_PATH
$artifactPath = 'artifacts/ait/game.ait'
try {
  $env:QR_EVIDENCE = '1'
  $env:AIT_ARTIFACT_PATH = $artifactPath
  npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:ait
  npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run check:ait -- $artifactPath
} finally {
  if ($null -eq $priorQrEvidence) { Remove-Item Env:QR_EVIDENCE -ErrorAction SilentlyContinue }
  else { $env:QR_EVIDENCE = $priorQrEvidence }
  if ($null -eq $priorArtifactPath) { Remove-Item Env:AIT_ARTIFACT_PATH -ErrorAction SilentlyContinue }
  else { $env:AIT_ARTIFACT_PATH = $priorArtifactPath }
}
```

Expected: the config gate runs before `ait build` and rejects missing/implicit local metadata; dynamic `AIT_APP_NAME` still stages exactly `artifacts/ait/game.ait`, and only that file is verified. Success proves only that the artifact was built with the supplied strings and passed local package inspection. Update the automated QA rows with exact commit/hash/output only when retained evidence exists. Leave URL reachability/ownership, console upload, Sandbox execution, real-Toss QR launch, stable HASH behavior, and physical-device checks `PENDING_EXTERNAL` until their listed evidence is attached. If authored and QR claims are both required for one artifact, keep `ASSETS_REQUIRED=1` set during the QR build as well.

- [ ] **Step 7: Conditionally commit real QA evidence and leave a clean worktree**

```powershell
$qaPath = 'docs/qa/apps-in-toss-private-qr.md'
git diff --quiet HEAD -- $qaPath
if ($LASTEXITCODE -eq 1) {
  git add -- $qaPath
  git commit -m "docs: record Apps-in-Toss verification evidence"
} elseif ($LASTEXITCODE -ne 0) {
  throw 'Could not inspect the Apps-in-Toss QA evidence diff.'
}

git status --short
git log -12 --oneline
```

Run the conditional add/commit only when the QA diff replaces evidence cells with retained exact-commit/artifact/device results; do not commit unchanged `PENDING_EXTERNAL` placeholders. Any code fix found during Task 8 must be committed separately with only its reviewed files after rerunning the failed gate—never include it through the QA-only `git add`. Expected: no uncommitted tracked files; ignored `artifacts/ait/game.ait` may remain as the local artifact.
