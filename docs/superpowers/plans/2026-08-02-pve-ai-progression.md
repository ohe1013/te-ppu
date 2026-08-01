# PvE AI and Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic, visible-information-only opponents for all three tower floors plus resilient local progression, settings, unlock, and restart behavior.

**Architecture:** Complete the core implementation plan first. AI receives only the sanitized `AiObservation` created by core, evaluates legal rotation/column/drop candidates, and emits the same timestamped commands as player input; progression is a separate pure state machine behind a replaceable repository. Headless seeded simulations validate command legality, difficulty ordering, determinism, and bounded resource use.

**Tech Stack:** TypeScript, Vitest, Vite/Node headless validation, browser `Storage`

## Global Constraints

- This plan depends on the core plan providing only these imports from `src/core/index.ts`: `GameCommand`, `TimedCommand`, `MatchState`, `SideId`, `ItemType`, `AiObservation`, `createAiObservation`, `createMatch`, and `stepMatch`.
- `TimedCommand` is exactly `{ tick: number; side: SideId; command: GameCommand }`.
- AI decision code never accepts `MatchState`; `createAiObservation(state, side)` exposes the AI's board/active piece/next two/inventory/incoming queue plus the opponent's visible board/active piece/status, but no opponent preview, RNG state, hidden queue, future item, future garbage column, or command log. Only the headless simulation harness owns `MatchState` so it can call core transitions.
- Fixed simulation rate is 60 Hz. Floor reaction intervals are exactly 48 ticks/800 ms, 27 ticks/450 ms, and 12 ticks/200 ms.
- Floor search depths are current only, current plus one preview, and current plus two previews. AI must not synthesize a third preview.
- Floor mistakes are top-five uniform selection, top-three weighted selection, and deterministic best selection, using only the AI mistake RNG derived from the controller seed.
- AI places pieces only through ordered `GameCommand` values; it never mutates a board or teleports a piece.
- Frozen/background time does not advance the AI reaction clock.
- New progress unlocks only floor 1. Floor 1 wins unlock floor 2; floor 2 wins unlock floor 3; losses and draws never unlock.
- Battle state is never persisted. Each start or restart calls `createMatch` and receives a fresh match.
- Canonical progress schema version is `1`; local key is `te-ppu.progress`; corrupt or unsupported raw data is copied to `te-ppu.progress.backup.<epoch-ms>` before default recovery.
- AI and progression modules remain pure TypeScript and import no DOM, React, PixiJS, or Apps-in-Toss SDK code. `localStorage` is injected as `Storage`.

## File Map

- `src/ai/types.ts`: AI public contracts, candidate/features, controller interface.
- `src/ai/profiles.ts`: exact floor timing, search, mistake, weight, and item-policy data.
- `src/ai/candidates.ts`: public-board candidate enumeration and stable command routes.
- `src/ai/evaluate.ts`: board features, lookahead, stable ordering, seeded mistake selection.
- `src/ai/items.ts`: three floor-specific item strategies.
- `src/ai/controller.ts`: reaction clock, re-planning, and one-command-at-a-time output.
- `src/ai/index.ts`: required public AI barrel.
- `src/sim/aiSimulation.ts`, `scripts/validate-ai-simulations.ts`: deterministic headless validation.
- `src/progression/schema.ts`: schema and strict runtime validation.
- `src/progression/localProgressRepository.ts`: backup, recovery, save errors, and retry-safe results.
- `src/progression/tower.ts`: unlock/result/replay/restart state machine.
- `src/progression/index.ts`: required public progression barrel.
- `src/app/towerController.ts`: fresh-match and in-memory-on-save-failure orchestration.

---

### Task 1: Lock the AI Boundary and Three Floor Profiles

**Files:**
- Create: `src/ai/types.ts`
- Create: `src/ai/profiles.ts`
- Create: `src/ai/index.ts`
- Test: `tests/ai/profiles.test.ts`

