# PvE UI, Rendering, and Apps-in-Toss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portrait React/PixiJS presentation, controls, lifecycle, audio, progress boot flow, and Apps-in-Toss packaging layer for the approved three-floor PvE prototype.

**Architecture:** React owns routes, HUD, controls, settings, and dependency assembly; one `@pixi/react` v8 WebGL application renders two equal-size boards from the public core view. A React hook owns immutable `MatchState`, advances it at a fixed 60 Hz through the pure core barrel, and supplies AI commands through the AI barrel. Platform effects are isolated behind `PlatformPort`, while progress is consumed only through the progression barrel.

**Tech Stack:** TypeScript, React 19, Vite CSR, PixiJS 8, `@pixi/react` 8, Vitest, Testing Library, Playwright, `@apps-in-toss/web-framework` 2.10.8.

## Global Constraints

- This plan covers only `src/app`, `src/ui`, `src/render`, `src/platform`, browser/E2E test support, and build/QA configuration; it does not implement game rules or AI search.
- Import pure game exports only from `src/core/index.ts`: `SideId`, `GameCommand`, `TimedCommand`, `MatchConfig`, `MatchState`, `PublicMatchView`, `PublicSideView`, `GameEvent`, `MatchStep`, `AiObservation`, `createMatch(config): MatchState`, `stepMatch(state, commands): MatchStep`, `createPublicMatchView(state): PublicMatchView`, and `createAiObservation(state, side)`.
- Import AI exports only from `src/ai/index.ts`: `AiController`, `AiFloorProfile`, `AI_FLOOR_PROFILES`, and `createAiController`; a controller is `{ readonly side: SideId; update(observation: AiObservation, tick: number): readonly TimedCommand[] }`, and `createAiController(profile, seed, side?)` defaults to `opponent`.
- Import progress exports only from `src/progression/index.ts`: `ProgressState`, `ProgressLoadResult`, `ProgressSaveResult`, `ProgressRepository`, and `createLocalProgressRepository(storage)`. `ProgressLoadResult` is `{ ok: true; state; recoveredFromCorruption: boolean } | { ok: false; state; error }`, `ProgressSaveResult` is `{ ok: true } | { ok: false; error }`, and `ProgressRepository` exposes async `load()`/`save(state)`; retry calls `save` again and corruption backup/reset stays internal.
- Reuse the already implemented `TowerController` from `src/app/towerController.ts` for unlocks, fresh starts/restarts, in-memory save failures, and save retry; React must not duplicate those transitions.
- `GameCommand` is exactly `{ type: 'move'; dx: -1 | 1 } | { type: 'rotate-clockwise' } | { type: 'soft-drop'; active: boolean } | { type: 'hard-drop' } | { type: 'use-row-clear'; row: number } | { type: 'use-freeze' } | { type: 'use-queue-swap' }`; `TimedCommand` is exactly `{ tick: number; side: SideId; command: GameCommand }`.
- `useMatchLoop` owns immutable `MatchState`, calls `stepMatch`, gives AI only `createAiObservation(state, 'opponent')`, and renders only `createPublicMatchView(state)`. The view is `{ tick; status: 'countdown' | 'playing' | 'player-won' | 'opponent-won' | 'draw'; sides: Record<SideId, PublicSideView> }`; each side exposes only `board`, `active`, `ghostY`, two-entry `next`, `combo`, `incoming`, `inventory`, `freezeTicks`, `phase`, and `topOut`.
- Use React 19 and PixiJS/`@pixi/react` major version 8; initialize Pixi with `preference="webgl"`. Do not use WebGPU, SSR, `eval`, `new Function`, or `iframe`.
- Use `@apps-in-toss/web-framework` exactly `2.10.8`, `granite.config.ts`, `webViewProps.type = 'game'`, `ait build`, and app name `te-ppu-prototype`.
- The layout is portrait-only. At 360x640 through 430x932, both visible 10x20 boards remain the same size, appear simultaneously, and never become minimaps.
- The first usable screen must appear within 10 seconds. No screen opens with an automatic bottom sheet.
- Safe Area includes Dynamic Island and the framework X-button reserve. Use `SafeAreaInsets.get()` for the initial value and `SafeAreaInsets.subscribe()` for changes; never use deprecated `getSafeAreaInsets()`.
- Call `setDeviceOrientation({ type: 'portrait' })`; disable the iOS swipe-back gesture. Call `closeView()` only after the in-app exit confirmation succeeds.
- Handle every `getUserKeyForGame()` result explicitly: `{ type: 'HASH', hash }`, `'INVALID_CATEGORY'`, `'ERROR'`, and `undefined`.
- This remains a private prototype: no ads, in-app purchases, public release, final branding, or unreviewed third-party IP assets.

---

## Planned File Structure

```text
package.json, *config.ts             dependency pins plus Vite/Vitest/Playwright/AIT configuration
scripts/, public/                    .ait size gate and original geometric prototype icon
src/app/, src/ui/                    boot/routes/match loop and screens/HUD/controls
src/render/, src/platform/           Pixi WebGL presentation and Apps-in-Toss/browser effects
src/test-support/, tests/e2e/        deterministic test adapter and portrait browser flows
docs/qa/apps-in-toss-private-qr.md   sandbox and real-Toss QR evidence checklist
```

