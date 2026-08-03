# Five-Floor Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the playable PvE tower from three to five floors while preserving legacy progress, making only floor 5 lead to the ending, and introducing five deterministic AI difficulty profiles.

**Architecture:** A single progression-owned `Floor` contract drives storage, routing, UI, AI, and simulations. Persistence strictly parses both schema versions, migrates valid v1 data to v2, and immediately attempts to persist the migration without classifying it as corruption. AI consumers use a checked `getAiFloorProfile(floor)` lookup so array indexes and floor-number branches do not leak across the app.

**Tech Stack:** TypeScript 7, React 19, Vitest 4, fast-check, Playwright 1.62, Node 24.15, Vite 8

## Global Constraints

- Canonical floors are exactly `1 | 2 | 3 | 4 | 5`; `FINAL_FLOOR` is exactly `5`.
- Progress storage remains under the key `te-ppu.progress` and the current persisted schema is exactly `schemaVersion: 2`.
- Valid v1 data is migrated, never corruption-backed-up, and `clearedFloors[3] === true` unlocks floor 4.
- A failed migration write returns the migrated in-memory state with `WRITE_FAILED`; it never resets or backs up the valid v1 document.
- Winning floors 1 through 4 returns to the tower after the result screen; only a floor 5 win leads to the ending.
- Profile reaction ticks remain exactly `[48, 38, 27, 19, 12]`, lookahead `[0, 0, 1, 1, 2]`, and `topK` `[5, 4, 3, 2, 1]`.
- `rankWeights.length` equals `topK`, each rank vector sums to 1, and AI selection consumes exactly one mistake-RNG draw per decision.
- The validation metric is the win rate of the AI controlled by the selected floor profile; it must increase strictly from floor 1 through floor 5.
- Starting or restarting any floor creates a fresh match, inventory, item-spawn history, combo, and incoming queue.
- Do not change the approved combat rules, board dimensions, equal opponent-board layout, joystick behavior, or deterministic replay boundary.

---

### Task 1: Canonical Five-Floor Contract

**Files:**
- Create: `src/progression/floors.ts`
- Modify: `src/progression/index.ts`
- Modify: `src/progression/tower.ts`
- Modify: `src/app/app-route.ts`
- Modify: `src/ai/types.ts`
- Test: `tests/progression/tower.test.ts`
- Test: `src/app/app-route.test.ts`

**Interfaces:**
- Consumes: no new interfaces.
- Produces: `FLOORS`, `Floor`, `ClearedFloors`, `FINAL_FLOOR`, `isFloor(value)`, and `isFinalFloor(floor)` from `src/progression`.

- [ ] **Step 1: Write failing canonical-floor tests**

```ts
import { FINAL_FLOOR, FLOORS, isFinalFloor, isFloor } from '../../src/progression';

it('owns the exact five-floor domain in one contract', () => {
  expect(FLOORS).toEqual([1, 2, 3, 4, 5]);
  expect(FINAL_FLOOR).toBe(5);
  expect([0, 6, '5', null].map(isFloor)).toEqual([false, false, false, false]);
  expect(FLOORS.map(isFloor)).toEqual([true, true, true, true, true]);
  expect(FLOORS.map(isFinalFloor)).toEqual([false, false, false, false, true]);
});
```

Add route cases proving floor 3 and floor 4 wins continue to `tower`, while only a floor 5 win continues to `ending`.

- [ ] **Step 2: Run the focused tests and confirm the missing exports/floor-5 type failures**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/tower.test.ts src/app/app-route.test.ts`

Expected: FAIL because `FLOORS`, `FINAL_FLOOR`, and floor 4/5 routes are not defined.

- [ ] **Step 3: Implement the canonical floor module and remove duplicate floor unions**

```ts
export const FLOORS = [1, 2, 3, 4, 5] as const;
export type Floor = typeof FLOORS[number];
export type ClearedFloors = Record<Floor, boolean>;
export const FINAL_FLOOR: Floor = 5;

export function isFloor(value: unknown): value is Floor {
  return typeof value === 'number' && FLOORS.includes(value as Floor);
}