**Interfaces:**
- Consumes: `AiObservation`, `GameCommand`, `ItemType`, `SideId`, and `TimedCommand` from `src/core/index.ts` only.
- Produces: `AiController`, `AiFloorProfile`, candidate support types, and `AI_FLOOR_PROFILES` through `src/ai/index.ts`; Task 3 adds the controller factory.

- [ ] **Step 1: Write the failing public-contract and profile tests**

```ts
expect(AI_FLOOR_PROFILES.map((p) => [p.floor, p.reactionTicks, p.lookahead, p.topK]))
  .toEqual([[1, 48, 0, 5], [2, 27, 1, 3], [3, 12, 2, 1]])
expect(AI_FLOOR_PROFILES[1].rankWeights).toEqual([0.6, 0.3, 0.1])

const observation = createAiObservation(createMatch({ matchSeed: 7, countdownTicks: 0 }), 'opponent')
expect(Object.keys(observation.opponent)).not.toContain('next')
expect(Object.keys(observation.opponent)).not.toContain('ghostY')
```

- [ ] **Step 2: Run tests and verify the missing exports fail**

Run: `npm test -- tests/ai/profiles.test.ts`

Expected: FAIL because `src/ai/index.ts` and `AI_FLOOR_PROFILES` do not exist.

- [ ] **Step 3: Define exact controller/profile contracts and data**

```ts
export interface AiController {
  readonly side: SideId
  update(view: AiObservation, tick: number): readonly TimedCommand[]
}

export interface AiFloorProfile {
  readonly floor: 1 | 2 | 3
  readonly reactionTicks: 48 | 27 | 12
  readonly lookahead: 0 | 1 | 2
  readonly topK: 5 | 3 | 1
  readonly rankWeights: readonly number[]
  readonly futureDiscount: number
  readonly weights: Readonly<Record<HeuristicName, number>>
  readonly itemPolicy: 'FIRST_VALID' | 'RISK_AWARE' | 'TACTICAL'
}

export type BoardView = AiObservation['self']['board']
export interface CellPoint { readonly x: number; readonly y: number }
export type HeuristicName =
  | 'aggregateHeight' | 'maxHeight' | 'holes' | 'bumpiness'
  | 'clearedLines' | 'combo' | 'incomingOffset' | 'itemGain'
  | 'opponentPressure'
```

Use these weight rows in `profiles.ts`, in heuristic order `aggregateHeight,maxHeight,holes,bumpiness,clearedLines,combo,incomingOffset,itemGain,opponentPressure`: floor 1 `[-0.25,-0.5,-2,-0.25,0.8,0.3,0.4,0.5,0]`, floor 2 `[-0.35,-0.8,-3.5,-0.45,1.2,0.9,1.1,1.2,0.2]`, floor 3 `[-0.45,-1.2,-5,-0.65,1.5,1.8,1.8,1.5,0.6]`. Set `futureDiscount` to `0`, `0.65`, and `0.7`; floor 1 rank weights are five `0.2` values and floor 3 is `[1]`.

- [ ] **Step 4: Export the exact public barrel and rerun tests**

```ts
export type { AiController, AiFloorProfile } from './types'
export { AI_FLOOR_PROFILES } from './profiles'
```

Run: `npm test -- tests/ai/profiles.test.ts`

Expected: PASS; the three profiles have the exact approved values and the opponent observation has no preview/ghost fields. During review, verify decision modules import core only through `src/core/index.ts`; this is an architectural review rule, not a source-text test.

- [ ] **Step 5: Commit**

```bash
git add src/ai tests/ai
git commit -m "feat: define floor AI profiles and public boundary"
```

### Task 2: Enumerate, Score, and Select Placements

**Files:**
- Create: `src/ai/candidates.ts`
- Create: `src/ai/evaluate.ts`
- Test: `tests/ai/candidates.test.ts`
- Test: `tests/ai/evaluate.test.ts`