### Task 1: Scaffold React 19, PixiJS 8, Tests, and the Apps-in-Toss Game Bundle

**Files:** Modify `package.json`, generated `package-lock.json`, `tsconfig.json`, and `vitest.config.ts`; create `index.html`, `vite.config.ts`, `.env.browser`, `.env.apps`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/app/runtime-mode.test.ts`, `src/app/runtime-mode.ts`, `src/main.tsx`, `src/styles/global.css`, `granite.config.ts`, and `public/prototype-mark.svg`.

**Interfaces:** Consumes the core/AI/progression scripts and dependencies created by the first two plans. Produces `RuntimeMode = 'browser' | 'apps-in-toss'` and `resolveRuntimeMode(mode: string): RuntimeMode` for Task 2.

- [ ] **Step 1: Add the dependency and command manifest**

```json
{
  "name": "te-ppu-prototype",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --mode browser",
    "dev:e2e": "vite --host 127.0.0.1 --mode e2e",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "validate:ai": "node --expose-gc ./node_modules/tsx/dist/cli.mjs scripts/validate-ai-simulations.ts",
    "build:web": "vite build --mode browser",
    "build:ait": "ait build",
    "test:e2e": "playwright test",
    "check:ait": "node scripts/verify-ait-package.mjs"
  },
  "dependencies": {
    "@apps-in-toss/web-framework": "2.10.8", "@pixi/react": "8.0.5", "pixi.js": "8.19.0",
    "react": "19.2.8", "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1", "@testing-library/dom": "10.4.1",
    "@testing-library/jest-dom": "7.0.0", "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1", "@types/node": "22.20.1",
    "@types/react": "19.2.18", "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5", "@vitest/coverage-v8": "4.1.10",
    "fast-check": "4.9.0", "fflate": "0.8.3", "jsdom": "30.0.1",
    "tsx": "4.23.1", "typescript": "7.0.2", "vite": "8.2.0", "vitest": "4.1.10"
  }
}
```

Run: `npm install`

Expected: exit 0; `package-lock.json` pins React 19, PixiJS 8, `@pixi/react` 8, and Apps-in-Toss 2.10.8.

- [ ] **Step 2: Configure the exact Apps-in-Toss 2.x game bundle**

```ts
// granite.config.ts
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'te-ppu-prototype',
  brand: { displayName: '탑 블록 대전', primaryColor: '#6c5ce7', icon: '/prototype-mark.svg' },
  web: { host: 'localhost', port: 5173, commands: { dev: 'vite --host 0.0.0.0 --mode apps', build: 'npm run typecheck && vite build --mode apps' } },
  webViewProps: { type: 'game' },
  navigationBar: { withBackButton: false, withHomeButton: false, withTitle: false, transparentBackground: true, theme: 'dark' },
  permissions: [],
  outdir: 'dist',
});
```

Create `prototype-mark.svg` from only a violet square, three white ascending rectangles, and no text or third-party asset.

- [ ] **Step 3: Write the failing runtime-mode test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveRuntimeMode } from './runtime-mode';

describe('resolveRuntimeMode', () => {
  it('accepts only the two supported adapters', () => {
    expect(resolveRuntimeMode('browser')).toBe('browser');
    expect(resolveRuntimeMode('apps-in-toss')).toBe('apps-in-toss');
    expect(() => resolveRuntimeMode('server')).toThrow('Unsupported runtime mode: server');
  });
});
```

- [ ] **Step 4: Run the test and verify the failure**

Run: `npm test -- src/app/runtime-mode.test.ts`

Expected: FAIL because `src/app/runtime-mode.ts` does not exist.

- [ ] **Step 5: Add the minimal CSR bootstrap and runtime resolver**

```ts
export type RuntimeMode = 'browser' | 'apps-in-toss';

export function resolveRuntimeMode(value: string): RuntimeMode {
  if (value === 'browser' || value === 'apps-in-toss') return value;
  throw new Error(`Unsupported runtime mode: ${value}`);
}
```

