# 타워 라이벌 연속 대전과 아케이드 전투 정체성 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-driven three-opponent gauntlet to every tower floor and make the tower, battle HUD, character reactions, attack flow, and exit lifecycle communicate the fight at a glance.

**Architecture:** Keep `src/core` and `src/ai` authoritative for one puzzle match. Add a pure encounter catalog and a `TowerController`-owned in-memory series state that starts a fresh core match for each opponent and unlocks a floor only after its third win. Move the authored character roster into a shared asset bundle, then let the route/screens consume the selected encounter while Pixi and React continue to render only public match state and presentation events.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Playwright, PixiJS 8, Vite, Pillow asset validation, original transparent WebP character masters.

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on branch `feat/pve-delivery`.
- Use the existing 5 floors. Every `FLOOR_ENCOUNTERS[floor]` contains exactly 3 distinct encounter indices; `demon-king` is encounter index `2` on floor `5`.
- A floor win is committed only after the third encounter returns `WIN`. `LOSS` or `DRAW` clears the in-memory series and never unlocks a floor.
- Do not persist `MatchState`, AI state, match seeds, or `FloorSeriesState`.
- Do not change block rules, attack arithmetic, AI observation privacy, or `GameCommand` contracts in `src/core` and `src/ai`.
- Use original artwork only. Do not copy Puyo Puyo/SEGA characters, logos, sprites, sounds, exact text, or exact UI composition.
- Authored assets remain optional at runtime; missing assets must retain the existing procedural/fallback path.
- Use authored asset manifest schema `2` for the expanded roster and continue accepting the existing schema `1` procedural-fallback manifest.
- Add 3 original rivals: `clock-moth`, `glass-oracle`, and `moss-golem`. The authored manifest must contain 106 unique runtime assets after the migration.
- Do not visually expose combo, incoming, freeze tick, match tick, AI reaction interval, or internal inventory counts as numeric telemetry. Keep current hidden `data-testid` values for tests and screen-reader state.
- Use a 1,200ms UI timeout around `platform.close()`; close attempts are guarded against duplicate confirmation clicks.
- Preserve portrait support at 360×640 and 430×932, with both 10×20 boards visible at equal size.
- Every implementation task follows TDD: write the failing test, run it and confirm the expected failure, implement the smallest passing change, run the focused test, then run the relevant regression suite and commit.

---

## Planned File Structure

### Shared character and asset data

- Create: `src/progression/encounters.ts` — floor encounter catalog, display names, titles, story lines, `EncounterIndex`, and `FloorSeriesState`.
- Modify: `src/progression/index.ts` — export encounter types and catalog helpers.
- Modify: `src/assets/types.ts` — add the 8-rival character union and `CommonAssets.rivals`; replace the single floor-character assumption with common character bundles.
- Modify: `src/assets/manifest.ts` — parse authored manifest schema 2, with all rival character refs under `common.characters` and three encounter IDs per floor.
- Modify: `src/assets/asset-manager.ts` — load all common character bundles once and load floor backgrounds/music metadata without duplicating character refs.
- Modify: `src/assets/index.ts` — export the new manifest and character bundle types.
- Modify: `public/assets/manifest.json` — point to schema 2 and list the complete 8-rival roster.
- Modify: `scripts/validate-assets.mjs`, `scripts/validate-assets.test.mjs` — validate schema 2, all character paths, exact portrait states, and the 106 unique asset count.
- Modify: `scripts/generate-authored-assets.py` — derive `clock-moth`, `glass-oracle`, and `moss-golem` portrait states from their masters.
- Create: `public/assets/characters/clock-moth/full.webp`, `public/assets/characters/glass-oracle/full.webp`, `public/assets/characters/moss-golem/full.webp` — original transparent 1024×1024 masters generated with the image-generation skill and then checked into the authored pack.

### Series progression and routing

- Create: `src/progression/series.ts` — pure start/resolve functions for one floor’s three encounters.
- Modify: `src/progression/tower.ts` — apply floor progress only for the third win.
- Modify: `src/app/towerController.ts` — own the in-memory series, selected encounter, fresh match, AI, and save boundary.
- Modify: `src/app/app-route.ts` — include `encounterIndex`, `wins`, and `seriesComplete` in intro/match/result routes.
- Modify: `src/app/AppRoot.tsx` — pass selected encounter metadata/assets and call `completeEncounter`.
- Modify: `src/ui/screens/FloorIntroScreen.tsx`, `src/ui/screens/ResultScreen.tsx`, `src/ui/screens/MatchScreen.tsx` — consume the selected encounter rather than assuming one opponent per floor.

### Screens, HUD, and battle presentation