**Interfaces:**
- Consumes: `AiObservation` and profile data from Task 1.
- Produces: `enumerateCandidates(view)`, `scoreCandidates(view, profile)`, and `selectCandidate(scored, profile, rng)` for the controller.

- [ ] **Step 1: Write failing enumeration and stable-selection tests**

```ts
expect(enumerateCandidates(emptyObservation('O'))).toHaveLength(9)
expect(enumerateCandidates(emptyObservation('I'))).toHaveLength(17)
for (const candidate of enumerateCandidates(jaggedObservation)) {
  expect(replayRoute(jaggedObservation, candidate.commands).landingCells)
    .toEqual(candidate.landingCells)
}
expect(selectCandidate(tiedCandidates, AI_FLOOR_PROFILES[2], seededRng(7)))
  .toEqual(selectCandidate(tiedCandidates, AI_FLOOR_PROFILES[2], seededRng(7)))
```

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- tests/ai/candidates.test.ts tests/ai/evaluate.test.ts`

Expected: FAIL because candidate enumeration and scoring functions are absent.

- [ ] **Step 3: Implement unique rotation/column/hard-drop enumeration**

```ts
export interface PlacementCandidate {
  rotation: 0 | 1 | 2 | 3
  column: number
  landingCells: readonly CellPoint[]
  commands: readonly GameCommand[]
  resultingBoard: BoardView
  clearedLines: number
  acquiredItems: readonly ItemType[]
  attack: number
  topOut: boolean
}
```

For each unique rotation, scan every column whose rotated cells fit, descend until the next row collides, and deduplicate by sorted `x:y` landing-cell key. Build routes as zero or more `{type:'rotate-clockwise'}`, repeated `{type:'move',dx:-1|1}`, then `{type:'hard-drop'}`. Reject a candidate when replaying its route against the public board cannot reach the same landing; this keeps SRS/collision disagreements out of controller output.

- [ ] **Step 4: Implement exact features, recursive public lookahead, and mistakes**

```ts
const score = dot(profile.weights, {
  aggregateHeight: sum(columnHeights),
  maxHeight: Math.max(...columnHeights),
  holes: countEmptyBelowOccupied(board),
  bumpiness: adjacentHeightDifference(columnHeights),
  clearedLines: candidate.clearedLines,
  combo: candidate.clearedLines > 0 ? view.self.combo + 1 : 0,
  incomingOffset: Math.min(candidate.attack, view.self.incoming),
  itemGain: itemValue(candidate.acquiredItems),
  opponentPressure: candidate.attack * normalizedHeight(view.opponent.board),
})
```

Treat `topOut` as `Number.NEGATIVE_INFINITY`. Recurse over only `view.self.next.slice(0, profile.lookahead)`, multiplying each future score by `futureDiscount`. Sort by score descending, then rotation, column, landing row, and command-string order. Floor 1 samples uniformly from the first five; floor 2 uses cumulative `[0.6,0.3,0.1]`; floor 3 takes index zero. Consume exactly one seeded mistake draw per new placement decision.

- [ ] **Step 5: Verify current/next-depth and deterministic selection**

Run: `npm test -- tests/ai/candidates.test.ts tests/ai/evaluate.test.ts`

Expected: PASS, including fixtures where floor 1 ignores previews, floor 2 changes for preview one, and floor 3 changes only when preview two changes.

- [ ] **Step 6: Commit**

```bash
git add src/ai/candidates.ts src/ai/evaluate.ts tests/ai
git commit -m "feat: enumerate and score AI placements"
```

### Task 3: Emit One Legal Command per Reaction Interval

**Files:**
- Create: `src/ai/controller.ts`
- Test: `tests/ai/controller.test.ts`
- Modify: `src/ai/index.ts`

**Interfaces:**
- Consumes: ranked candidate command routes from Task 2.
- Produces: `createAiController(profile, seed, side = 'opponent'): AiController`.

- [ ] **Step 1: Write failing timing, freeze, and no-teleport tests**

```ts
const ai = createAiController(AI_FLOOR_PROFILES[0], 11)
const outputs = Array.from({ length: 96 }, (_, index) => ai.update(view, index + 1))
expect(outputTicks(outputs)).toEqual([48, 96])
for (let tick = 97; tick <= 336; tick++) expect(ai.update(frozenView, tick)).toEqual([])
expect(ai.update(unfrozenView, 337)).toEqual([])
expect(allCommands(aiRun).every(({ type }) =>
  ['move', 'rotate-clockwise', 'hard-drop'].includes(type))).toBe(true)