Set `VITE_RUNTIME_MODE=browser` in `.env.browser` and `VITE_RUNTIME_MODE=apps-in-toss` in `.env.apps`; `main.tsx` validates that value and uses `createRoot(document.getElementById('root')!)`. Do not add SSR entry points. Set `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, and a 100dvh app root in `global.css`.

- [ ] **Step 6: Run scaffold verification**

Run: `npm test -- src/app/runtime-mode.test.ts; npm run typecheck; npm run build:web`

Expected: all commands exit 0; Vitest reports 1 passing test; `dist/index.html` exists.

- [ ] **Step 7: Commit**

Run `git add package.json package-lock.json index.html tsconfig.json vite.config.ts vitest.config.ts .env.browser .env.apps granite.config.ts public/prototype-mark.svg src`, then `git commit -m "chore: scaffold portrait Apps-in-Toss web game"`.

### Task 2: Implement Platform Boot, User-Key Handling, Safe Area, and Progress Loading

**Files:** Create `src/platform/platform-port.ts`, `src/platform/apps-in-toss-platform.ts`, `src/platform/browser-platform.ts`, `src/platform/create-platform.ts`, `src/platform/safe-area-provider.tsx`, `src/platform/apps-in-toss-platform.test.ts`, `src/app/app-services.ts`, `src/app/use-boot.ts`, and `src/app/use-boot.test.tsx`.

**Interfaces:**
- Consumes: `RuntimeMode` from Task 1; `ProgressRepository`, `ProgressLoadResult`, and `createLocalProgressRepository(storage)` from `src/progression/index.ts`.
- Produces:

```ts
export type SafeArea = { top: number; right: number; bottom: number; left: number };
export type UserIdentity = { kind: 'local'; key: 'local-browser' } | { kind: 'apps-in-toss'; key: string };
export interface PlatformPort {
  readonly kind: RuntimeMode;
  getIdentity(): Promise<UserIdentity>;
  getInitialSafeArea(): SafeArea;
  subscribeSafeArea(listener: (value: SafeArea) => void): () => void;
  lockPortrait(): Promise<void>;
  disableSystemBack(): Promise<void>;
  haptic(type: 'tickWeak' | 'tap' | 'success' | 'error'): Promise<void>;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write failing SDK union tests**

```ts
it.each([
  [undefined, 'UPDATE_REQUIRED'],
  ['INVALID_CATEGORY', 'INVALID_CATEGORY'],
  ['ERROR', 'RETRYABLE_SDK_ERROR'],
] as const)('maps %s without silently creating a local identity', async (sdkResult, code) => {
  const port = createAppsInTossPlatform(fakeSdk({ userKeyResult: sdkResult }));
  await expect(port.getIdentity()).rejects.toMatchObject({ code });
});

it('returns the hash identity', async () => {
  const port = createAppsInTossPlatform(fakeSdk({ userKeyResult: { type: 'HASH', hash: 'user-7' } }));
  await expect(port.getIdentity()).resolves.toEqual({ kind: 'apps-in-toss', key: 'user-7' });
});
```

- [ ] **Step 2: Run the tests and verify the failure**

Run: `npm test -- src/platform/apps-in-toss-platform.test.ts`

Expected: FAIL because the platform adapter does not exist.

- [ ] **Step 3: Implement the SDK adapter with explicit result branches**

```ts
import {
  SafeAreaInsets,
  closeView,
  generateHapticFeedback,
  getUserKeyForGame,
  setDeviceOrientation,
  setIosSwipeGestureEnabled,
} from '@apps-in-toss/web-framework';

async function getIdentity(): Promise<UserIdentity> {
  const result = await getUserKeyForGame();
  if (result === undefined) throw new PlatformError('UPDATE_REQUIRED');
  if (result === 'INVALID_CATEGORY') throw new PlatformError('INVALID_CATEGORY');
  if (result === 'ERROR') throw new PlatformError('RETRYABLE_SDK_ERROR');
  return { kind: 'apps-in-toss', key: result.hash };
}
```

Use `SafeAreaInsets.get()` only for initial state, then `SafeAreaInsets.subscribe({ onEvent })` with cleanup. `lockPortrait()` calls `setDeviceOrientation({ type: 'portrait' })`; `disableSystemBack()` calls `setIosSwipeGestureEnabled({ isEnabled: false })`; `close()` calls `closeView()`.

The browser port returns zero insets, a `local-browser` identity, no-op orientation/back/haptic calls, and marks close requests in memory for tests. Select the browser port only for Vite `browser`/`e2e` modes; `.ait` mode always selects the Apps-in-Toss port and never masks SDK errors with the browser identity.

- [ ] **Step 4: Implement boot and progress behavior**

```ts
export type BootState =
  | { status: 'loading' }
  | { status: 'ready'; identity: UserIdentity; progress: ProgressState; notice: string | null }
  | { status: 'blocked'; code: 'UPDATE_REQUIRED' | 'INVALID_CATEGORY'; message: string }
  | { status: 'retryable-error'; retry: () => void; message: string };
```

`useBoot` concurrently locks portrait, disables system back, obtains identity, creates `createLocalProgressRepository(window.localStorage)`, and loads progress. For `ProgressLoadResult.ok === false`, continue with the returned in-memory `state` and show a retryable persistence notice. If `recoveredFromCorruption` is true, show the recovery notice already backed by the progression layer.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/platform/apps-in-toss-platform.test.ts src/app/use-boot.test.tsx`

Expected: PASS; the four user-key branches, Safe Area cleanup, portrait/back calls, and progress recovery paths are covered.

- [ ] **Step 6: Commit**

Run `git add src/platform src/app/app-services.ts src/app/use-boot.ts src/app/use-boot.test.tsx`, then `git commit -m "feat: add Apps-in-Toss boot and safe-area adapter"`.

### Task 3: Build the Route State Machine and Non-Match Screens

**Files:** Create `src/app/app-route.ts`, `src/app/app-route.test.ts`, `src/app/AppRoot.tsx`, `src/app/AppRoot.test.tsx`, `src/ui/screens/BootScreen.tsx`, `src/ui/screens/TowerScreen.tsx`, `src/ui/screens/FloorIntroScreen.tsx`, `src/ui/screens/ResultScreen.tsx`, `src/ui/screens/EndingScreen.tsx`, and `src/ui/screens/screens.css`; modify `src/main.tsx`.

**Interfaces:**
- Consumes: `BootState`, `PlatformPort`, `ProgressState`, `ProgressRepository`, and the existing `TowerController`.
- Produces:

```ts
export type Floor = 1 | 2 | 3;
export type AppRoute =
  | { name: 'boot' }
  | { name: 'tower' }
  | { name: 'floor-intro'; floor: Floor }
  | { name: 'match'; floor: Floor; seed: number }
  | { name: 'result'; floor: Floor; result: 'win' | 'loss' | 'draw' }
  | { name: 'ending' };
```

- [ ] **Step 1: Write failing route tests**

```ts
it('never unlocks on loss or draw and ends after floor three victory', () => {
  expect(reduceRoute({ name: 'result', floor: 2, result: 'draw' }, { type: 'continue' })).toEqual({ name: 'tower' });
  expect(reduceRoute({ name: 'result', floor: 3, result: 'win' }, { type: 'continue' })).toEqual({ name: 'ending' });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/app/app-route.test.ts`

Expected: FAIL because `reduceRoute` is missing.

- [ ] **Step 3: Implement the reducer and screens**

Use explicit reducer events `boot-ready`, `select-floor`, `start-match`, `match-finished`, `retry`, `continue`, and `return-to-tower`. Tower buttons derive enabled state from `ProgressState.highestUnlockedFloor`; floors already cleared remain replayable. Floor intro shows the floor's approved AI reaction interval (800/450/200 ms) from `AI_FLOOR_PROFILES` and has one predictable `대전 시작` CTA.

Render a real boot shell immediately, then progress or error content inside it; do not wait for identity or Pixi before mounting `[data-testid="app-shell"]`. This is the element used for the 10-second launch assertion.

- [ ] **Step 4: Test routing and persistence calls**

```tsx
await user.click(screen.getByRole('button', { name: '1층 선택' }));
await user.click(screen.getByRole('button', { name: '대전 시작' }));
expect(screen.getByTestId('match-screen')).toBeInTheDocument();
```

On a terminal match result, call the existing `TowerController.completeFloor(result)` transition. Render its in-memory progress immediately; when it reports `SAVE_FAILED`, expose a `저장 다시 시도` button wired to `TowerController.retrySave()`. Loss and draw never mutate unlock state, and React contains no second copy of the unlock formula.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/app/app-route.test.ts src/app/AppRoot.test.tsx; npm run typecheck`

Expected: PASS; all seven routes render and the draw path returns to the tower without unlocking.

- [ ] **Step 6: Commit**

Run `git add src/app src/ui/screens src/main.tsx`, then `git commit -m "feat: add tower and result route flow"`.

### Task 4: Own the Immutable Match State in a Fixed-Step React Hook

**Files:** Create `src/app/use-match-loop.ts`, `src/app/use-match-loop.test.tsx`, and `src/ui/screens/MatchScreen.tsx`.

**Interfaces:**
- Consumes the exact core/AI barrels from Global Constraints.
- Produces:

```ts
export type PauseReason = 'background' | 'exit-confirmation';
export interface MatchLoopView {
  readonly view: PublicMatchView;
  readonly events: readonly GameEvent[];
  dispatch(command: GameCommand): void;
  setPaused(reason: PauseReason, paused: boolean): void;
  stop(): void;
}
```

- [ ] **Step 1: Write the failing fixed-step tests**

```ts
it('queues player commands for the next tick and gives AI only an observation', () => {
  result.current.dispatch({ type: 'move', dx: -1 });
  clock.advanceBy(1000 / 60);
  expect(stepSpy).toHaveBeenCalledWith(expect.anything(), [
    { tick: 1, side: 'player', command: { type: 'move', dx: -1 } },
    ...aiCommands,
  ]);
  expect(createAiObservationSpy).toHaveBeenCalledWith(expect.anything(), 'opponent');
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/app/use-match-loop.test.tsx`

Expected: FAIL because `useMatchLoop` is missing.

- [ ] **Step 3: Implement a 60 Hz accumulator without dropping judgment ticks**

```ts
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 8;

function advanceOneTick() {
  const tick = createPublicMatchView(stateRef.current).tick + 1;
  const observation = createAiObservation(stateRef.current, 'opponent');
  const aiCommands = aiRef.current.update(observation, tick);
  const playerCommands = drainCommandsForTick(tick);
  const step: MatchStep = stepMatch(stateRef.current, [...playerCommands, ...aiCommands]);
  stateRef.current = step.state;
  publish({ view: createPublicMatchView(step.state), events: step.events });
}
```

Advance at most eight steps per animation frame but retain remaining accumulator time for the next frame. When paused, stop stepping and reset the frame timestamp so a background interval is never converted into catch-up ticks. `dispatch` appends `{ tick: currentView.tick + 1, side: 'player', command }`. Map core statuses exactly: `player-won -> result win`, `opponent-won -> result loss`, `draw -> result draw`.

- [ ] **Step 4: Prove the runtime information boundary**

Extend the hook test with two core states that differ only in hidden RNG/queue data but yield equal `AiObservation` objects. Create two controllers with the same AI seed, advance one decision interval, and assert their emitted `TimedCommand[]` are equal. Assert the render subscriber receives only the `PublicMatchView` returned by `createPublicMatchView`. Barrel-only imports remain a code-review rule; do not add a test that merely greps source text.

- [ ] **Step 5: Run deterministic hook tests**

Run: `npm test -- src/app/use-match-loop.test.tsx`

Expected: PASS; pause reasons compose, background time consumes zero ticks, queued command order is stable, and no forbidden deep import exists.

- [ ] **Step 6: Commit**

Run `git add src/app/use-match-loop.ts src/app/use-match-loop.test.tsx src/ui/screens/MatchScreen.tsx`, then `git commit -m "feat: connect pure match core to React fixed-step loop"`.

### Task 5: Render Equal 10x20 Boards, HUD, and Ordered Effects with PixiJS WebGL

**Files:** Create `src/render/board-layout.ts`, `src/render/board-layout.test.ts`, `src/render/pixi-elements.ts`, `src/render/BattleCanvas.tsx`, `src/render/BoardScene.tsx`, `src/render/draw-primitives.ts`, `src/render/event-animation-queue.ts`, `src/render/event-animation-queue.test.ts`, `src/ui/match/BattleHud.tsx`, `src/ui/match/BattleHud.test.tsx`, and `src/ui/match/match-layout.css`; modify `src/ui/screens/MatchScreen.tsx`.

**Interfaces:**
- Consumes: `PublicMatchView`, `PublicSideView`, and `readonly GameEvent[]` from the core barrel.
- Produces: `computeBoardLayout(width: number, height: number): { player: Rect; opponent: Rect; gap: number }` and `<BattleCanvas view events selectedRow />`.

- [ ] **Step 1: Write failing equal-board and queue-order tests**

```ts
it.each([[328, 320], [398, 388]])('keeps both boards equal at %ix%i', (width, height) => {
  const layout = computeBoardLayout(width, height);
  expect(layout.player.width).toBe(layout.opponent.width);
  expect(layout.player.height).toBe(layout.opponent.height);
  expect(layout.player.height / layout.player.width).toBe(2);
});

it('drops decorative particles before ordered gameplay effects', () => {
  const queue = new EventAnimationQueue({ maxDecorative: 2 });
  queue.enqueue(events);
  expect(queue.orderedIds()).toEqual(['clear-1', 'attack-1', 'garbage-1']);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/render/board-layout.test.ts src/render/event-animation-queue.test.ts`

Expected: FAIL because layout and animation queue modules are missing.

- [ ] **Step 3: Implement one WebGL application for both boards**

```tsx
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text } from 'pixi.js';
extend({ Container, Graphics, Text });

<Application
  preference="webgl"
  width={metrics.width}
  height={metrics.height}
  autoDensity
  resolution={Math.min(window.devicePixelRatio, 2)}
  antialias={false}
  backgroundAlpha={0}
>
  <BoardScene side="player" model={view.sides.player} rect={layout.player} />
  <BoardScene side="opponent" model={view.sides.opponent} rect={layout.opponent} />
</Application>
```

Draw a 10x20 visible grid, fixed cells, active piece, ghost at `ghostY`, item markers, garbage, selected-row highlight, incoming attack, freeze overlay, line-clear flash, and individual garbage drops using Pixi v8 `Graphics` primitives. Hidden spawn rows never render. Use one canvas to avoid two mobile WebGL contexts; primitives remain the fallback if textures fail. Put the computed player/opponent width and height on the `[data-testid="battle-canvas"]` host dataset for layout E2E assertions.

- [ ] **Step 4: Add symmetric React HUDs**

Both sides display label, two `next` previews, combo, incoming amount, inventory, freeze ticks, phase, and top-out state from `view.sides.player` and `view.sides.opponent`. Do not expose AI observation/private future data. CSS computes canvas width as the smaller of available inline space and remaining vertical space after Safe Area, HUD, items, and controls.

- [ ] **Step 5: Run render tests**

Run: `npm test -- src/render src/ui/match/BattleHud.test.tsx; npm run typecheck`

Expected: PASS; layout tests cover both target portrait sizes, renderer preference is WebGL, and critical event ordering survives decorative-particle reduction.

- [ ] **Step 6: Commit**

Run `git add src/render src/ui/match src/ui/screens/MatchScreen.tsx`, then `git commit -m "feat: render symmetric PvE boards with PixiJS"`.

### Task 6: Add Item HUD Actions and Drag-to-Select Row Clearing

**Files:** Create `src/ui/match/ItemControls.tsx`, `src/ui/match/RowSelector.tsx`, `src/ui/match/row-selection.ts`, `src/ui/match/row-selection.test.ts`, and `src/ui/match/ItemControls.test.tsx`; modify `src/render/BattleCanvas.tsx` and `src/ui/screens/MatchScreen.tsx`.

**Interfaces:**
- Consumes: `PublicSideView.inventory`, `PublicSideView.phase`, and `dispatch(command: GameCommand)`.
- Produces: `rowAtPointer(clientY: number, boardRect: DOMRect): number | null`, with row 0 at the top and row 19 at the bottom.

- [ ] **Step 1: Write failing row-selection tests**

```ts
expect(rowAtPointer(100, rect(0, 100, 160, 320))).toBe(0);
expect(rowAtPointer(419.9, rect(0, 100, 160, 320))).toBe(19);
expect(rowAtPointer(420, rect(0, 100, 160, 320))).toBeNull();
```

Component tests must prove that a blank row does not dispatch or consume, a valid release dispatches `{ type: 'use-row-clear', row }`, and releasing outside cancels selection.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/ui/match/row-selection.test.ts src/ui/match/ItemControls.test.tsx`

Expected: FAIL because the selector and controls are missing.

- [ ] **Step 3: Implement exact item commands**

```ts
const useFreeze = () => dispatch({ type: 'use-freeze' });
const useQueueSwap = () => dispatch({ type: 'use-queue-swap' });
const confirmRow = (row: number) => dispatch({ type: 'use-row-clear', row });
```

Enable controls only when `view.sides.player.phase === 'active'` and the corresponding inventory/charge is available. Entering row-select mode does not dispatch or decrement anything. During pointer movement, highlight the nearest visible player row; on release, dispatch only when the row has at least one fixed block. Leave selection active after an empty-row release, and cancel on outside release or the explicit `취소` button. Inventory changes only when a later core view confirms consumption.

- [ ] **Step 4: Display both sides' item behavior**

Player buttons show row-clear count, freeze count, and queue-swap charges. AI acquisition/use, marker glow, freeze overlay, and queue swaps are render-only reactions to `PublicSideView` plus `GameEvent`; no AI-only button exists.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/ui/match/row-selection.test.ts src/ui/match/ItemControls.test.tsx`

Expected: PASS; valid selection emits one command, empty/outside interactions emit none, and queue-swap charge text follows the core view.

- [ ] **Step 6: Commit**

Run `git add src/ui/match src/render/BattleCanvas.tsx src/ui/screens/MatchScreen.tsx`, then `git commit -m "feat: add battle item controls and row targeting"`.

### Task 7: Implement the Portrait Pointer Joystick and Single-Press Rotation

**Files:** Create `src/ui/match/joystick-controller.ts`, `src/ui/match/joystick-controller.test.ts`, `src/ui/match/Joystick.tsx`, `src/ui/match/RotateButton.tsx`, `src/ui/match/RotateButton.test.tsx`, and `src/ui/match/controls.css`; modify `src/ui/screens/MatchScreen.tsx`.

**Interfaces:**
- Consumes: `(command: GameCommand) => void` and a shared `InputResetBus` added in this task.
- Produces: `JoystickController.update(dx, dy, radius)`, `JoystickController.release()`, and `resetAll()`.

- [ ] **Step 1: Write failing timer and direction tests**

```ts
controller.update(21, 0, 100); // immediate right
expect(commands).toEqual([{ type: 'move', dx: 1 }]);
vi.advanceTimersByTime(159);
expect(commands).toHaveLength(1);
vi.advanceTimersByTime(1);
expect(commands.at(-1)).toEqual({ type: 'move', dx: 1 });
vi.advanceTimersByTime(50);
expect(commands.at(-1)).toEqual({ type: 'move', dx: 1 });
```

Also test 20% neutral, horizontal tie priority, down-axis soft-drop activation/deactivation, 80% upward hard-drop once, hard-drop rearm only after neutral/release, fast reversal, pointer cancel, lost capture, blur, visibility change, and unmount.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/ui/match/joystick-controller.test.ts`

Expected: FAIL because `JoystickController` does not exist.

- [ ] **Step 3: Implement exact command timing**

Horizontal threshold crossing emits one `{ type: 'move', dx }`, starts repeat after 160 ms, then repeats every 50 ms. Dominant downward input emits `{ type: 'soft-drop', active: true }` once and leaving it emits `{ type: 'soft-drop', active: false }`; the core owns its 50 ms cadence. Dominant upward input crossing 80% emits one `{ type: 'hard-drop' }`. Equal absolute axes choose horizontal.

Use one Pointer Events path for mouse and touch, call `setPointerCapture`, and route `pointerup`, `pointercancel`, `lostpointercapture`, `window.blur`, `document.visibilitychange`, and cleanup through `resetAll()`.

- [ ] **Step 4: Add rotation without key-repeat behavior**

`RotateButton` emits `{ type: 'rotate-clockwise' }` only on `pointerdown`; holding it has no interval and no second emission.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/ui/match/joystick-controller.test.ts src/ui/match/RotateButton.test.tsx`

Expected: PASS; fake timers show the exact 160/50 ms behavior and every cancellation path releases soft drop and repeats.

- [ ] **Step 6: Commit**

Run `git add src/ui/match src/ui/screens/MatchScreen.tsx`, then `git commit -m "feat: add mobile battle joystick and rotate control"`.

### Task 8: Coordinate Background Lifecycle, Resume Countdown, Exit, Audio, and Haptics

**Files:** Create `src/platform/app-lifecycle.ts`, `src/platform/app-lifecycle.test.ts`, `src/platform/audio-port.ts`, `src/platform/web-audio-port.ts`, `src/platform/web-audio-port.test.ts`, `src/ui/match/ResumeCountdown.tsx`, `src/ui/match/ExitConfirmation.tsx`, `src/ui/match/SettingsPanel.tsx`, and `src/ui/match/lifecycle-ui.test.tsx`; modify `src/ui/screens/MatchScreen.tsx` and `src/app/AppRoot.tsx`.

**Interfaces:**
- Consumes: `MatchLoopView.setPaused`, `InputResetBus.resetAll`, `PlatformPort.close/haptic`, and persisted sound/haptic settings.
- Produces:

```ts
export type SoundCue = 'move' | 'rotate' | 'land' | 'clear' | 'attack' | 'item' | 'win' | 'loss';
export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
```

- [ ] **Step 1: Write failing lifecycle tests**

```ts
document.dispatchEvent(new Event('visibilitychange'));
expect(match.setPaused).toHaveBeenCalledWith('background', true);
expect(resetAll).toHaveBeenCalled();
expect(audio.suspend).toHaveBeenCalled();
```

Test that foreground shows `3`, `2`, `1`, keeps core/AI paused for all three seconds, then resumes both at once. Test that exit open pauses with `exit-confirmation`, cancel resumes without closing, and confirm calls `platform.close()` exactly once.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/platform/app-lifecycle.test.ts src/ui/match/lifecycle-ui.test.tsx`

Expected: FAIL because lifecycle components are missing.

- [ ] **Step 3: Implement lifecycle coordination**

Handle `visibilitychange`, `pagehide`, and `window.blur`. Background entry pauses the match, resets every held input, and suspends Web Audio. Foreground entry starts a wall-clock UI countdown while match time remains paused; reset the match-loop frame timestamp before clearing the pause reason.

Provide an in-app `게임 나가기` action. It opens a React dialog (`role="dialog"`, focus trapped) and pauses both sides before asking. The confirm handler awaits `closeView()` through `PlatformPort.close`; it never mutates browser history. Keep the SDK game navigation X visible through `webViewProps.type='game'`; verify its native confirmation separately in QR QA.

- [ ] **Step 4: Implement original procedural sound and event haptics**

Use a lazily created `AudioContext` and short oscillator/envelope cues; include no downloaded music or sound file. Unlock only after a user gesture. Map significant `GameEvent` values to sound/haptic cues, pause immediately in background, and resume only after the countdown. Haptics call `generateHapticFeedback` through the platform port only when enabled; rejected haptic/audio calls remain non-fatal.

Settings expose sound and haptic toggles, persist through `ProgressRepository.save`, and never open automatically on entry.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/platform src/ui/match/lifecycle-ui.test.tsx; npm run typecheck`

Expected: PASS; no hidden time is consumed, all held inputs reset, exit confirmation precedes close, sound stops in background, and disabled settings emit neither sound nor haptic.

- [ ] **Step 6: Commit**

Run `git add src/platform src/ui/match src/ui/screens/MatchScreen.tsx src/app/AppRoot.tsx`, then `git commit -m "feat: add game lifecycle audio and confirmed exit"`.

### Task 9: Add Playwright Coverage and the `.ait`/Sandbox/QR Release Gate

**Files:** Create `playwright.config.ts`, `.env.e2e`, `src/test-support/e2e-driver.ts`, `src/test-support/e2e-platform.ts`, `tests/e2e/app-flow.spec.ts`, `tests/e2e/portrait-layout.spec.ts`, `tests/e2e/lifecycle-controls.spec.ts`, `scripts/verify-ait-package.mjs`, and `docs/qa/apps-in-toss-private-qr.md`; modify `src/app/app-services.ts`.

**Interfaces:**
- Consumes: dependency-injected platform/match services from prior tasks.
- Produces an E2E-only `window.__TE_PPU_E2E__` driver with `dispatchedCommands`, `setLifecycle('hidden' | 'visible')`, `finish('win' | 'loss' | 'draw')`, and `closeCount`.

- [ ] **Step 1: Configure the two required portrait projects**

```ts
export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'npm run dev:e2e', port: 5173, reuseExistingServer: false },
  projects: [
    { name: 'portrait-360x640', use: { browserName: 'chromium', viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true } },
    { name: 'portrait-430x932', use: { browserName: 'webkit', viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
  ],
});
```

`.env.e2e` sets `VITE_RUNTIME_MODE=browser` and `VITE_E2E_DRIVER=true`. Production/App modes must not install or expose the E2E driver.

- [ ] **Step 2: Write failing end-to-end checks**

```ts
test('shows equal boards and a usable screen under ten seconds', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);
  await page.getByRole('button', { name: '1층 선택' }).click();
  await page.getByRole('button', { name: '대전 시작' }).click();
  const sizes = await page.getByTestId('battle-canvas').evaluate((node) => ({
    player: [node.dataset.playerBoardWidth, node.dataset.playerBoardHeight],
    opponent: [node.dataset.opponentBoardWidth, node.dataset.opponentBoardHeight],
  }));
  expect(sizes.player).toEqual(sizes.opponent);
});
```

Add tests for tower -> floor intro -> match -> win/loss/draw routing, joystick command order, single rotation, valid/empty/outside row selection, Safe Area CSS variables, background pause/resume countdown, audio suspension, and confirmed close.

- [ ] **Step 3: Verify E2E failure, then add the test driver**

Run: `npm run test:e2e`

Expected before driver: FAIL because `window.__TE_PPU_E2E__` is absent.

Implement the E2E driver only behind `import.meta.env.VITE_E2E_DRIVER === 'true'`, rerun, and expect both portrait projects to pass with no horizontal overflow and equal board rectangles.

- [ ] **Step 4: Add a deterministic `.ait` size gate**

```js
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

async function findAitFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findAitFiles(path));
    else if (entry.name.endsWith('.ait')) found.push(path);
  }
  return found;
}
const files = await findAitFiles(process.cwd());
if (files.length !== 1) throw new Error(`Expected exactly one .ait file, found ${files.length}`);
const [path] = files;
const entries = unzipSync(new Uint8Array(await readFile(path)));
const bytes = Object.values(entries).reduce((sum, value) => sum + value.byteLength, 0);
if (bytes > 100 * 1024 * 1024) throw new Error(`Uncompressed bundle is ${bytes} bytes; limit is 104857600`);
console.log(`AIT_OK ${path} ${bytes}`);
```

- [ ] **Step 5: Run the automated preflight**

Run `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build:ait`, and `npm run check:ait` separately; each must exit 0. Then run `rg -n "eval\(|new Function|WebGPU|ReactDOMServer|<iframe" src` and require exit 1 with no output.

Expected: both Playwright projects pass; exactly one generated `.ait` exists; `check:ait` prints `AIT_OK` below 104857600 bytes; the source-policy scan finds nothing.

- [ ] **Step 6: Prepare and, when credentials/devices are available, record the private-device gate**

Write `docs/qa/apps-in-toss-private-qr.md` with checkboxes and exact expected results for:

1. Latest Android and iOS sandbox launch the `.ait` build and return a mock game user key without boot failure.
2. Console private QR launches on the real Toss app and returns a stable HASH identity; `INVALID_CATEGORY`, `ERROR`, and unsupported app-version screens are not observed.
3. Portrait lock, Dynamic Island/Safe Area, native game X, in-app exit confirmation, and `closeView()` work without overlap.
4. Both 10x20 boards remain equal and visible at once; joystick, rotation, all three items, AI item effects, incoming/offset/return effects, and resume countdown are usable.
5. Backgrounding immediately stops match ticks, AI, item timers, sound, and held input; foreground resumes only after 3-2-1.
6. A ten-minute match shows no sustained frame collapse, white screen, runaway memory growth, or lost WebGL context; decorative particles reduce before critical effects disappear.
7. The first usable screen appears within 10 seconds and no bottom sheet opens automatically.
8. The build remains marked private and is not submitted for public review.

Expected for repository completion: every automated command passes and the checklist clearly marks device-only items `PENDING_EXTERNAL` rather than inventing evidence. Expected before any Apps-in-Toss release claim: a workspace member runs the sandbox and real-Toss private QR checks and attaches device/build/deployment evidence for every checkbox.

- [ ] **Step 7: Commit**

Run `git add playwright.config.ts .env.e2e src/test-support tests/e2e scripts/verify-ait-package.mjs docs/qa/apps-in-toss-private-qr.md src/app/app-services.ts`, then `git commit -m "test: gate portrait Apps-in-Toss prototype delivery"`.

---

## Final Verification

- [ ] Run `npm run typecheck` — expected: exit 0.
- [ ] Run `npm test` — expected: all Vitest suites pass with 0 failures.
- [ ] Run `npm run test:e2e` — expected: both 360x640 Chromium and 430x932 WebKit projects pass.
- [ ] Run `npm run build:ait`, then run `npm run check:ait` — expected: exactly one `.ait` exists and prints `AIT_OK` under the 100 MB uncompressed limit.
- [ ] Review `docs/qa/apps-in-toss-private-qr.md` — expected: automated evidence is recorded, unavailable sandbox/real-Toss device checks are explicitly `PENDING_EXTERNAL`, and public-release submission remains excluded.