- Create: `src/ui/characters/CharacterPortrait.tsx` — accessible portrait image/fallback with explicit state and role data.
- Create: `src/ui/characters/CharacterPortrait.test.tsx` — image, fallback, alt text, and state tests.
- Create: `src/ui/characters/CharacterStrip.tsx` — three-encounter strip for tower and intro/result screens.
- Create: `src/ui/characters/CharacterStrip.test.tsx` — order, active encounter, cleared, and locked states.
- Modify: `src/ui/screens/TowerScreen.tsx`, `src/ui/screens/FloorIntroScreen.tsx`, `src/ui/screens/ResultScreen.tsx`, `src/ui/screens/EndingScreen.tsx`, `src/ui/screens/screens.css` — make the demon-king silhouette, owl mascot, and current rivals visible without crowding the actions.
- Create: `src/render/attack-ribbon.ts`, `src/render/attack-ribbon.test.ts` — deterministic geometry for the central attack signal and fallback impact ring.
- Modify: `src/ui/match/portrait-state.ts`, `src/ui/match/BattleHud.tsx`, `src/ui/match/BattleHud.test.tsx`, `src/ui/match/match-layout.css`, `src/ui/screens/MatchScreen.tsx` — render named 48–64px character plates and compact non-numeric status.
- Modify: `src/render/BattleCanvas.tsx`, `src/render/battle-animation-registry.ts`, `src/render/event-animation-queue.ts`, `src/render/event-animation-queue.test.ts` — enlarge/reposition attack presentation while preserving critical event order and atlas fallback.

### Exit lifecycle and verification

- Create: `src/platform/close-with-timeout.ts`, `src/platform/close-with-timeout.test.ts` — one 1,200ms close attempt with success, rejection, timeout, and duplicate-attempt behavior.
- Modify: `src/ui/match/ExitConfirmation.tsx`, `src/ui/match/lifecycle-ui.test.tsx`, `src/ui/match/match-layout.css` — add `idle/closing/failed` UI states and retry behavior.
- Modify: `src/test-support/e2e-driver.ts`, `src/test-support/e2e-match.tsx`, `tests/e2e/app-flow.spec.ts`, `tests/e2e/lifecycle-controls.spec.ts`, `tests/e2e/portrait-layout.spec.ts` — drive three forced encounters and assert visible identity/layout.
- Modify: `docs/qa/apps-in-toss-private-qr.md` — add manual checks for the three-encounter transition, character visibility, attack signal, and close timeout.

---

### Task 1: Add the encounter catalog and migrate the authored character manifest

**Files:**

- Create: `src/progression/encounters.ts`
- Create: `tests/progression/encounters.test.ts`
- Modify: `src/progression/index.ts`
- Modify: `src/assets/types.ts`
- Modify: `src/assets/manifest.ts`
- Modify: `src/assets/index.ts`
- Modify: `src/assets/asset-manager.ts`
- Modify: `src/assets/asset-manager.test.ts`
- Modify: `public/assets/manifest.json`
- Modify: `scripts/validate-assets.mjs`
- Modify: `scripts/validate-assets.test.mjs`
- Modify: `scripts/generate-authored-assets.py`
- Create: `public/assets/characters/clock-moth/full.webp`
- Create: `public/assets/characters/glass-oracle/full.webp`
- Create: `public/assets/characters/moss-golem/full.webp`

**Interfaces:**

- Produces `EncounterIndex = 0 | 1 | 2` and `FloorSeriesState = { floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2 }`.
- Produces `FloorEncounter = { floor; index; characterId; displayName; title; intro; winLine; lossLine }`.
- Produces `getFloorEncounters(floor): readonly [FloorEncounter, FloorEncounter, FloorEncounter]` and `getFloorEncounter(floor, index): FloorEncounter`.
- Extends `FloorOpponentId` to `'quartermaster' | 'alchemist' | 'guard-captain' | 'dark-engineer' | 'clock-moth' | 'glass-oracle' | 'moss-golem' | 'demon-king'`.
- `CommonAssets.rivals` becomes `Partial<Record<FloorOpponentId, RivalCharacterAssets>>`, where each rival has `fullArt?: LoadedImageRef` and portrait refs for `idle/smug/attack/hit/panic/defeat` or `idle/attack/hit/rage/defeat` for the demon king.
- Authored schema 2 stores all character refs in `common.characters` and each floor as `{ background, music, encounters: [characterId, characterId, characterId] }`; it does not repeat a character path in multiple canonical slots.

- [ ] **Step 1: Write the failing encounter catalog tests.**