```

- [ ] **Step 2: Confirm the factory is missing**

Run: `npm test -- tests/ai/controller.test.ts`

Expected: FAIL because `createAiController` is not implemented.

- [ ] **Step 3: Implement the paused reaction clock and route invalidation**

```ts
update(view, tick) {
  if (view.status !== 'playing' || view.self.phase !== 'active' || view.self.freezeTicks > 0) return []
  this.eligibleTicks += 1
  if (this.eligibleTicks < this.profile.reactionTicks) return []
  this.eligibleTicks = 0
  if (!this.route || !routeMatchesObservation(this.route, view)) this.route = this.plan(view)
  const command = this.route.shift()
  return command ? [{ tick, side: this.side, command }] : []
}
```

Emit at most one command per update. Store expected public `active`, `board`, and `inventory` fingerprints after each route step; discard and re-plan if gravity, garbage, an item change, or a rejected move makes the next observation diverge. Clear routes when the active piece, board, phase, or inventory fingerprint changes unexpectedly. The default side is `'opponent'`.

- [ ] **Step 4: Replay every floor controller through core**

Add the final factory export to `src/ai/index.ts`:

```ts
export { createAiController } from './controller'
```

Run: `npm test -- tests/ai/controller.test.ts`

Expected: PASS with exact gaps of 48/27/12 eligible ticks, no reaction-clock consumption while frozen, and only normal movement/rotation/drop/item commands.

- [ ] **Step 5: Commit**

```bash
git add src/ai/controller.ts src/ai/index.ts tests/ai/controller.test.ts
git commit -m "feat: add command-by-command AI controller"
```

### Task 4: Add Floor-Specific Item Strategies

**Files:**
- Create: `src/ai/items.ts`
- Test: `tests/ai/items.test.ts`
- Modify: `src/ai/controller.ts`

**Interfaces:**
- Consumes: sanitized inventories, public boards/status, candidate evaluator, and ordinary `GameCommand` item variants.
- Produces: `planItemCommands(view, profile): readonly GameCommand[]`, queued through the Task 3 controller.

- [ ] **Step 1: Write failing acquisition, charge, and strategy tests**

```ts
expect(planItemCommands(noInventoryView, floor3)).toEqual([])
expect(planItemCommands(lineClearView, floor1)).toEqual([{ type: 'use-row-clear', row: 19 }])
expect(planItemCommands(swapWithoutChargeView, floor3)).toEqual([])
expect(planItemCommands(doubleFreezeSameTickView, floor3)[0]).toEqual({ type: 'use-freeze' })
```

- [ ] **Step 2: Run item tests**

Run: `npm test -- tests/ai/items.test.ts`

Expected: FAIL because item strategies are absent.

- [ ] **Step 3: Implement the three exact policies**

Floor 1 uses each acquired item at its first valid `active` decision; line clear targets the lowest non-empty visible row, time stop fires immediately, and next swap fires whenever a charge exists. Floor 2 uses line clear when max height is at least 14, holes at least 6, or incoming garbage at least 6, choosing the row maximizing `holes removed * 2 + occupied cells` with lower-row tie-break; it freezes when opponent height is at least 14 or opponent combo is at least 2; it swaps only when one-preview score improves by at least `3.0`. Floor 3 simulates every valid row and uses line clear when it avoids top-out, offsets incoming attack, or improves score by at least `4.0`; it freezes when its combo is at least 2 or opponent height is at least 13; it swaps when two-preview score improves by at least `2.5` or avoids top-out.

Choose the row inside AI planning and emit the core's single `{type:'use-row-clear',row}` command; player-side drag selection remains a UI concern. Emit freeze and swap only as `{type:'use-freeze'}` and `{type:'use-queue-swap'}`. Never issue a command without inventory/charge, during a non-`active` phase, or while frozen. Item planning preempts placement planning for that reaction and invalidates the old placement route.

- [ ] **Step 4: Verify policies and controller integration**

Run: `npm test -- tests/ai/items.test.ts tests/ai/controller.test.ts`

Expected: PASS; all three floors consume only acquired items, never exceed three swap charges, and simultaneous time stops remain ordinary same-tick commands for core to resolve.

- [ ] **Step 5: Commit**

```bash
git add src/ai/items.ts src/ai/controller.ts tests/ai
git commit -m "feat: add AI item tactics for three floors"
```

### Task 5: Validate AI Determinism and Difficulty Headlessly

**Files:**
- Create: `src/sim/aiSimulation.ts`
- Create: `scripts/validate-ai-simulations.ts`
- Test: `tests/sim/aiSimulation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createMatch`, `createAiObservation`, `stepMatch`, and AI public exports.
- Produces: `runAiSimulation(options): SimulationSummary` and `npm run validate:ai`.

- [ ] **Step 1: Write failing determinism and no-cheat tests**

```ts
expect(runAiSimulation({ seed: 91, floor: 2 })).toEqual(
  runAiSimulation({ seed: 91, floor: 2 }),
)
expect(decideWithHiddenState(hiddenA)).toEqual(decideWithHiddenState(hiddenB))
expect(hiddenA.futureBag).not.toEqual(hiddenB.futureBag)
```

Build `hiddenA` and `hiddenB` with identical `AiObservation` fields but different future bags, item RNG, garbage-column RNG, and command logs; only `createAiObservation` output enters the controller.

- [ ] **Step 2: Run the focused simulation test**

Run: `npm test -- tests/sim/aiSimulation.test.ts`

Expected: FAIL because `runAiSimulation` does not exist.

- [ ] **Step 3: Implement a capped deterministic runner**

```ts
export interface SimulationSummary {
  outcome: 'player' | 'opponent' | 'draw'
  ticks: number
  stateHash: string
  eventHash: string
  rejectedCommands: number
  exceededTickLimit: boolean
}
```

Create a fresh match, derive controller seeds from the match seed, call controllers only with `createAiObservation`, merge returned `TimedCommand[]` by tick/side, and advance with `stepMatch`. Stop at a terminal result or 36,000 ticks (ten simulated minutes). Hash canonical state and ordered events with Node SHA-256. Count rejected-command events.

- [ ] **Step 4: Add the 3,000-match validation script**

Install the exact script runner with `npm install --save-dev tsx@4.23.1`. Run 1,000 fixed seeds per floor against one fixed benchmark controller. Assert zero rejected commands, zero tick-limit exits, and strictly ordered win rates `floor1 < floor2 < floor3`. With `global.gc()`, sample retained heap every 250 matches; require final delta no greater than 32 MiB and linear growth no greater than 256 KiB per 1,000 matches.

```json
{
  "scripts": {
    "validate:ai": "node --expose-gc ./node_modules/tsx/dist/cli.mjs scripts/validate-ai-simulations.ts"
  }
}
```

- [ ] **Step 5: Run deterministic tests and the full validation**

Run: `npm test -- tests/sim/aiSimulation.test.ts`

Expected: PASS with identical state/event hashes for repeated seeds and identical decisions across hidden-state variants.

Run: `npm run validate:ai`

Expected: exit 0 and print `3000 matches; rejected=0; capped=0; floor1 < floor2 < floor3; heap=PASS`.

- [ ] **Step 6: Commit**

```bash
git add src/sim scripts tests/sim package.json
git commit -m "test: validate deterministic AI simulations"
```

### Task 6: Add Versioned Progress Validation and Local Repository Failures

**Files:**
- Create: `src/progression/schema.ts`
- Create: `src/progression/localProgressRepository.ts`
- Create: `src/progression/index.ts`
- Test: `tests/progression/localProgressRepository.test.ts`

**Interfaces:**
- Produces: `ProgressState`, `ProgressLoadResult`, `ProgressSaveResult`, `ProgressRepository`, and `createLocalProgressRepository(storage): ProgressRepository` through `src/progression/index.ts`.

- [ ] **Step 1: Write failing defaults, validation, backup, and write-failure tests**

```ts
expect(await repo.load()).toEqual({ ok: true, state: DEFAULT_PROGRESS, recoveredFromCorruption: false })
expect((await repoWithValidV1.load()).state.schemaVersion).toBe(1)
expect(storage.getItem('te-ppu.progress.backup.1700000000000')).toBe('{broken')
expect(await throwingRepo.save(unlockedFloor2)).toEqual({
  ok: false, error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
})
```

- [ ] **Step 2: Run repository tests**

Run: `npm test -- tests/progression/localProgressRepository.test.ts`

Expected: FAIL because progress exports are absent.

- [ ] **Step 3: Define the exact version-1 schema and public result contracts**

```ts
export interface ProgressState {
  schemaVersion: 1
  highestUnlockedFloor: 1 | 2 | 3
  clearedFloors: { 1: boolean; 2: boolean; 3: boolean }
  settings: { soundEnabled: boolean; hapticsEnabled: boolean }
}
export type ProgressError =
  | { code: 'READ_FAILED'; message: 'Progress could not be read.' }
  | { code: 'BACKUP_FAILED'; message: 'Corrupt progress could not be backed up.' }
  | { code: 'WRITE_FAILED'; message: 'Progress could not be saved.' }