export function isFinalFloor(floor: Floor): boolean {
  return floor === FINAL_FLOOR;
}
```

Export these through `src/progression/index.ts`. Import `Floor` into `tower.ts`, `app-route.ts`, and `ai/types.ts`; retain `export type { Floor } from '../progression'` in `app-route.ts` for existing callers. Replace the result reducer's `route.floor === 3` with `isFinalFloor(route.floor)`.

- [ ] **Step 4: Run the focused tests and typecheck**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/tower.test.ts src/app/app-route.test.ts && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS; any remaining duplicate `1 | 2 | 3` type sites are reported for later task fixtures, not production contracts.

- [ ] **Step 5: Commit the canonical contract**

```powershell
git add src/progression/floors.ts src/progression/index.ts src/progression/tower.ts src/app/app-route.ts src/ai/types.ts tests/progression/tower.test.ts src/app/app-route.test.ts
git commit -m "refactor: centralize five-floor contract"
```

---

### Task 2: Schema v2 and Safe Legacy Migration

**Files:**
- Modify: `src/progression/schema.ts`
- Modify: `src/progression/localProgressRepository.ts`
- Test: `tests/progression/localProgressRepository.test.ts`
- Test: `tests/progression/tower.test.ts`
- Test: `tests/app/towerController.test.ts`
- Test: `src/app/AppRoot.test.tsx`
- Test: `src/app/use-boot.test.tsx`

**Interfaces:**
- Consumes: `Floor`, `ClearedFloors`, and `isFloor` from Task 1.
- Produces: `ProgressState` v2 and `parsePersistedProgress(value): { state: ProgressState; migrated: boolean } | null`.

- [ ] **Step 1: Add failing v2 parser and migration tests**

```ts
const legacyCleared = JSON.stringify({
  schemaVersion: 1,
  highestUnlockedFloor: 3,
  clearedFloors: { 1: true, 2: true, 3: true },
  settings: { soundEnabled: false, hapticsEnabled: true },
});

it('migrates a cleared legacy third floor and immediately persists v2', async () => {
  storage.getItem.mockReturnValue(legacyCleared);
  const result = await repository.load();
  expect(result).toEqual({
    ok: true,
    recoveredFromCorruption: false,
    state: {
      schemaVersion: 2,
      highestUnlockedFloor: 4,
      clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
      settings: { soundEnabled: false, hapticsEnabled: true },
    },
  });
  expect(storage.setItem).toHaveBeenCalledWith(
    'te-ppu.progress',
    JSON.stringify(result.state),
  );
  expect(storage.setItem).not.toHaveBeenCalledWith(
    expect.stringMatching(/^te-ppu\.progress\.backup\./),
    expect.anything(),
  );
});
```

Add cases for: uncleared v1 retains its old highest floor; exact v2 loads without a write; migration write failure returns `{ ok:false, state:migrated, error:{code:'WRITE_FAILED',...} }`; v2 missing/extra floor keys, floor 6, malformed settings, and unknown versions take the existing corruption path. Update every typed `ProgressState` fixture in `tests/progression/tower.test.ts`, `tests/app/towerController.test.ts`, `src/app/AppRoot.test.tsx`, and `src/app/use-boot.test.tsx` to schema v2 with exact floor keys 1–5 so subsequent typecheck checkpoints are meaningful.

- [ ] **Step 2: Run the repository and boot tests to verify they fail against schema v1**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/localProgressRepository.test.ts src/app/use-boot.test.tsx`

Expected: FAIL on `schemaVersion: 2`, missing floor keys, and migration-write behavior.

- [ ] **Step 3: Implement strict two-version parsing**

```ts
export interface ProgressState {
  schemaVersion: 2;
  highestUnlockedFloor: Floor;
  clearedFloors: ClearedFloors;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}

export interface ParsedProgress {
  readonly state: ProgressState;
  readonly migrated: boolean;
}
```

Use separate exact-key validators for v1 keys `1,2,3` and v2 keys `1,2,3,4,5`. For v1, copy settings and floors 1–3, set floors 4–5 false, and calculate `highestUnlockedFloor` as `4` only when legacy floor 3 is cleared; otherwise preserve the legacy value. Make `parseProgressState(value)` remain a compatibility wrapper returning only `ParsedProgress.state`.