```ts
import { describe, expect, it } from 'vitest';
import { FLOORS, getFloorEncounter, getFloorEncounters } from '../../src/progression';

describe('floor encounter catalog', () => {
  it('contains three ordered encounters for every floor', () => {
    for (const floor of FLOORS) {
      const encounters = getFloorEncounters(floor);
      expect(encounters).toHaveLength(3);
      expect(encounters.map(({ index }) => index)).toEqual([0, 1, 2]);
      expect(new Set(encounters.map(({ characterId }) => characterId)).size).toBe(3);
      expect(encounters.every(({ floor: entryFloor }) => entryFloor === floor)).toBe(true);
    }
  });

  it('puts the demon king at the third encounter of the final floor', () => {
    expect(getFloorEncounter(5, 2)).toMatchObject({
      characterId: 'demon-king',
      displayName: '탑의 마왕 녹스',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the expected red failure.**

Run: `npm test -- tests/progression/encounters.test.ts`

Expected: FAIL because `src/progression/encounters.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure catalog and shared IDs.**

Define the 15 fixed slots as five arrays of three entries. Use these exact new rival entries: `clock-moth` / `시계나방 틱`, `glass-oracle` / `유리 예언자 프리즘`, and `moss-golem` / `이끼 골렘 모스`. Keep the existing four lieutenants and `demon-king` IDs. Make `getFloorEncounters` return the frozen catalog array and `getFloorEncounter` throw `RangeError('Invalid floor encounter.')` for an index other than `0`, `1`, or `2`.

- [ ] **Step 4: Run the focused test and confirm green.**

Run: `npm test -- tests/progression/encounters.test.ts`

Expected: the catalog tests pass with 5 floors × 3 encounter entries and no duplicate character ID within a floor.

- [ ] **Step 5: Write the failing schema-2 manifest tests.**

Extend `scripts/validate-assets.test.mjs` fixture construction so `completeManifest()` represents schema 2 and includes all eight rival character bundles under `common.characters`. Add tests that reject a floor with two encounter IDs, a manifest missing a rival portrait, a duplicate canonical character path, and an authored manifest with the old schema 1 shape.

- [ ] **Step 6: Run the asset validator tests and confirm the expected red failure.**

Run: `node --test scripts/validate-assets.test.mjs`

Expected: FAIL because the parser/validator still requires schema 1, floor-level `character`, and a 2-character common roster.

- [ ] **Step 7: Migrate the manifest and asset manager to the shared roster.**

Update `parseAssetManifest` and the Node validator to accept schema 2 assets, require the exact eight-rival key set, require exactly three encounter IDs per floor, and set `REQUIRED_UNIQUE_ASSET_COUNT = 106`. Keep `{ schemaVersion: 1, mode: 'procedural-fallback' }` valid. Update `CommonAssets` and `FloorAssetBundle` so `runCommon` loads hero, owl, and all rival full/portrait refs; `runFloor` loads only the background and metadata. Release/destroy must clear the same generation-owned resources as before.

Update `scripts/generate-authored-assets.py` so the new character IDs are included in `PORTRAITS` with the lieutenant state list. Generate the three original transparent masters with the image-generation skill, save them as 1024×1024 WebP files, then run the derivative generator to create 256×256 portraits. Do not use any official game asset as a source image.

- [ ] **Step 8: Run the asset tests and validate the authored pack.**

Run: `node --test scripts/validate-assets.test.mjs`

Run: `npm run check:assets`

Expected: all manifest fixtures pass, the authored manifest reports `106` unique assets, and every new character has the required full-art and portrait dimensions.

- [ ] **Step 9: Commit the catalog and asset contract.**

```powershell
git add src/progression/encounters.ts src/progression/index.ts tests/progression/encounters.test.ts src/assets public/assets/manifest.json scripts/validate-assets.mjs scripts/validate-assets.test.mjs scripts/generate-authored-assets.py public/assets/characters/clock-moth public/assets/characters/glass-oracle public/assets/characters/moss-golem
git commit -m "feat: add tower encounter catalog and rival asset roster"
```

---

### Task 2: Implement pure three-encounter series resolution

**Files:**

- Create: `src/progression/series.ts`
- Create: `tests/progression/series.test.ts`
- Modify: `src/progression/tower.ts`
- Modify: `src/progression/index.ts`

**Interfaces:**

- Produces `startFloorSeries(floor): FloorSeriesState`.
- Produces `resolveEncounter(series, result): { kind: 'next-encounter'; series; encounter } | { kind: 'floor-win'; floor } | { kind: 'series-loss'; floor }`.
- `WIN` at encounter indices `0` and `1` returns the next encounter with wins `1` and `2` respectively.
- `WIN` at index `2` returns `floor-win`; `LOSS` and `DRAW` return `series-loss` at any index.

- [ ] **Step 1: Write failing series tests.**