export type ProgressLoadResult =
  | { ok: true; state: ProgressState; recoveredFromCorruption: boolean }
  | { ok: false; state: ProgressState; error: ProgressError }
export type ProgressSaveResult = { ok: true } | { ok: false; error: ProgressError }
export interface ProgressRepository {
  load(): Promise<ProgressLoadResult>
  save(state: ProgressState): Promise<ProgressSaveResult>
}
```

`DEFAULT_PROGRESS` unlocks floor 1, clears no floors, and enables sound/haptics. Strictly validate every version-1 field; malformed JSON, missing/invalid fields, and any version other than `1` enter backup-first recovery. Do not invent a legacy migration because this repository has no released save format yet.

- [ ] **Step 4: Implement backup-first recovery and non-throwing saves**

On corruption or unsupported version, write the exact raw string to `te-ppu.progress.backup.${Date.now()}` before replacing the canonical value with defaults. Return `ok:true`, defaults, and `recoveredFromCorruption:true` only when backup/default writes succeed. An empty key returns defaults without writing. A read failure returns `READ_FAILED` with defaults; a backup failure returns `BACKUP_FAILED` without overwriting the raw canonical value; a recovery/default or normal save failure returns `WRITE_FAILED`. Never throw.

Export exactly the repository boundary from `src/progression/index.ts`:

```ts
export type { ProgressState, ProgressError, ProgressLoadResult, ProgressSaveResult, ProgressRepository } from './schema'
export { DEFAULT_PROGRESS } from './schema'
export { createLocalProgressRepository } from './localProgressRepository'
```

- [ ] **Step 5: Verify all failure paths and barrel exports**

Run: `npm test -- tests/progression/localProgressRepository.test.ts`

Expected: PASS for empty storage, valid version 1, malformed JSON backup, unsupported-version backup, failed backup, failed recovery write, and failed normal save.

- [ ] **Step 6: Commit**

```bash
git add src/progression tests/progression
git commit -m "feat: add resilient local progress repository"
```

### Task 7: Implement Tower Unlock, Replay, Restart, and Save Retry Flow

**Files:**
- Create: `src/progression/tower.ts`
- Create: `src/app/towerController.ts`
- Test: `tests/progression/tower.test.ts`
- Test: `tests/app/towerController.test.ts`
- Modify: `src/progression/index.ts`

**Interfaces:**
- Consumes: `createMatch({ matchSeed })`, `createAiController` with the selected floor profile, progression repository, and Task 6 state.
- Produces: pure `applyFloorResult`, `canSelectFloor`, and app-facing `TowerController` methods `startFloor(floor, matchSeed)`, `restartFloor(matchSeed)`, `completeFloor(result)`, `abandonMatch()`, and `retrySave()`; the controller keeps the latest state in memory even when persistence fails.

- [ ] **Step 1: Write failing unlock and fresh-restart tests**

```ts
expect(applyFloorResult(DEFAULT_PROGRESS, 1, 'WIN').highestUnlockedFloor).toBe(2)
expect(applyFloorResult(DEFAULT_PROGRESS, 1, 'LOSS')).toEqual(DEFAULT_PROGRESS)
expect(applyFloorResult(DEFAULT_PROGRESS, 1, 'DRAW')).toEqual(DEFAULT_PROGRESS)
expect(canSelectFloor(DEFAULT_PROGRESS, 2)).toBe(false)