- [ ] **Step 4: Persist a successful parse only when it was migrated**

In `localProgressRepository.load()`, call `parsePersistedProgress`. If `migrated` is true, call `storage.setItem(PROGRESS_KEY, JSON.stringify(state))`. On that write's exception, return `WRITE_FAILED` with the migrated state. Do not enter the backup/default-recovery block for a valid legacy value.

- [ ] **Step 5: Run repository, boot, and type tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/localProgressRepository.test.ts src/app/use-boot.test.tsx`

Expected: PASS, including the `WRITE_FAILED` notice path and zero backup calls for valid v1.

- [ ] **Step 6: Commit the persistence migration**

```powershell
git add src/progression/schema.ts src/progression/localProgressRepository.ts tests/progression/localProgressRepository.test.ts tests/progression/tower.test.ts tests/app/towerController.test.ts src/app/AppRoot.test.tsx src/app/use-boot.test.tsx
git commit -m "feat: migrate progress to five-floor schema"
```

---

### Task 3: Five-Floor Unlocking and Controller Routes

**Files:**
- Modify: `src/progression/tower.ts`
- Modify: `src/app/towerController.ts`
- Test: `tests/progression/tower.test.ts`
- Test: `tests/app/towerController.test.ts`

**Interfaces:**
- Consumes: `FINAL_FLOOR`, `Floor`, `isFinalFloor`, and v2 `ProgressState`.
- Produces: floor 1→5 unlock transitions and floor-5-only `ENDING` controller route.

- [ ] **Step 1: Add failing progression and controller transition matrices**

```ts
it.each([
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 5],
] as const)('winning floor %i unlocks through %i', (floor, unlocked) => {
  const next = applyFloorResult(progressUnlockedThrough(floor), floor, 'WIN');
  expect(next.highestUnlockedFloor).toBe(unlocked);
  expect(next.clearedFloors[floor]).toBe(true);
});
```

Add controller assertions that floor 3 and 4 wins return `RESULT_WIN`, floor 5 win returns `ENDING`, loss/draw never unlock, and `restartFloor()` constructs different `MatchState` and `AiController` objects with reset combo/inventory/incoming state.

- [ ] **Step 2: Run the focused tests and confirm floor-3 terminal/max-floor failures**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/tower.test.ts tests/app/towerController.test.ts`

Expected: FAIL because the implementation still caps at 3 and routes floor 3 to `ENDING`.

- [ ] **Step 3: Generalize progression and controller decisions**

```ts
const unlockedByWin = Math.min(FINAL_FLOOR, floor + 1) as Floor;
```

Use `isFinalFloor(floor)` inside `routeFor()`. Preserve non-win referential behavior in `applyFloorResult`. Do not add any state reuse to `startFloor()` or `restartFloor()`; their existing `createMatch({ matchSeed })` call is the reset boundary.

- [ ] **Step 4: Run progression/controller tests and typecheck**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/progression/tower.test.ts tests/app/towerController.test.ts && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit controller progression**

```powershell
git add src/progression/tower.ts src/app/towerController.ts tests/progression/tower.test.ts tests/app/towerController.test.ts
git commit -m "feat: unlock five-floor tower progression"
```

---