```ts
import { describe, expect, it } from 'vitest';
import { resolveEncounter, startFloorSeries } from '../../src/progression/series';

describe('three-encounter series', () => {
  it('requires three wins before resolving a floor win', () => {
    const first = startFloorSeries(2);
    const second = resolveEncounter(first, 'WIN');
    const third = second.kind === 'next-encounter'
      ? resolveEncounter(second.series, 'WIN')
      : second;
    const final = third.kind === 'next-encounter'
      ? resolveEncounter(third.series, 'WIN')
      : third;

    expect(second).toMatchObject({ kind: 'next-encounter', series: { wins: 1, encounterIndex: 1 } });
    expect(third).toMatchObject({ kind: 'next-encounter', series: { wins: 2, encounterIndex: 2 } });
    expect(final).toEqual({ kind: 'floor-win', floor: 2 });
  });

  it.each(['LOSS', 'DRAW'] as const)('resets the series on %s', (result) => {
    expect(resolveEncounter({ floor: 2, encounterIndex: 1, wins: 1 }, result))
      .toEqual({ kind: 'series-loss', floor: 2 });
  });
});
```

- [ ] **Step 2: Run the test and confirm red.**

Run: `npm test -- tests/progression/series.test.ts`

Expected: FAIL because `src/progression/series.ts` is missing.

- [ ] **Step 3: Implement the minimal pure resolver.**

Use the catalog helper to return the next encounter. Never mutate the input series. Reject an invalid `encounterIndex`/`wins` combination with `RangeError('Invalid floor series.')` so controller corruption cannot silently unlock a floor.

- [ ] **Step 4: Run the focused and progression tests.**

Run: `npm test -- tests/progression/series.test.ts tests/progression/tower.test.ts`

Expected: PASS, with existing `applyFloorResult` behavior unchanged for the final floor result.

- [ ] **Step 5: Commit the pure progression unit.**

```powershell
git add src/progression/series.ts src/progression/tower.ts src/progression/index.ts tests/progression/series.test.ts
git commit -m "feat: resolve three-encounter tower series"
```

---

### Task 3: Connect the series to `TowerController` and routes

**Files:**

- Modify: `src/app/towerController.ts`
- Modify: `tests/app/towerController.test.ts`
- Modify: `src/app/app-route.ts`
- Modify: `src/app/app-route.test.ts`
- Modify: `src/app/AppRoot.tsx`
- Modify: `src/app/AppRoot.test.tsx`

**Interfaces:**

- `TowerController.startFloor(floor, seed)` returns `{ ok: true, match, encounter, series }` and sets route `MATCH`.
- `TowerController.startEncounter(seed)` returns `{ ok: true, match, encounter, series }` for the active series without resetting its `wins` or `encounterIndex`, and sets route `MATCH`; it rejects when no series is active.
- `TowerController.currentSeries` returns `FloorSeriesState | null`.
- `TowerController.currentEncounter` returns `FloorEncounter | null`.
- `TowerController.completeEncounter(result)` returns the existing save-result shape plus `{ route, encounter, series, floorCompleted }`.
- Intermediate `WIN` returns route `FLOOR_INTRO`, keeps the in-memory series, and performs no repository save.
- Third `WIN` applies `applyFloorResult`, clears live match/AI/series, routes to `RESULT_WIN` or `ENDING`, and persists once.
- `LOSS`/`DRAW` route to `RESULT_LOSS`/`RESULT_DRAW`, clear series, and do not persist unchanged progress.
- `AppRoute` payloads are:

```ts
type AppRoute =
  | { name: 'floor-intro'; floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2 }
  | { name: 'match'; floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2; seed: number }
  | { name: 'result'; floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2; result: MatchResult; seriesComplete: boolean }
  // plus the existing boot/tower/ending variants
```

- [ ] **Step 1: Replace the single-win controller tests with failing three-win tests.**

Add tests that call `startFloor(1, 10)`, then `completeEncounter('WIN')` twice and assert no repository save, `currentSeries.wins` becomes `2`, and the returned next encounter index is `2`. Call `completeEncounter('WIN')` a third time and assert the floor unlocks, the repository has exactly one save, `match`, `ai`, and `currentSeries` are null, and the route is `RESULT_WIN`. Add a loss after one win and assert the series returns to null without changing progress.

- [ ] **Step 2: Run the controller and route tests and confirm red.**

Run: `npm test -- tests/app/towerController.test.ts src/app/app-route.test.ts`

Expected: FAIL because the controller still exposes `completeFloor` and the routes do not carry encounter metadata.

- [ ] **Step 3: Implement controller series state and fresh-match transitions.**

Keep `startFloor` as the public entry point for a new floor attempt: initialize `currentSeries` at encounter `0`, then delegate to public `startEncounter(seed)`. Implement `startEncounter(seed)` as the reusable fresh-match transition for the active series; it reads `currentSeries`, creates a fresh `MatchState`, derives a fresh AI seed from the supplied match seed, and returns the selected `FloorEncounter` without resetting series progress. Implement `completeEncounter` by calling `resolveEncounter`; only the `floor-win` branch calls `applyFloorResult` and `persistCurrentProgress`. `restartFloor` calls `startFloor` and therefore resets the series to encounter `0`.