const first = controller.startFloor(1, 10)
const restarted = controller.restartFloor(11)
expect(restarted.match).not.toBe(first.match)
expect(createMatchSpy).toHaveBeenNthCalledWith(2, { matchSeed: 11 })
```

- [ ] **Step 2: Run tower tests**

Run: `npm test -- tests/progression/tower.test.ts tests/app/towerController.test.ts`

Expected: FAIL because tower functions/controller do not exist.

- [ ] **Step 3: Implement pure result transitions**

On win, mark the floor cleared and raise `highestUnlockedFloor` to `min(3, floor + 1)` without relocking anything. Loss/draw leave progress unchanged. Floor 3 win routes to `ENDING`; other wins route to `RESULT_WIN`; loss/draw route to `RESULT_LOSS`/`RESULT_DRAW`. Any floor at or below the highest unlocked floor remains replayable.

- [ ] **Step 4: Implement fresh-match and in-memory persistence behavior**

```ts
startFloor(floor, matchSeed) {
  if (!canSelectFloor(this.progress, floor)) return { ok: false, reason: 'LOCKED_FLOOR' }
  this.selectedFloor = floor
  this.match = createMatch({ matchSeed })
  this.ai = createAiController(AI_FLOOR_PROFILES[floor - 1], deriveAiSeed(matchSeed), 'opponent')
  this.route = 'MATCH'
  return { ok: true, match: this.match }
}
```

`restartFloor` calls `startFloor` with a new seed and never reuses `MatchState`, thereby resetting both boards, attack queues, combos, item appearance records, and inventories. `completeFloor(result: 'WIN' | 'LOSS' | 'DRAW')` applies the pure result transition for the selected floor, chooses the result/ending route, clears the live match, and persists only progress. `abandonMatch` drops the match and routes to `FLOOR_INTRO`; no battle payload reaches the repository. Apply progress/settings changes to the controller's memory before awaiting `save`; on failure expose `SAVE_FAILED` and `retrySave()`, preserving playability and the exact pending state.

- [ ] **Step 5: Verify progression and complete regression suite**

Run: `npm test -- tests/progression tests/app/towerController.test.ts`

Expected: PASS for 1→2→3 unlocks, no draw/loss unlock, cleared-floor replay, floor-3 ending, fresh restart, abandon-to-intro, settings persistence, save failure, and successful retry.

Run: `npm test`

Expected: all unit and integration suites PASS.

Run: `npm run validate:ai`

Expected: exit 0 with the 3,000-match legality, ordering, determinism, and heap summary passing.

- [ ] **Step 6: Commit**

```bash
git add src/progression src/app/towerController.ts tests/progression tests/app
git commit -m "feat: add tower progression and restart flow"
```