### Task 4: Exact Five-Level AI Profiles

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/ai/profiles.ts`
- Modify: `src/ai/index.ts`
- Modify: `src/ai/evaluate.ts`
- Modify: `src/ai/items.ts`
- Modify: `src/app/towerController.ts`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Test: `tests/ai/profiles.test.ts`
- Test: `tests/ai/evaluate.test.ts`
- Test: `tests/ai/items.test.ts`
- Test: `tests/ai/controller.test.ts`
- Test: `tests/ai/candidates.test.ts`

**Interfaces:**
- Consumes: canonical `Floor`.
- Produces: `getAiFloorProfile(floor: Floor): AiFloorProfile`; all runtime lookups use it.

- [ ] **Step 1: Replace the profile expectation with all five exact records**

```ts
expect(AI_FLOOR_PROFILES.map(({ floor, reactionTicks, lookahead, topK, rankWeights, futureDiscount, itemPolicy }) => ({
  floor, reactionTicks, lookahead, topK, rankWeights, futureDiscount, itemPolicy,
}))).toEqual([
  { floor: 1, reactionTicks: 48, lookahead: 0, topK: 5, rankWeights: [.2,.2,.2,.2,.2], futureDiscount: 0, itemPolicy: 'FIRST_VALID' },
  { floor: 2, reactionTicks: 38, lookahead: 0, topK: 4, rankWeights: [.4,.3,.2,.1], futureDiscount: 0, itemPolicy: 'RISK_AWARE' },
  { floor: 3, reactionTicks: 27, lookahead: 1, topK: 3, rankWeights: [.6,.3,.1], futureDiscount: .65, itemPolicy: 'RISK_AWARE' },
  { floor: 4, reactionTicks: 19, lookahead: 1, topK: 2, rankWeights: [.75,.25], futureDiscount: .68, itemPolicy: 'TACTICAL' },
  { floor: 5, reactionTicks: 12, lookahead: 2, topK: 1, rankWeights: [1], futureDiscount: .7, itemPolicy: 'TACTICAL' },
]);
```

Also assert the exact nine heuristic weights from the approved spec for every floor, unique/ordered floor IDs, positive integer timing/topK, rank length, and rank sum within `1e-10`.

The ordered heuristic tuples are exactly:

```ts
const expectedWeights = [
  [-0.25, -0.5, -2, -0.25, 0.8, 0.3, 0.4, 0.5, 0],
  [-0.3, -0.65, -2.75, -0.35, 1, 0.6, 0.75, 0.8, 0.1],
  [-0.35, -0.8, -3.5, -0.45, 1.2, 0.9, 1.1, 1.2, 0.2],
  [-0.4, -1, -4.27, -0.63, 1.35, 1.35, 1.45, 1.35, 0.4],
  [-0.45, -1.2, -5, -0.65, 1.5, 1.8, 1.8, 1.5, 0.6],
] as const;
```

Map each tuple in this exact key order: `aggregateHeight`, `maxHeight`, `holes`, `bumpiness`, `clearedLines`, `combo`, `incomingOffset`, `itemGain`, `opponentPressure`.

- [ ] **Step 2: Add failing selection and item-policy boundary tests**

For floor 2 and 4, feed ordered candidates and draws at exact cumulative boundaries. For all profiles, spy on the RNG and assert one call per `selectCandidate()` invocation. Move old semantic constants so the previous middle profile is floor 3 and previous strongest profile is floor 5. Add floor-2 `RISK_AWARE` and floor-4 `TACTICAL` item assertions.

- [ ] **Step 3: Run the AI suite and confirm it fails on three profiles and floor-number branches**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/ai`

Expected: FAIL on profile count/values, lookup, and floor 2/4 behavior.

- [ ] **Step 4: Implement exact profiles and a checked lookup**

```ts
export function getAiFloorProfile(floor: Floor): AiFloorProfile {
  const profile = AI_FLOOR_PROFILES.find((candidate) => candidate.floor === floor);
  if (profile === undefined) throw new RangeError(`Missing AI profile for floor ${floor}`);
  return profile;
}
```

Use the five exact weight tuples in Step 1. In `selectCandidate`, always call `boundedDraw(rng)` once, slice to `topK`, and select by `rankWeights`; `topK: 1` naturally selects the best candidate without a floor-number condition.

- [ ] **Step 5: Replace every production `AI_FLOOR_PROFILES[floor - 1]` lookup**

Use `getAiFloorProfile(floor)` in `TowerController`, `FloorIntroScreen`, and `MatchScreen`. Export the lookup from `src/ai/index.ts`. Do not change the deterministic seed derivation.

- [ ] **Step 6: Run AI, app, and type tests**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/ai tests/app/towerController.test.ts src/app/use-match-loop.test.tsx && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: PASS; all five profiles remain deterministic and emit at most one scheduled command per reaction tick.