- [ ] **Step 4: Implement route reduction for intermediate results.**

`match-finished` creates a result route carrying the current encounter index, current wins, result, and `seriesComplete = result === 'win' && encounterIndex === 2`. `continue` from a non-final win returns the next `floor-intro` with `encounterIndex + 1` and `wins + 1`; `continue` from a loss/draw returns `tower`; `continue` from a completed floor returns `tower` or `ending` for floor 5.

- [ ] **Step 5: Update `AppRoot` completion and props.**

Call `controller.completeEncounter(toControllerResult(result))` from `finishMatch`. On the first intro, call `startFloor`; on an intermediate-win intro, call `startEncounter(seed)` so the current series advances to the selected encounter without being reset. Pass `getFloorEncounter(route.floor, route.encounterIndex)` to intro, match, and result screens. Pass `commonAssets.rivals[encounter.characterId]` as the selected rival asset bundle. Keep the existing save-pending/retry UI only for the third-win save path. Add a controller test proving `startEncounter` preserves the intermediate `wins` value.

- [ ] **Step 6: Run focused regression tests.**

Run: `npm test -- tests/app/towerController.test.ts src/app/app-route.test.ts src/app/AppRoot.test.tsx tests/progression`

Expected: PASS with no unlock after one or two wins and exactly one persisted unlock after the third win.

- [ ] **Step 7: Commit the progression and route integration.**

```powershell
git add src/app/towerController.ts tests/app/towerController.test.ts src/app/app-route.ts src/app/app-route.test.ts src/app/AppRoot.tsx src/app/AppRoot.test.tsx
git commit -m "feat: connect tower routes to three-encounter series"
```

---

### Task 4: Make the tower and interstitial screens character-first

**Files:**

- Create: `src/ui/characters/CharacterPortrait.tsx`
- Create: `src/ui/characters/CharacterPortrait.test.tsx`
- Create: `src/ui/characters/CharacterStrip.tsx`
- Create: `src/ui/characters/CharacterStrip.test.tsx`
- Create: `src/ui/screens/TowerScreen.test.tsx`
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/ResultScreen.tsx`
- Modify: `src/ui/screens/EndingScreen.tsx`
- Modify: `src/ui/screens/screens.css`
- Modify: `src/app/AppRoot.tsx`

**Interfaces:**

- `CharacterPortrait` accepts `{ image?: LoadedImageRef; alt: string; state: PortraitState; className?: string }` and renders either the image or the existing visible fallback block. The fallback still exposes the state in an accessible label.
- `CharacterStrip` accepts `{ encounters: readonly FloorEncounter[]; rivals: CommonAssets['rivals']; activeIndex: EncounterIndex; unlocked: boolean; }` and renders exactly three ordered portrait nodes.
- `TowerScreen` shows the `demon-king` full art as a low-opacity tower silhouette, `owl-companion` as the guide mascot, and a `CharacterStrip` for every floor. It retains the existing `1층 선택` button labels and disabled behavior.
- `FloorIntroScreen` receives `encounter`, `series`, `rival`, and `background` separately. It shows the current rival’s full art/portrait, title, intro line, and a compact `wins/3` progress badge.
- `ResultScreen` shows the current rival’s win/loss line; for intermediate wins its continue button says `다음 상대`, and for a completed floor it says `다음 층`/`탑으로` according to route.

- [ ] **Step 1: Write failing portrait and strip tests.**

Test that `CharacterPortrait` renders an `<img>` with the supplied URL and state, uses the fallback label when no URL exists, and that `CharacterStrip` renders three portraits in encounter order with only the active index marked `data-encounter-state="active"`.

- [ ] **Step 2: Run focused UI tests and confirm red.**

Run: `npm test -- src/ui/characters/CharacterPortrait.test.tsx src/ui/characters/CharacterStrip.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the shared portrait and strip components.**

Use `AssetImage` for image/fallback behavior, never duplicate image-loading logic in screens, and keep names/roles in visible text rather than image pixels.

- [ ] **Step 4: Write failing tower and screen assertions.**

Add `TowerScreen.test.tsx` assertions for `탑의 마왕 녹스`, the owl mascot, all three floor-one rival names, and locked floor buttons. Update intro/result tests to assert the current encounter title and story line instead of `AI 반응 간격: ...`.

- [ ] **Step 5: Run screen tests and confirm the expected red failure.**

Run: `npm test -- src/ui/screens/TowerScreen.test.tsx src/ui/screens/ScreenBackdrop.test.tsx src/ui/screens`

Expected: FAIL because the current screens only render one floor opponent name and the AI telemetry string.

- [ ] **Step 6: Implement the character-first screen composition.**

Update `AppRoot` to pass common rival assets and selected encounter data. Keep action buttons and existing `data-testid` values. Use CSS grid layers so at 360×640 the selected encounter and primary action remain visible without making the demon silhouette interactive.

- [ ] **Step 7: Run focused and route UI tests.**

Run: `npm test -- src/ui/characters src/ui/screens src/app/AppRoot.test.tsx src/app/app-route.test.ts`

Expected: PASS with the mascot, current rival, three-opponent strip, and compact story copy visible.

- [ ] **Step 8: Commit the screen composition.**

```powershell
git add src/ui/characters src/ui/screens/TowerScreen.tsx src/ui/screens/FloorIntroScreen.tsx src/ui/screens/ResultScreen.tsx src/ui/screens/EndingScreen.tsx src/app/AppRoot.tsx
git commit -m "feat: show tower mascot and rival encounter strips"
```

---

### Task 5: Rebuild the battle HUD around visible character identity

**Files:**

- Create: `src/ui/match/character-plate.ts`
- Create: `src/ui/match/character-plate.test.ts`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/match/items.css`
- Modify: `src/ui/match/portrait-state.ts`
- Modify: `src/ui/match/portrait-state.test.ts`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`

**Interfaces:**

- `CharacterPlateModel = { side: SideId; characterId: CharacterId; name: string; title: string; portrait: PortraitPresentation; danger: boolean }`.
- `createCharacterPlateModel(character, side, presentation, model): CharacterPlateModel` returns `danger = model.incoming > 0 || model.topOut` without exposing the numeric incoming value.
- `BattleHud` receives `character: { id; name; title }` and `portrait`, keeps `model`, `side`, `tiles`, and `items`, and retains hidden test IDs `*-combo`, `*-incoming`, `*-row-clear`, `*-freeze`, `*-queue-swap`, `*-freeze-ticks`, `*-phase`, and `*-top-out`.
- `portraitRoleFor` uses `character.id === 'demon-king'` for rage handling and treats every other rival as `lieutenant`; no floor-number heuristic remains.

- [ ] **Step 1: Write failing character plate tests.**

```ts
it('maps incoming pressure to a visible danger state without exposing its count', () => {
  const model = createCharacterPlateModel(
    { id: 'glass-oracle', name: '유리 예언자 프리즘', title: '거울 회랑의 관리자' },
    'opponent',
    { state: 'panic', alt: 'RIVAL panic portrait' },
    { ...publicSide, incoming: 4 },
  );

  expect(model.danger).toBe(true);
});
```

Update `BattleHud.test.tsx` to assert the rival’s actual name/title are visible, the portrait is at least the new plate size class, and `screen.getByText('4')` does not find a visible telemetry value while hidden `opponent-incoming` still contains `4`.

- [ ] **Step 2: Run HUD tests and confirm red.**

Run: `npm test -- src/ui/match/character-plate.test.ts src/ui/match/BattleHud.test.tsx`

Expected: FAIL because `BattleHud` currently accepts only `label` and renders 24px portrait plates with `PLAYER`/`RIVAL` labels.

- [ ] **Step 3: Implement the character plate model and portrait-role mapping.**

Keep `resolvePortraitState` priority order `terminal > hit > attack > danger > focus/smug > idle`. Pass the selected encounter character ID into `usePortraitPresentations`; derive opponent source URLs from `commonAssets.rivals[encounter.characterId]`.

- [ ] **Step 4: Implement compact visible HUD markup.**

Replace the long header with a 48–64px portrait plate, visible character name/title, two NEXT tiles, and a color/ring danger indicator. Move `대전 진행 중` and floor text out of the main visual header; retain a visually hidden live status for accessibility. Keep item slots icon-only and keep numeric values in the existing visually hidden stats block.

- [ ] **Step 5: Update `MatchScreen` props and CSS.**

Pass the selected `FloorEncounter` and rival bundle into `BattleHud` and `usePortraitPresentations`. Keep both boards equal and simultaneously visible. Use `@media (max-height: 700px)` to reduce plate padding but never reduce the portrait below 40px.

- [ ] **Step 6: Run focused HUD, portrait, and match tests.**

Run: `npm test -- src/ui/match/character-plate.test.ts src/ui/match/BattleHud.test.tsx src/ui/match/portrait-state.test.ts src/ui/screens/MatchScreen.test.tsx src/ui/match/lifecycle-ui.test.tsx`

Expected: PASS with visible rival identity and no visible numeric telemetry.

- [ ] **Step 7: Commit the character-first battle HUD.**

```powershell
git add src/ui/match/character-plate.ts src/ui/match/character-plate.test.ts src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/ui/match/match-layout.css src/ui/match/items.css src/ui/match/portrait-state.ts src/ui/match/portrait-state.test.ts src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx
git commit -m "feat: make rival identity visible during battles"
```

---

### Task 6: Make the attack sequence read across the two boards

**Files:**