- [ ] **Step 7: Commit the AI ladder**

```powershell
git add src/ai src/app/towerController.ts src/ui/screens/FloorIntroScreen.tsx src/ui/screens/MatchScreen.tsx tests/ai tests/app/towerController.test.ts src/app/use-match-loop.test.tsx
git commit -m "feat: add five-level AI difficulty ladder"
```

---

### Task 5: Five-Floor Tower UI and App Flow

**Files:**
- Modify: `src/ui/screens/TowerScreen.tsx`
- Modify: `src/ui/screens/FloorIntroScreen.tsx`
- Modify: `src/app/AppRoot.test.tsx`
- Modify: `src/app/use-boot.test.tsx`
- Modify: `src/ui/screens/screens.css`
- Test: `tests/e2e/app-flow.spec.ts`
- Test: `tests/e2e/portrait-layout.spec.ts`

**Interfaces:**
- Consumes: `FLOORS`, v2 `ProgressState`, and `getAiFloorProfile`.
- Produces: five accessible floor cards with correct lock/clear/retry states and floor-5 ending navigation.

- [ ] **Step 1: Add failing component tests for all five cards and route flows**

```ts
expect(screen.getAllByRole('button', { name: /층 선택/ })).toHaveLength(5);
expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
```

Update all `ProgressState` fixtures to schema v2 with exact floor keys. Add floor intro timing assertions `[800, 633, 450, 317, 200]ms`. Add AppRoot flows proving floor 3 win unlocks 4, floor 4 win unlocks 5, and floor 5 win is the only path to the ending.

- [ ] **Step 2: Run AppRoot and boot tests to confirm stale fixtures and three-card UI fail**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/AppRoot.test.tsx src/app/use-boot.test.tsx`

Expected: FAIL on schema v1 fixtures and floor card count.

- [ ] **Step 3: Render the tower from the canonical constant**

```tsx
import { FLOORS, type ProgressState } from '../../progression';

<div className="floor-list">
  {FLOORS.map((floor) => /* existing accessible floor-card markup */)}
</div>
```

Keep the existing disabled-button lock behavior and clear/retry status copy. Adjust `.floor-list` spacing/card minimum height only as needed to show all five choices within 360×640 without horizontal overflow; vertical scrolling is allowed on non-match screens.

- [ ] **Step 4: Add E2E state/setup and responsive checks**

Store a v2 fixture unlocking floor 5, reload, select floor 5, use the existing test driver to force a win, continue, and assert the ending. At 360×640 assert all five floor buttons exist, `document.documentElement.scrollWidth <= innerWidth`, and match screens still expose equal player/opponent board dimensions.

- [ ] **Step 5: Run component and browser flows**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- src/app/AppRoot.test.tsx src/app/use-boot.test.tsx && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e -- tests/e2e/app-flow.spec.ts tests/e2e/portrait-layout.spec.ts`

Expected: PASS at both 360×640 and 430×932; both battle boards remain equal size.

- [ ] **Step 6: Commit the five-floor UI**

```powershell
git add src/ui/screens src/app/AppRoot.test.tsx src/app/use-boot.test.tsx tests/e2e/app-flow.spec.ts tests/e2e/portrait-layout.spec.ts
git commit -m "feat: present all five tower floors"
```

---

### Task 6: Five-Floor Deterministic Simulation Gate

**Files:**
- Modify: `src/ai/profiles.ts`
- Modify: `src/sim/aiSimulation.ts`
- Modify: `scripts/validate-ai-simulations.ts`
- Modify: `tests/ai/profiles.test.ts`
- Modify: `tests/sim/aiSimulation.test.ts`
- Modify: `tests/sim/validation-workers.test.ts`
- Modify: `docs/superpowers/specs/2026-08-02-hybrid-fantasy-pixel-asset-design.md`

**Interfaces:**
- Consumes: `FLOORS`, `Floor`, `isFloor`, and `getAiFloorProfile`.
- Produces: five-floor `ValidationReport` records and a 5,000-match full gate.

- [ ] **Step 1: Add failing simulation type and aggregation tests**