- Create: `src/render/attack-ribbon.ts`
- Create: `src/render/attack-ribbon.test.ts`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/battle-animation-registry.ts`
- Modify: `src/render/event-animation-queue.ts`
- Modify: `src/render/event-animation-queue.test.ts`
- Modify: `src/render/draw-primitives.ts`
- Modify: `src/ui/match/portrait-state.ts`
- Modify: `src/ui/match/portrait-state.test.ts`
- Modify: `src/ui/match/match-layout.css`

**Interfaces:**

- `computeAttackRibbon(from: Rect, to: Rect, progress: number): { x: number; y: number; angle: number; length: number }` clamps progress to `[0, 1]`, interpolates between board centers, and returns a length at least 24px.
- `effectsForEvents` continues to emit one critical `attack-shot` effect for each `attack-sent` event and one critical `garbage-land` effect for each `garbage-landed` event.
- `effectLifetimeMs('attack-shot')` remains 300ms; `land-impact` and `garbage-land` retain atlas-defined durations.

- [ ] **Step 1: Write failing attack ribbon geometry tests.**

```ts
it('interpolates a wide central ribbon between board centers', () => {
  const ribbon = computeAttackRibbon(
    { x: 0, y: 0, width: 100, height: 200 },
    { x: 0, y: 240, width: 100, height: 200 },
    0.5,
  );

  expect(ribbon.x).toBe(50);
  expect(ribbon.y).toBe(220);
  expect(ribbon.length).toBeGreaterThanOrEqual(24);
  expect(ribbon.angle).toBeCloseTo(Math.PI / 2);
});
```

Add an event-queue assertion that attack and garbage effects remain ordered as `line-clear`, `attack-shot`, `garbage-land` for the same tick.

- [ ] **Step 2: Run the focused render tests and confirm red.**

Run: `npm test -- src/render/attack-ribbon.test.ts src/render/event-animation-queue.test.ts`

Expected: FAIL because the geometry helper does not exist.

- [ ] **Step 3: Implement deterministic ribbon geometry and renderer usage.**

Use the helper for atlas sprite placement and fallback drawing. Scale the existing `attack-shot` atlas sprite to a visible ribbon-sized signal; when no atlas exists, draw a thick two-tone line with a moving impact ring rather than a tiny dot. Keep decorative effects capped by the existing maximum and do not block critical attack/garbage effects.

- [ ] **Step 4: Connect presentation events to character reactions.**

Keep attacker portrait `attack` on `attack-sent`, target portrait `hit` on `garbage-landed`, and `panic` when the target public view has incoming pressure or occupied danger rows. Add a test with two event batches that asserts the attacker returns to idle after the attack lifetime and the target enters hit on garbage arrival.

- [ ] **Step 5: Run render and portrait regression tests.**

Run: `npm test -- src/render src/ui/match/portrait-state.test.ts src/ui/screens/MatchScreen.test.tsx`

Expected: PASS with the original critical event ordering and a visible attack fallback.

- [ ] **Step 6: Commit the attack presentation.**

```powershell
git add src/render/attack-ribbon.ts src/render/attack-ribbon.test.ts src/render/BattleCanvas.tsx src/render/battle-animation-registry.ts src/render/event-animation-queue.ts src/render/event-animation-queue.test.ts src/render/draw-primitives.ts src/ui/match/portrait-state.ts src/ui/match/portrait-state.test.ts src/ui/match/match-layout.css
git commit -m "feat: connect attack signals to rival reactions"
```

---

### Task 7: Add the bounded exit lifecycle

**Files:**

- Create: `src/platform/close-with-timeout.ts`
- Create: `src/platform/close-with-timeout.test.ts`
- Modify: `src/ui/match/ExitConfirmation.tsx`
- Modify: `src/ui/match/lifecycle-ui.test.tsx`
- Modify: `src/ui/match/match-layout.css`
- Modify: `src/ui/screens/MatchScreen.tsx`

**Interfaces:**

- `closeWithTimeout(close: () => Promise<void>, timeoutMs = 1200): Promise<void>` resolves when `close` resolves, rejects with `Error('CLOSE_TIMEOUT')` at 1,200ms, and clears its timer after either result.
- `ExitConfirmation` exposes `data-close-state="idle|closing|failed"` and keeps the dialog open on failure.
- A confirmation click while `closing` is ignored. A failed attempt enables one new confirmation attempt after the first attempt has settled or rejected.

- [ ] **Step 1: Write failing timeout helper tests.**

Use Vitest fake timers to assert a resolving close completes before 1,200ms, a rejecting close propagates its error, and a never-resolving close rejects with `CLOSE_TIMEOUT` after exactly 1,200ms.

- [ ] **Step 2: Run the helper test and confirm red.**

Run: `npm test -- src/platform/close-with-timeout.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the timeout helper and confirmation states.**

Wrap `platform.close` in `MatchScreen` with `closeWithTimeout`. Set `closing` before invoking the Promise, show `게임을 닫는 중입니다.`, and on timeout/rejection show `게임을 닫지 못했습니다. 다시 시도해 주세요.` without mutating browser history or match progression. Keep the existing focus trap and pause reason.

- [ ] **Step 4: Add lifecycle UI tests.**

Assert that rapid double clicks call `platform.close` once, successful close reaches `closing`, a timeout reaches `failed`, and a second click after failure calls close exactly once more. Preserve Escape cancellation and focus restoration tests.

- [ ] **Step 5: Run lifecycle and platform tests.**

Run: `npm test -- src/platform/close-with-timeout.test.ts src/ui/match/lifecycle-ui.test.tsx src/platform/apps-in-toss-platform.test.ts`

Expected: PASS with no regression in pause/resume behavior.

- [ ] **Step 6: Commit the exit fix.**

```powershell
git add src/platform/close-with-timeout.ts src/platform/close-with-timeout.test.ts src/ui/match/ExitConfirmation.tsx src/ui/match/lifecycle-ui.test.tsx src/ui/match/match-layout.css src/ui/screens/MatchScreen.tsx
git commit -m "fix: bound game exit waiting state"
```

---

### Task 8: Prove the complete three-fight user journey and delivery gates

**Files:**

- Modify: `src/test-support/e2e-driver.ts`
- Modify: `src/test-support/e2e-match.tsx`
- Modify: `tests/e2e/app-flow.spec.ts`
- Modify: `tests/e2e/lifecycle-controls.spec.ts`
- Modify: `tests/e2e/portrait-layout.spec.ts`
- Modify: `docs/qa/apps-in-toss-private-qr.md`

**Interfaces:**

- The E2E driver exposes `finish(result)` for the current match and retains the route’s encounter metadata between calls.
- A floor-five forced-win test calls `finish('win')` three times, clicks `다음 상대` after the first two results, clicks `다음 층`/`계속` after the third, and reaches `ending-screen` only after the third win.
- A floor-one test asserts that one and two wins leave floor 2 disabled until the third win completes.

- [ ] **Step 1: Write the failing E2E assertions.**

Add assertions for the three visible rival names on floor 1, the current portrait plate name in `match-screen`, the absence of visible `대전 진행 중`/`AI 반응 간격`, and the three forced-win transition. Add a close test that waits 1,201ms and expects the failure state, then retries successfully with a resolving platform stub.

- [ ] **Step 2: Run the focused E2E tests and confirm red.**

Run: `npm run test:e2e -- tests/e2e/app-flow.spec.ts tests/e2e/lifecycle-controls.spec.ts tests/e2e/portrait-layout.spec.ts`

Expected: FAIL because the current app completes a floor after one forced win and the current selectors/text do not expose three encounters.

- [ ] **Step 3: Update the deterministic E2E driver and selectors.**

Keep the driver’s forced result path deterministic. Do not bypass `TowerController`; route every forced result through the same `finishMatch` callback used by the browser game. Update selectors to stable `data-testid`/role contracts rather than CSS class names.

- [ ] **Step 4: Run all application tests and E2E.**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run test:e2e`

Expected: all Vitest suites, TypeScript checks, and Playwright tests pass with zero failures.

- [ ] **Step 5: Run asset, source-policy, package, and build gates.**

Run each command separately:

```powershell
npm run check:assets
npm run build:web
npm run test:delivery-gates
npm run check:source-policy
npm run build:ait
npm run check:ait
```

Expected: every command exits 0; `check:ait` validates exactly one package and the private Apps-in-Toss constraints remain intact.

- [ ] **Step 6: Record manual QA items without inventing device evidence.**

Update `docs/qa/apps-in-toss-private-qr.md` with the exact manual checks: tower mascot visibility, all three rival plates, character reaction timing, attack ribbon/fallback, three-fight progression, 1,200ms close behavior, portrait safe-area layout, and native close button. Mark device-only checks `PENDING_EXTERNAL` until a real sandbox/QR run supplies evidence.

- [ ] **Step 7: Review the final diff and commit the integration evidence.**

Run: `git diff --check`

Run: `git status --short --branch`

```powershell
git add src/test-support tests/e2e docs/qa/apps-in-toss-private-qr.md
git commit -m "test: verify three-fight tower journey"
```

---

## Final Verification Checklist

- [ ] `npm test` passes with 0 failures.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:e2e` passes at both configured portrait viewports.
- [ ] `npm run check:assets` reports the schema-2 authored pack and 106 unique assets.
- [ ] `npm run build:web` succeeds.
- [ ] `npm run test:delivery-gates` succeeds.
- [ ] `npm run build:ait` and `npm run check:ait` succeed.
- [ ] `git diff --check` is clean.
- [ ] No device-only Apps-in-Toss result is reported as complete without external evidence.