```ts
expect(report.totalMatches).toBe(5);
expect(Object.keys(report.winRates)).toEqual(['1', '2', '3', '4', '5']);
expect(checkpoints.map(({ completed }) => completed)).toEqual([0, 5]);
```

Add deterministic smoke runs for floors 4 and 5. Move the old 27-tick benchmark/long-run seeds to canonical floor 3 so the same AI behavior remains under its new floor number.

- [ ] **Step 2: Run simulation tests and verify three-floor aggregate failures**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/sim`

Expected: FAIL with totals/record keys limited to floors 1–3.

- [ ] **Step 3: Generalize simulation and validation records**

```ts
const selectedFloors = selection.floor === undefined ? FLOORS : [selection.floor];

for (const floor of selectedFloors) {
  for (let seed = seedFrom; seed <= seedTo; seed += 1) {
    tasks.push({ index: tasks.length, floor, seed });
  }
}
```

Use `getAiFloorProfile` and `isFloor` for runtime lookup/CLI validation. Build only the selected floor/seed window, require positive safe integers before allocation, and distribute compact task indices exactly once across workers. The parent requests the final heap checkpoint after every distinct worker reports `tasks-done`, then asserts exact task index/floor/seed coverage and reconciles final worker counters with result-derived counters. Internal `--worker` mode requires the spawn-only environment gate and exact worker argv. Replace hard-coded three-floor comparisons with an adjacent-pair loop over `FLOORS`. Full validation expects `VALIDATION_MATCHES_PER_FLOOR * FLOORS.length`, exactly 5,000 matches.

- [ ] **Step 4: Run focused simulation tests and five-floor smoke validation**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- tests/sim && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run validate:ai -- --floor 5 --seed-from 1 --seed-to 10`

Expected: PASS with zero rejected commands and zero capped matches.

- [ ] **Step 5: Run the full 5,000-match validation and tune only intermediate profiles if necessary**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run validate:ai`

Expected: PASS with `floor1 < floor2 < floor3 < floor4 < floor5`, zero rejected/capped matches, aggregate and per-worker heap delta under 32 MiB, and linear heap growth under 256 KiB/1,000 matches. If the strict order fails, change only floors 2 or 4 heuristic weights within the approved tuning role; preserve reaction endpoints 48/12, lookahead, topK, rank vectors, and item policies, then record the final exact values back into the spec in the same commit.

- [ ] **Step 6: Commit simulation validation**

```powershell
git add src/ai/profiles.ts src/sim/aiSimulation.ts scripts/validate-ai-simulations.ts tests/ai/profiles.test.ts tests/sim/aiSimulation.test.ts tests/sim/validation-workers.test.ts docs/superpowers/plans/2026-08-02-five-floor-progression.md docs/superpowers/specs/2026-08-02-hybrid-fantasy-pixel-asset-design.md
git commit -m "test: validate five-floor AI progression"
```

---

### Task 7: Full Progression Regression and Delivery Checkpoint

**Files:**
- Modify only if a regression test exposes an in-scope five-floor defect.

**Interfaces:**
- Consumes: all Tasks 1–6.
- Produces: a clean, test-backed five-floor checkpoint for the runtime asset plan.

- [ ] **Step 1: Scan for stale three-floor production contracts**

Run: `rg -n "1 \| 2 \| 3|\[1, 2, 3\]|floor === 3|floor - 1|schemaVersion: 1" src scripts tests`

Expected: no production ownership or routing match; test-only legacy fixtures must be explicitly named `legacyV1`.

- [ ] **Step 2: Run the complete unit and type suites**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run typecheck`

Expected: all Vitest tests PASS and typecheck exits 0.

- [ ] **Step 3: Run browser build and E2E**

Run: `npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:web && npx -y node@24.15.0 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run test:e2e`

Expected: Vite build and every Playwright scenario PASS with no equal-board regression.

- [ ] **Step 4: Commit only evidence-driven fixes, then mark this plan complete**

```powershell
git status --short
git log -7 --oneline
```

Expected: no uncommitted files and one independently reviewable commit per completed task.
