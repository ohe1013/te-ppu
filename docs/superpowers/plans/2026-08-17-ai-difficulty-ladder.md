# AI Difficulty 15-Step Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace overlapping floor-plus-difficulty AI modifiers with one strictly ordered `Easy 1` through `Hard 5` skill ladder, fix truncated candidate probabilities, and prove both structural and fixed-seed statistical dominance.

**Architecture:** Convert `(difficulty, floor)` to one level from 1 through 15, then build immutable `AiFloorProfile` objects from a centralized ladder and interpolated rookie/expert heuristic endpoints. Keep gameplay call sites and the `getAiFloorProfile` API stable; extend the Node-only simulator with difficulty-aware defaults and a separate mirrored calibration module consumed by the existing AI validation command.

**Tech Stack:** TypeScript 7, Vitest 4, Node.js 24 simulation workers, existing deterministic core RNG, PowerShell on Windows.

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on `feat/pve-delivery`.
- Preserve the user-owned untracked `tmp/` directory; never inspect, stage, delete, or modify it.
- Do not stop or reconfigure the user-owned Vite process on port 5173.
- Use `C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd` for every npm command; the repository requires Node `>=24.15.0 <25`.
- Use `apply_patch` for every tracked file edit and explicitly stage only files named by the current task.
- Add no dependencies and change no save schema, progression rule, tower UI, character asset, score rule, attack formula, combo formula, cancellation rule, item effect, board physics, or replay format.
- Preserve `getAiFloorProfile(floor, difficulty = 'easy')` as the match-facing API and preserve `AI_FLOOR_PROFILES` as the five generated Easy profiles.
- Enforce the strict order `Easy1..5 < Normal1..5 < Hard1..5`; `Normal 1 > Easy 5`, `Hard 1 > Normal 5`, and `Hard 5` is the global maximum.
- Derive production `topK` from `rankWeights.length`; every stored distribution is finite, non-negative, one to five entries long, and sums to 1.
- Keep the existing benchmark opponent on Easy floor 3; a simulation's optional `difficulty` changes only the tested player controller.
- Use at least 128 fixed seed pairs per statistical comparison, two side-swapped games per seed, a one-sided exact sign test with `p < .05`, and a Hard-5 endpoint share of at least 65%.
- A single match may be lost by the stronger profile; only structural invariants and fixed-corpus aggregate gates are strict.

---

## File Structure

### AI profile ownership

- `src/ai/types.ts`: public `AiStrengthLevel`, `AiSkillStep`, and existing runtime profile contract.
- `src/ai/profiles.ts`: the 15 skill steps, rookie/expert heuristic endpoints, ladder validation, level mapping, profile construction, and five Easy compatibility profiles.
- `src/ai/index.ts`: public exports for the new level helper and ladder data.
- `src/ai/evaluate.ts`: candidate probability normalization when fewer scored candidates exist than configured ranks.

### Simulation and calibration ownership

- `src/sim/aiSimulation.ts`: optional simulation difficulty and a shared deterministic profile-controller factory.
- `src/sim/aiDifficultyCalibration.ts`: mirrored match construction, point aggregation, exact sign-test math, comparison thresholds, and calibration assertions.
- `scripts/validate-ai-simulations.ts`: retain floor/heap validation and append the canonical three-comparison difficulty gate only for an unfiltered run.

### Test ownership

- `tests/ai/profiles.test.ts`: exact 15-level data, mapping, runtime invariants, interpolation, and boundary regressions.
- `tests/ai/evaluate.test.ts`: exact normalized candidate-selection boundaries.
- `tests/ai/items.test.ts`: item behavior named by `FIRST_VALID`, `RISK_AWARE`, and `TACTICAL` skill profiles instead of obsolete Easy-floor policy assumptions.
- `tests/sim/aiSimulation.test.ts`: explicit difficulty/default compatibility and controller determinism.
- `tests/sim/aiDifficultyCalibration.test.ts`: pure mirrored scoring, exact sign p-values, thresholds, and a one-seed runner smoke.
- `tests/sim/validation-workers.test.ts`: canonical validator formatting/integration without making filtered diagnostics run the full calibration.
- `tests/app/towerController.test.ts`: regular-floor and hidden-owl difficulty handoff.
- `src/app/use-match-loop.test.tsx`: `MatchScreen` profile handoff.

---

### Task 1: Build the validated global 15-step profile ladder

**Files:**
- Modify: `src/ai/types.ts:1-18`
- Modify: `src/ai/profiles.ts:1-138`
- Modify: `src/ai/index.ts:1-4`
- Test: `tests/ai/profiles.test.ts`
- Test: `tests/ai/evaluate.test.ts`
- Test: `tests/ai/items.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `Floor`, `FLOORS`, `isDifficulty`, and `isFloor` from `src/progression/index.ts`.
- Produces:

```ts
export type AiStrengthLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface AiSkillStep {
  readonly reactionTicks: number;
  readonly lookahead: 0 | 1 | 2;
  readonly rankWeights: readonly [number, ...number[]];
  readonly futureDiscount: number;
  readonly heuristicBlend: number;
  readonly itemPolicy: AiFloorProfile['itemPolicy'];
}

export const AI_SKILL_LADDER: readonly AiSkillStep[];
export function assertValidAiSkillLadder(ladder: readonly AiSkillStep[]): void;
export function getAiStrengthLevel(
  difficulty: Difficulty,
  floor: Floor,
): AiStrengthLevel;
export function getAiFloorProfile(
  floor: Floor,
  difficulty?: Difficulty,
): AiFloorProfile;
```

- `AI_FLOOR_PROFILES` is `AI_PROFILES_BY_LEVEL.slice(0, 5)` and each call `getAiFloorProfile(floor)` returns the same cached Easy profile object.
- `AiFloorProfile.topK` remains for compatibility but is assigned only from `rankWeights.length` during construction.

- [ ] **Step 1: Replace the five-profile assertions with failing 15-level mapping and invariant tests**

In `tests/ai/profiles.test.ts`, import `AI_SKILL_LADDER`, `assertValidAiSkillLadder`, `getAiStrengthLevel`, and `getAiFloorProfile`. Add the exact mapping and boundary regression:

```ts
const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const expectedLevels = [
  ['easy', 1, 1], ['easy', 2, 2], ['easy', 3, 3], ['easy', 4, 4], ['easy', 5, 5],
  ['normal', 1, 6], ['normal', 2, 7], ['normal', 3, 8], ['normal', 4, 9], ['normal', 5, 10],
  ['hard', 1, 11], ['hard', 2, 12], ['hard', 3, 13], ['hard', 4, 14], ['hard', 5, 15],
] as const;

it.each(expectedLevels)('maps %s floor %i to global level %i', (difficulty, floor, level) => {
  expect(getAiStrengthLevel(difficulty, floor)).toBe(level);
});

it('keeps both difficulty boundaries strict and Hard 5 globally maximal', () => {
  expect(getAiStrengthLevel('easy', 5)).toBeLessThan(getAiStrengthLevel('normal', 1));
  expect(getAiStrengthLevel('normal', 5)).toBeLessThan(getAiStrengthLevel('hard', 1));
  expect(getAiStrengthLevel('hard', 5)).toBe(15);
});
```

Assert the exact compact step data without duplicating heuristic maps:

```ts
expect(AI_SKILL_LADDER.map((step) => [
  step.reactionTicks,
  step.lookahead,
  step.rankWeights,
  step.futureDiscount,
  step.heuristicBlend,
  step.itemPolicy,
])).toEqual([
  [48, 0, [.20, .20, .20, .20, .20], .00, .00, 'FIRST_VALID'],
  [44, 0, [.28, .24, .20, .16, .12], .00, .07, 'FIRST_VALID'],
  [40, 0, [.36, .26, .18, .12, .08], .00, .14, 'FIRST_VALID'],
  [36, 0, [.44, .27, .16, .09, .04], .00, .21, 'RISK_AWARE'],
  [32, 0, [.52, .28, .14, .06], .00, .29, 'RISK_AWARE'],
  [29, 1, [.56, .28, .12, .04], .56, .36, 'RISK_AWARE'],
  [26, 1, [.62, .25, .10, .03], .58, .43, 'RISK_AWARE'],
  [23, 1, [.68, .22, .08, .02], .60, .50, 'RISK_AWARE'],
  [20, 1, [.74, .20, .06], .62, .57, 'RISK_AWARE'],
  [17, 1, [.80, .16, .04], .64, .64, 'TACTICAL'],
  [14, 2, [.84, .13, .03], .66, .71, 'TACTICAL'],
  [12, 2, [.88, .10, .02], .68, .79, 'TACTICAL'],
  [10, 2, [.92, .08], .70, .86, 'TACTICAL'],
  [8, 2, [.96, .04], .72, .93, 'TACTICAL'],
  [6, 2, [1], .74, 1, 'TACTICAL'],
]);
```

For every adjacent pair, zero-pad rank arrays to five entries and assert reaction ticks strictly decrease, lookahead/future discount/blend/policy do not regress, and every best-N cumulative probability does not decrease. Also assert each generated profile has `topK === rankWeights.length`, a probability sum close to 1, finite weights, and the encounter floor `((level - 1) % 5) + 1`.

Prove interpolation uses the approved endpoints and not the raw floor number:

```ts
expect(getAiFloorProfile(1, 'easy').weights).toEqual({
  aggregateHeight: -0.25, maxHeight: -0.5, holes: -2, bumpiness: -0.25,
  clearedLines: 0.8, combo: 0.3, incomingOffset: 0.4, itemGain: 0.5,
  opponentPressure: 0,
});
expect(getAiFloorProfile(5, 'hard').weights).toEqual({
  aggregateHeight: -0.45, maxHeight: -1.2, holes: -5, bumpiness: -0.65,
  clearedLines: 1.5, combo: 1.8, incomingOffset: 1.8, itemGain: 1.5,
  opponentPressure: 0.6,
});
expect(getAiFloorProfile(1, 'normal').weights.holes).toBeCloseTo(-3.08, 10);
```

Add malformed-ladder tests with exact failures:

```ts
expect(() => assertValidAiSkillLadder(AI_SKILL_LADDER.slice(0, 14)))
  .toThrow('AI skill ladder must contain exactly 15 steps');
expect(() => assertValidAiSkillLadder([
  { ...AI_SKILL_LADDER[0]!, rankWeights: [.2, .2] },
  ...AI_SKILL_LADDER.slice(1),
])).toThrow('AI skill level 1 rank weights must sum to 1');
expect(() => getAiFloorProfile(6 as never)).toThrow('Missing AI profile for floor 6');
```

- [ ] **Step 2: Run the profile test and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/ai/profiles.test.ts
```

Expected: FAIL because the level type, 15-step ladder, mapping function, and validator do not exist, and the current Normal-1 profile still derives from Easy floor 1.

- [ ] **Step 3: Add the level type and centralized ladder data**

Add `AiStrengthLevel` and `AiSkillStep` to `src/ai/types.ts`. In `src/ai/profiles.ts`, replace the five handwritten profiles and three scaling functions with these endpoints and step data:

```ts
const ROOKIE_HEURISTIC_WEIGHTS: AiFloorProfile['weights'] = {
  aggregateHeight: -0.25,
  maxHeight: -0.5,
  holes: -2,
  bumpiness: -0.25,
  clearedLines: 0.8,
  combo: 0.3,
  incomingOffset: 0.4,
  itemGain: 0.5,
  opponentPressure: 0,
};

const EXPERT_HEURISTIC_WEIGHTS: AiFloorProfile['weights'] = {
  aggregateHeight: -0.45,
  maxHeight: -1.2,
  holes: -5,
  bumpiness: -0.65,
  clearedLines: 1.5,
  combo: 1.8,
  incomingOffset: 1.8,
  itemGain: 1.5,
  opponentPressure: 0.6,
};

export const AI_SKILL_LADDER: readonly AiSkillStep[] = [
  { reactionTicks: 48, lookahead: 0, rankWeights: [.20, .20, .20, .20, .20], futureDiscount: .00, heuristicBlend: .00, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 44, lookahead: 0, rankWeights: [.28, .24, .20, .16, .12], futureDiscount: .00, heuristicBlend: .07, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 40, lookahead: 0, rankWeights: [.36, .26, .18, .12, .08], futureDiscount: .00, heuristicBlend: .14, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 36, lookahead: 0, rankWeights: [.44, .27, .16, .09, .04], futureDiscount: .00, heuristicBlend: .21, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 32, lookahead: 0, rankWeights: [.52, .28, .14, .06], futureDiscount: .00, heuristicBlend: .29, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 29, lookahead: 1, rankWeights: [.56, .28, .12, .04], futureDiscount: .56, heuristicBlend: .36, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 26, lookahead: 1, rankWeights: [.62, .25, .10, .03], futureDiscount: .58, heuristicBlend: .43, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 23, lookahead: 1, rankWeights: [.68, .22, .08, .02], futureDiscount: .60, heuristicBlend: .50, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 20, lookahead: 1, rankWeights: [.74, .20, .06], futureDiscount: .62, heuristicBlend: .57, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 17, lookahead: 1, rankWeights: [.80, .16, .04], futureDiscount: .64, heuristicBlend: .64, itemPolicy: 'TACTICAL' },
  { reactionTicks: 14, lookahead: 2, rankWeights: [.84, .13, .03], futureDiscount: .66, heuristicBlend: .71, itemPolicy: 'TACTICAL' },
  { reactionTicks: 12, lookahead: 2, rankWeights: [.88, .10, .02], futureDiscount: .68, heuristicBlend: .79, itemPolicy: 'TACTICAL' },
  { reactionTicks: 10, lookahead: 2, rankWeights: [.92, .08], futureDiscount: .70, heuristicBlend: .86, itemPolicy: 'TACTICAL' },
  { reactionTicks: 8, lookahead: 2, rankWeights: [.96, .04], futureDiscount: .72, heuristicBlend: .93, itemPolicy: 'TACTICAL' },
  { reactionTicks: 6, lookahead: 2, rankWeights: [1], futureDiscount: .74, heuristicBlend: 1, itemPolicy: 'TACTICAL' },
];
```

- [ ] **Step 4: Implement validation, interpolation, mapping, and cached profiles**

Use one ordered heuristic-name tuple and one policy-rank map. Validate the ladder before constructing profiles:

```ts
const HEURISTIC_NAMES = [
  'aggregateHeight', 'maxHeight', 'holes', 'bumpiness', 'clearedLines',
  'combo', 'incomingOffset', 'itemGain', 'opponentPressure',
] as const;
const POLICY_STRENGTH = { FIRST_VALID: 0, RISK_AWARE: 1, TACTICAL: 2 } as const;
const LEVEL_OFFSET = { easy: 0, normal: 5, hard: 10 } as const;

function cumulative(weights: readonly number[], count: number): number {
  return weights.slice(0, count).reduce((sum, weight) => sum + weight, 0);
}

export function assertValidAiSkillLadder(ladder: readonly AiSkillStep[]): void {
  if (ladder.length !== 15) throw new RangeError('AI skill ladder must contain exactly 15 steps');
  ladder.forEach((step, index) => {
    const level = index + 1;
    if (!Number.isInteger(step.reactionTicks) || step.reactionTicks <= 0) {
      throw new RangeError(`AI skill level ${level} reaction ticks must be a positive integer`);
    }
    if (step.lookahead !== 0 && step.lookahead !== 1 && step.lookahead !== 2) {
      throw new RangeError(`AI skill level ${level} lookahead is invalid`);
    }
    if (!Number.isFinite(step.futureDiscount)
      || step.futureDiscount < 0 || step.futureDiscount > 1) {
      throw new RangeError(`AI skill level ${level} future discount is invalid`);
    }
    if (!Number.isFinite(step.heuristicBlend)
      || step.heuristicBlend < 0 || step.heuristicBlend > 1) {
      throw new RangeError(`AI skill level ${level} heuristic blend is invalid`);
    }
    if (!Object.hasOwn(POLICY_STRENGTH, step.itemPolicy)) {
      throw new RangeError(`AI skill level ${level} item policy is invalid`);
    }
    if (step.rankWeights.length < 1 || step.rankWeights.length > 5
      || step.rankWeights.some((weight, rank) => !Number.isFinite(weight)
        || weight < 0
        || (rank > 0 && weight > step.rankWeights[rank - 1]! + 1e-10))) {
      throw new RangeError(`AI skill level ${level} rank weights are invalid`);
    }
    const total = step.rankWeights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-10) {
      throw new RangeError(`AI skill level ${level} rank weights must sum to 1`);
    }
    if (index === 0) return;
    const previous = ladder[index - 1]!;
    if (step.reactionTicks >= previous.reactionTicks
      || step.lookahead < previous.lookahead
      || step.futureDiscount < previous.futureDiscount
      || step.heuristicBlend < previous.heuristicBlend
      || POLICY_STRENGTH[step.itemPolicy] < POLICY_STRENGTH[previous.itemPolicy]) {
      throw new RangeError(`AI skill level ${level} regresses from level ${level - 1}`);
    }
    for (let count = 1; count <= 5; count += 1) {
      if (cumulative(step.rankWeights, count) + 1e-10
        < cumulative(previous.rankWeights, count)) {
        throw new RangeError(`AI skill level ${level} rank distribution regresses`);
      }
    }
  });
}
```

Build heuristic weights and profiles once:

```ts
function interpolateWeights(blend: number): AiFloorProfile['weights'] {
  return Object.fromEntries(HEURISTIC_NAMES.map((name) => [
    name,
    ROOKIE_HEURISTIC_WEIGHTS[name]
      + (EXPERT_HEURISTIC_WEIGHTS[name] - ROOKIE_HEURISTIC_WEIGHTS[name]) * blend,
  ])) as unknown as AiFloorProfile['weights'];
}

export function getAiStrengthLevel(difficulty: Difficulty, floor: Floor): AiStrengthLevel {
  if (!isDifficulty(difficulty) || !isFloor(floor)) {
    if (!isFloor(floor)) throw new RangeError(`Missing AI profile for floor ${String(floor)}`);
    throw new RangeError(`Missing AI difficulty ${String(difficulty)}`);
  }
  return (LEVEL_OFFSET[difficulty] + floor) as AiStrengthLevel;
}

function profileForLevel(level: AiStrengthLevel): AiFloorProfile {
  const step = AI_SKILL_LADDER[level - 1]!;
  const topK = step.rankWeights.length as AiFloorProfile['topK'];
  return {
    floor: (((level - 1) % 5) + 1) as Floor,
    reactionTicks: step.reactionTicks,
    lookahead: step.lookahead,
    topK,
    rankWeights: step.rankWeights,
    futureDiscount: step.futureDiscount,
    weights: interpolateWeights(step.heuristicBlend),
    itemPolicy: step.itemPolicy,
  };
}

assertValidAiSkillLadder(AI_SKILL_LADDER);
const AI_PROFILES_BY_LEVEL = AI_SKILL_LADDER.map((_, index) =>
  profileForLevel((index + 1) as AiStrengthLevel));
export const AI_FLOOR_PROFILES: readonly AiFloorProfile[] =
  AI_PROFILES_BY_LEVEL.slice(0, 5);

export function getAiFloorProfile(floor: Floor, difficulty: Difficulty = 'easy'): AiFloorProfile {
  return AI_PROFILES_BY_LEVEL[getAiStrengthLevel(difficulty, floor) - 1]!;
}
```

Export the `AiStrengthLevel` and `AiSkillStep` types plus `AI_SKILL_LADDER`,
`getAiStrengthLevel`, and existing APIs from `src/ai/index.ts`.

- [ ] **Step 5: Align evaluator and item-policy tests to skill semantics**

In `tests/ai/evaluate.test.ts`, replace floor aliases used to test search depth with:

```ts
const EASY_1 = getAiFloorProfile(1, 'easy');
const NORMAL_1 = getAiFloorProfile(1, 'normal');
const HARD_1 = getAiFloorProfile(1, 'hard');
```

Use `EASY_1` for zero-preview assertions, `NORMAL_1` for one-preview assertions, and `HARD_1` for two-preview assertions. Keep handcrafted `zeroProfile()` tests unchanged except for spreading a generated profile.

In `tests/ai/items.test.ts`, name profiles by behavior:

```ts
const FIRST_VALID = getAiFloorProfile(1, 'easy');
const RISK_AWARE = getAiFloorProfile(1, 'normal');
const TACTICAL_ONE_PREVIEW = getAiFloorProfile(5, 'normal');
const TACTICAL_TWO_PREVIEWS = getAiFloorProfile(1, 'hard');
```

Use `FIRST_VALID` for immediate-use tests, `RISK_AWARE` for height/hole/incoming gates and the one-preview swap evaluator, `TACTICAL_ONE_PREVIEW` for tactical row-clear/queue-swap thresholds, and both tactical aliases for tactical freeze coverage. Use `TACTICAL_TWO_PREVIEWS` for the test proving a runtime third preview is ignored. Rename test titles from “floor 2/floor 5” to the policy names; do not change `src/ai/items.ts`.

- [ ] **Step 6: Run all affected AI tests and verify GREEN**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/ai/profiles.test.ts tests/ai/evaluate.test.ts tests/ai/items.test.ts tests/ai/controller.test.ts tests/ai/candidates.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all named tests and typecheck PASS; no production item logic changes.

- [ ] **Step 7: Commit the global ladder**

```powershell
git add -- src/ai/types.ts src/ai/profiles.ts src/ai/index.ts tests/ai/profiles.test.ts tests/ai/evaluate.test.ts tests/ai/items.test.ts
git diff --cached --check
git commit -m "feat: define global AI difficulty ladder"
```

---

### Task 2: Normalize truncated candidate probabilities

**Files:**
- Modify: `src/ai/evaluate.ts:300-320`
- Test: `tests/ai/evaluate.test.ts`

**Interfaces:**
- Consumes: the existing `selectCandidate(scored, profile, rng)` inputs.
- Produces: the same function signature, exactly one RNG draw, and a selection point scaled to the probability mass of the actually available prefix.

- [ ] **Step 1: Add a failing three-candidate prefix regression**

Add this test under `seeded top-K selection`:

```ts
it.each([
  { draw: .30, expectedIndex: 0 },
  { draw: 1 / 3, expectedIndex: 1 },
  { draw: .66, expectedIndex: 1 },
  { draw: 2 / 3, expectedIndex: 2 },
  { draw: .99, expectedIndex: 2 },
])('renormalizes a uniform five-rank profile over three available candidates at $draw', (
  { draw, expectedIndex },
) => {
  const ranked = scoreCandidates(observation(), zeroProfile()).slice(0, 3);
  const profile = getAiFloorProfile(1, 'easy');
  let draws = 0;
  const selected = selectCandidate(ranked, profile, () => {
    draws += 1;
    return draw;
  });

  expect(selected).toBe(ranked[expectedIndex]);
  expect(draws).toBe(1);
});
```

Keep the empty-input contract explicit:

```ts
expect(() => selectCandidate([], getAiFloorProfile(1, 'easy'), () => 0))
  .toThrow('cannot select from an empty candidate list');
```

- [ ] **Step 2: Run the selection tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/ai/evaluate.test.ts -t "renormalizes|exact cumulative"
```

Expected: the `.30` case selects candidate 2 under the old unnormalized `.2/.2/.2` prefix instead of candidate 1.

- [ ] **Step 3: Scale the bounded draw by available probability mass**

Replace the selection loop tail with:

```ts
const available = scored.slice(0, Math.min(profile.topK, scored.length));
const weights = profile.rankWeights.slice(0, available.length);
const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
  throw new RangeError('available candidate weights must have positive finite mass');
}
const selectionPoint = draw * totalWeight;
let cumulative = 0;
for (let index = 0; index < available.length; index += 1) {
  cumulative += weights[index] ?? 0;
  if (selectionPoint < cumulative) return available[index]!;
}
return available.at(-1)!;
```

The last-candidate return remains only for floating-point rounding; it no longer receives omitted probability mass.

- [ ] **Step 4: Run evaluator and controller tests and verify GREEN**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/ai/evaluate.test.ts tests/ai/controller.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: exact full-distribution boundaries remain unchanged, three-candidate boundaries use normalized thirds, and typecheck passes.

- [ ] **Step 5: Commit the probability correction**

```powershell
git add -- src/ai/evaluate.ts tests/ai/evaluate.test.ts
git diff --cached --check
git commit -m "fix: normalize available AI candidate weights"
```

---

### Task 3: Make headless simulations difficulty-aware

**Files:**
- Modify: `src/sim/aiSimulation.ts:1-260`
- Test: `tests/sim/aiSimulation.test.ts`

**Interfaces:**
- Consumes: `getAiFloorProfile(floor, difficulty)` and the existing benchmark wrapper.
- Produces:

```ts
export interface AiSimulationOptions {
  readonly seed: number;
  readonly floor: Floor;
  readonly difficulty?: Difficulty;
  readonly tickLimit?: number;
  readonly controllers?: Readonly<Record<SideId, SimulationController>>;
}

export function createSimulationController(
  profile: AiFloorProfile,
  matchSeed: number,
  side: SideId,
): SimulationController;
```

- The default tested player uses the requested difficulty; the wrapped benchmark opponent remains `getAiFloorProfile(3, 'easy')`.
- Explicit `controllers` continue to override both defaults completely.

- [ ] **Step 1: Add failing default-compatibility and explicit-difficulty tests**

In `tests/sim/aiSimulation.test.ts`:

```ts
it('keeps omitted difficulty byte-for-byte equivalent to explicit Easy', () => {
  expect(runAiSimulation({ seed: 91, floor: 1, tickLimit: 240 })).toEqual(
    runAiSimulation({ seed: 91, floor: 1, difficulty: 'easy', tickLimit: 240 }),
  );
});

it('runs Hard deterministically with a different tested-player profile', () => {
  const easy = runAiSimulation({ seed: 91, floor: 1, difficulty: 'easy', tickLimit: 240 });
  const firstHard = runAiSimulation({ seed: 91, floor: 1, difficulty: 'hard', tickLimit: 240 });
  const secondHard = runAiSimulation({ seed: 91, floor: 1, difficulty: 'hard', tickLimit: 240 });

  expect(secondHard).toEqual(firstHard);
  expect(firstHard.stateHash).not.toBe(easy.stateHash);
  expect(firstHard.rejectedCommands).toBe(0);
});
```

- [ ] **Step 2: Run the focused simulation test and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/aiSimulation.test.ts -t "difficulty|explicit Easy"
```

Expected: TypeScript/Vitest rejects the unknown `difficulty` option or Easy and Hard remain identical because the option is ignored.

- [ ] **Step 3: Add the shared deterministic controller factory**

Import `AiFloorProfile` and `Difficulty`. Replace direct controller construction with:

```ts
export function createSimulationController(
  profile: AiFloorProfile,
  matchSeed: number,
  side: SideId,
): SimulationController {
  return createAiController(profile, deriveControllerSeed(matchSeed, side), side);
}

function defaultControllers(
  matchSeed: number,
  testedFloor: Floor,
  testedDifficulty: Difficulty,
): Readonly<Record<SideId, SimulationController>> {
  return {
    player: createSimulationController(
      getAiFloorProfile(testedFloor, testedDifficulty),
      matchSeed,
      'player',
    ),
    opponent: createBenchmarkController(createSimulationController(
      getAiFloorProfile(AI_SIMULATION_BENCHMARK_FLOOR, 'easy'),
      matchSeed,
      'opponent',
    )),
  };
}
```

Pass `options.difficulty ?? 'easy'` from `runAiSimulation` when explicit controllers are absent.

- [ ] **Step 4: Run the complete simulator test and typecheck**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/aiSimulation.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all simulator determinism, hidden-state, command-audit, cap, and regression-seed tests PASS.

- [ ] **Step 5: Commit difficulty-aware simulation**

```powershell
git add -- src/sim/aiSimulation.ts tests/sim/aiSimulation.test.ts
git diff --cached --check
git commit -m "feat: simulate explicit AI difficulties"
```

---

### Task 4: Add mirrored difficulty calibration and exact statistics

**Files:**
- Create: `src/sim/aiDifficultyCalibration.ts`
- Create: `tests/sim/aiDifficultyCalibration.test.ts`

**Interfaces:**
- Consumes: `createSimulationController`, `runAiSimulation`, and `getAiFloorProfile`.
- Produces:

```ts
export interface AiDifficultyEndpoint {
  readonly difficulty: Difficulty;
  readonly floor: Floor;
}

export interface AiDifficultyComparison {
  readonly id: 'easy5-normal1' | 'normal5-hard1' | 'easy1-hard5';
  readonly lower: AiDifficultyEndpoint;
  readonly higher: AiDifficultyEndpoint;
  readonly minimumHigherShare: number;
  readonly strictShare: boolean;
}

export interface AiDifficultyComparisonReport {
  readonly comparison: AiDifficultyComparison;
  readonly seedPairs: number;
  readonly games: number;
  readonly higherPoints: number;
  readonly higherShare: number;
  readonly pairedWins: number;
  readonly pairedLosses: number;
  readonly pairedTies: number;
  readonly oneSidedPValue: number;
  readonly rejectedCommands: number;
  readonly cappedMatches: number;
}

export const AI_DIFFICULTY_CALIBRATION_SEED_PAIRS = 128;
export const AI_DIFFICULTY_COMPARISONS: readonly AiDifficultyComparison[];
export function exactOneSidedSignPValue(wins: number, losses: number): number;
export function summarizeDifficultyComparison(
  comparison: AiDifficultyComparison,
  pairs: readonly MirroredDifficultyPair[],
): AiDifficultyComparisonReport;
export function runAiDifficultyCalibration(options?: {
  readonly seeds?: readonly number[];
  readonly tickLimit?: number;
}): readonly AiDifficultyComparisonReport[];
export function assertAiDifficultyCalibration(
  reports: readonly AiDifficultyComparisonReport[],
): void;
```

- [ ] **Step 1: Write failing exact-sign and mirrored-scoring tests**

Create a helper that returns a complete `SimulationSummary` for a supplied outcome, then assert:

```ts
expect(exactOneSidedSignPValue(7, 0)).toBeCloseTo(0.0078125, 12);
expect(exactOneSidedSignPValue(6, 1)).toBeCloseTo(0.0625, 12);
expect(exactOneSidedSignPValue(0, 7)).toBe(1);

const report = summarizeDifficultyComparison(AI_DIFFICULTY_COMPARISONS[0]!, [
  {
    seed: 1,
    higherAsPlayer: summary('player'),
    higherAsOpponent: summary('opponent'),
  },
  {
    seed: 2,
    higherAsPlayer: summary('draw'),
    higherAsOpponent: summary('draw'),
  },
]);
expect(report).toMatchObject({
  seedPairs: 2,
  games: 4,
  higherPoints: 3,
  higherShare: .75,
  pairedWins: 1,
  pairedLosses: 0,
  pairedTies: 1,
  oneSidedPValue: .5,
});
```

Add assertion failures for a boundary share of `.5`, `p === .05`, an endpoint share of `.649`, any rejected command, any capped match, fewer than 128 seed pairs, and a missing comparison ID.

- [ ] **Step 2: Run the new test and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/aiDifficultyCalibration.test.ts
```

Expected: FAIL because the calibration module does not exist.

- [ ] **Step 3: Implement comparison constants and exact sign-test math**

Use these canonical comparisons:

```ts
export const AI_DIFFICULTY_COMPARISONS = [
  {
    id: 'easy5-normal1',
    lower: { difficulty: 'easy', floor: 5 },
    higher: { difficulty: 'normal', floor: 1 },
    minimumHigherShare: .5,
    strictShare: true,
  },
  {
    id: 'normal5-hard1',
    lower: { difficulty: 'normal', floor: 5 },
    higher: { difficulty: 'hard', floor: 1 },
    minimumHigherShare: .5,
    strictShare: true,
  },
  {
    id: 'easy1-hard5',
    lower: { difficulty: 'easy', floor: 1 },
    higher: { difficulty: 'hard', floor: 5 },
    minimumHigherShare: .65,
    strictShare: false,
  },
] as const satisfies readonly AiDifficultyComparison[];
```

Calculate the one-sided exact binomial tail without a dependency:

```ts
export function exactOneSidedSignPValue(wins: number, losses: number): number {
  if (!Number.isSafeInteger(wins) || wins < 0
    || !Number.isSafeInteger(losses) || losses < 0) {
    throw new RangeError('sign-test counts must be non-negative safe integers');
  }
  const trials = wins + losses;
  if (trials === 0) return 1;
  let term = 0.5 ** trials;
  let tail = 0;
  for (let successes = 0; successes <= trials; successes += 1) {
    if (successes >= wins) tail += term;
    term *= (trials - successes) / (successes + 1);
  }
  return Math.min(1, tail);
}
```

- [ ] **Step 4: Implement mirrored runs and report aggregation**

For each seed, construct one game with the higher profile as player and one with it as opponent. Use the same match seed for both and `createSimulationController` so each profile experiences both side-specific AI RNG streams:

```ts
function controllersFor(
  seed: number,
  player: AiDifficultyEndpoint,
  opponent: AiDifficultyEndpoint,
): Readonly<Record<SideId, SimulationController>> {
  return {
    player: createSimulationController(
      getAiFloorProfile(player.floor, player.difficulty), seed, 'player',
    ),
    opponent: createSimulationController(
      getAiFloorProfile(opponent.floor, opponent.difficulty), seed, 'opponent',
    ),
  };
}

function runPair(
  comparison: AiDifficultyComparison,
  seed: number,
  tickLimit?: number,
): MirroredDifficultyPair {
  return {
    seed,
    higherAsPlayer: runAiSimulation({
      seed,
      floor: comparison.higher.floor,
      controllers: controllersFor(seed, comparison.higher, comparison.lower),
      ...(tickLimit === undefined ? {} : { tickLimit }),
    }),
    higherAsOpponent: runAiSimulation({
      seed,
      floor: comparison.higher.floor,
      controllers: controllersFor(seed, comparison.lower, comparison.higher),
      ...(tickLimit === undefined ? {} : { tickLimit }),
    }),
  };
}
```

Score a higher-side win as 1, a draw as .5, and a loss as 0. A seed pair is a paired win above 1 point, loss below 1, and tie at 1. Aggregate rejected commands and capped matches from both games.

When `seeds` is supplied, reject an empty list, duplicate values, and values that are not positive safe integers. The default seed list is exactly `1..128` in ascending order.

`assertAiDifficultyCalibration` must require all three unique IDs, at least 128 pairs and 256 games per report, zero rejected/capped matches, `higherShare > .5` for the two boundaries, `higherShare >= .65` for the endpoint, and `oneSidedPValue < .05` for every comparison.

- [ ] **Step 5: Add a one-seed runner smoke and verify GREEN**

Add a bounded smoke that does not call the canonical assertion:

```ts
const reports = runAiDifficultyCalibration({ seeds: [1], tickLimit: 1 });
expect(reports.map(({ comparison, seedPairs, games, cappedMatches }) => ({
  id: comparison.id,
  seedPairs,
  games,
  cappedMatches,
}))).toEqual([
  { id: 'easy5-normal1', seedPairs: 1, games: 2, cappedMatches: 2 },
  { id: 'normal5-hard1', seedPairs: 1, games: 2, cappedMatches: 2 },
  { id: 'easy1-hard5', seedPairs: 1, games: 2, cappedMatches: 2 },
]);
```

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/aiDifficultyCalibration.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: pure statistics, threshold failures, the six-game bounded smoke, and typecheck PASS.

- [ ] **Step 6: Commit mirrored calibration**

```powershell
git add -- src/sim/aiDifficultyCalibration.ts tests/sim/aiDifficultyCalibration.test.ts
git diff --cached --check
git commit -m "test: calibrate AI difficulty boundaries"
```

---

### Task 5: Attach calibration to the canonical AI validation command

**Files:**
- Modify: `scripts/validate-ai-simulations.ts:1-760`
- Test: `tests/sim/validation-workers.test.ts`

**Interfaces:**
- Consumes: `runAiDifficultyCalibration` and `assertAiDifficultyCalibration` from Task 4.
- Produces: an unfiltered `npm run validate:ai` that passes both the existing 5,000-match floor/heap gate and the three mirrored difficulty comparisons.
- Filtered `--floor/--seed-from/--seed-to` diagnostics retain their current behavior and skip the canonical difficulty calibration.

- [ ] **Step 1: Add a failing deterministic report formatter test**

Export `formatAiDifficultyReport(report)` and test a synthetic boundary report:

```ts
expect(formatAiDifficultyReport({
  comparison: AI_DIFFICULTY_COMPARISONS[0]!,
  seedPairs: 128,
  games: 256,
  higherPoints: 153,
  higherShare: 153 / 256,
  pairedWins: 80,
  pairedLosses: 40,
  pairedTies: 8,
  oneSidedPValue: .0002,
  rejectedCommands: 0,
  cappedMatches: 0,
})).toBe('easy5-normal1: higher=59.8%; pairs=80/40/8; p=0.000200');
```

- [ ] **Step 2: Run the formatter and filtered-worker tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/validation-workers.test.ts -t "difficulty report|filtered diagnostic"
```

Expected: FAIL because the formatter is missing; the existing filtered diagnostic test remains green.

- [ ] **Step 3: Integrate calibration after the canonical floor assertion**

Implement the formatter:

```ts
export function formatAiDifficultyReport(report: AiDifficultyComparisonReport): string {
  const { comparison, higherShare, pairedWins, pairedLosses, pairedTies, oneSidedPValue } = report;
  return `${comparison.id}: higher=${(higherShare * 100).toFixed(1)}%; `
    + `pairs=${pairedWins}/${pairedLosses}/${pairedTies}; `
    + `p=${oneSidedPValue.toFixed(6)}`;
}
```

Leave the filtered early-return branch intact. In the unfiltered branch, run and assert the new reports only after `assertValidation(report)` succeeds:

```ts
assertValidation(report);
const difficultyReports = runAiDifficultyCalibration();
assertAiDifficultyCalibration(difficultyReports);
for (const difficultyReport of difficultyReports) {
  console.log(formatAiDifficultyReport(difficultyReport));
}
```

Do not add new CLI flags, worker message variants, dependencies, or heap counters for calibration.

- [ ] **Step 4: Run the worker/CLI suite and typecheck**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/sim/validation-workers.test.ts tests/sim/aiDifficultyCalibration.test.ts
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: worker checkpoint, filtered CLI, malformed argv, calibration formatter, and typecheck all PASS without running 128-pair calibration inside Vitest.

- [ ] **Step 5: Commit the validation gate integration**

```powershell
git add -- scripts/validate-ai-simulations.ts tests/sim/validation-workers.test.ts
git diff --cached --check
git commit -m "test: gate global AI difficulty ordering"
```

---

### Task 6: Prove tower, owl, and MatchScreen profile handoffs

**Files:**
- Test: `tests/app/towerController.test.ts`
- Test: `src/app/use-match-loop.test.tsx`
- Production call sites remain unchanged unless a RED test exposes a real handoff defect.

**Interfaces:**
- Consumes: existing `TowerController.startEncounter`, `TowerController.startOwlMatch`, and `MatchScreen` calls to `getAiFloorProfile`.
- Produces: behavior-level regression coverage that Hard floor 1 uses level 11, Hard owl uses level 15, and `MatchScreen` forwards its explicit difficulty.

- [ ] **Step 1: Wrap the real AI factory with a test spy**

In `tests/app/towerController.test.ts`, import `beforeEach` and `vi`, then use the real implementation through a hoisted spy:

```ts
const aiSpies = vi.hoisted(() => ({ createAiController: vi.fn() }));

vi.mock('../../src/ai/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ai/index')>();
  aiSpies.createAiController.mockImplementation(actual.createAiController);
  return { ...actual, createAiController: aiSpies.createAiController };
});

beforeEach(() => {
  aiSpies.createAiController.mockClear();
});
```

Import `getAiFloorProfile`, `getAiStrengthLevel`, `counterU32`, `RandomStream`, and
the `Difficulty` type for exact expected arguments and helper typing.

- [ ] **Step 2: Add regular-floor and hidden-owl handoff tests**

Extend the progress helper with a difficulty parameter and initialize the selected difficulty's five-floor run:

```ts
function progressUnlockedThrough(
  floor: 1 | 2 | 3 | 4 | 5,
  difficulty: Difficulty = 'easy',
): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.selectedDifficulty = difficulty;
  progress.unlockedDifficulties[difficulty] = true;
  progress.difficultyProgress[difficulty] = {
    highestUnlockedFloor: floor,
    clearedFloors: {
      1: floor > 1,
      2: floor > 2,
      3: floor > 3,
      4: floor > 4,
      5: false,
    },
    owlDefeated: false,
  };
  return progress;
}
```

Keep its default `easy` so every existing caller retains the same state. Add:

```ts
it('starts Hard floor 1 with global skill level 11', () => {
  const progress = progressUnlockedThrough(1, 'hard');
  const controller = new TowerController(progress, new RecordingRepository());

  expect(controller.startFloor(1, 101)).toMatchObject({ ok: true });
  expect(aiSpies.createAiController).toHaveBeenLastCalledWith(
    getAiFloorProfile(1, 'hard'),
    counterU32(101, RandomStream.AI_MISTAKE, 1),
    'opponent',
  );
});

it('starts the Hard owl with the global maximum level 15 profile', async () => {
  const controller = new TowerController(
    progressUnlockedThrough(5, 'hard'),
    new RecordingRepository(),
  );
  controller.startFloor(5, 50);
  for (let encounter = 0; encounter < 3; encounter += 1) {
    if (encounter > 0) controller.startEncounter(50 + encounter);
    await controller.completeEncounter('WIN');
  }

  expect(controller.startOwlMatch(77)).toMatchObject({ ok: true });
  expect(aiSpies.createAiController).toHaveBeenLastCalledWith(
    getAiFloorProfile(5, 'hard'),
    counterU32(77, RandomStream.AI_MISTAKE, 1),
    'opponent',
  );
  expect(getAiStrengthLevel('hard', 5)).toBe(15);
});
```

- [ ] **Step 3: Make the existing MatchScreen spy test assert explicit Hard**

In `src/app/use-match-loop.test.tsx`, add `difficulty="hard"` to the existing floor-2 render and replace the Easy expectation with:

```ts
expect(aiSpies.createAiController).toHaveBeenCalledWith(
  getAiFloorProfile(2, 'hard'),
  73,
);
```

- [ ] **Step 4: Run the call-site tests**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/app/towerController.test.ts src/app/use-match-loop.test.tsx
```

Expected: both files PASS without changing `src/app/towerController.ts` or `src/ui/screens/MatchScreen.tsx`, confirming those production handoffs were already correct.

- [ ] **Step 5: Commit call-site regression coverage**

```powershell
git add -- tests/app/towerController.test.ts src/app/use-match-loop.test.tsx
git diff --cached --check
git commit -m "test: cover tower difficulty AI handoffs"
```

---

### Task 7: Calibrate the fixed corpus and run delivery verification

**Files:**
- Modify only if a statistical gate fails: `src/ai/profiles.ts`
- Modify only with the same data change: `tests/ai/profiles.test.ts`
- Do not modify call sites, formulas, progression, `tmp/`, or historical specs.

**Interfaces:**
- Consumes: Tasks 1 through 6.
- Produces: fresh focused, full-suite, statistical, static, build, and delivery-gate evidence.

- [ ] **Step 1: Run the complete focused AI and simulation suite**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/ai/profiles.test.ts tests/ai/evaluate.test.ts tests/ai/items.test.ts tests/ai/controller.test.ts tests/ai/candidates.test.ts tests/sim/aiSimulation.test.ts tests/sim/aiDifficultyCalibration.test.ts tests/sim/validation-workers.test.ts tests/app/towerController.test.ts src/app/use-match-loop.test.tsx
```

Expected: every named test file PASS.

- [ ] **Step 2: Run the canonical statistical validation**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run validate:ai
```

Expected: 5,000 existing floor matches have zero rejected commands, zero capped matches, strict `floor1 < floor2 < floor3 < floor4 < floor5` win rates, and passing heap gates; the output then reports `easy5-normal1`, `normal5-hard1`, and `easy1-hard5`, each with `p < .05`, with the first two above 50% and the endpoint at or above 65%.

- [ ] **Step 3: Apply the bounded calibration fallback only for a failed statistical ordering gate**

If structural tests pass but the named statistical gate fails, make only the corresponding exact data change below, update the exact array in `tests/ai/profiles.test.ts`, rerun Tasks 1 Step 6 and Task 7 Step 2, and keep every ladder invariant:

| Failed comparison | Exact fallback step change |
| --- | --- |
| `floor1 < floor2` | Level 2: `reactionTicks: 43`, `rankWeights: [.30, .24, .19, .15, .12]`, `heuristicBlend: .09` |
| `floor2 < floor3` | Level 3: `reactionTicks: 39`, `rankWeights: [.38, .25, .17, .12, .08]`, `heuristicBlend: .17` |
| `floor3 < floor4` | Level 4: `reactionTicks: 35`, `rankWeights: [.46, .27, .15, .08, .04]`, `heuristicBlend: .24` |
| `floor4 < floor5` | Level 5: `reactionTicks: 31`, `rankWeights: [.54, .28, .13, .05]`, `heuristicBlend: .32` |
| `easy5-normal1` | Level 6: `reactionTicks: 28`, `rankWeights: [.58, .27, .11, .04]`, `heuristicBlend: .38` |
| `normal5-hard1` | Level 11: `reactionTicks: 13`, `rankWeights: [.86, .12, .02]`, `heuristicBlend: .75` |
| `easy1-hard5` endpoint | Level 15: `reactionTicks: 5`; retain `[1]`, lookahead 2, discount .74, blend 1, and `TACTICAL` |

If more than one ordering fails, apply the named rows together in one calibration commit. If an ordering still fails after its exact fallback, stop without weakening the acceptance threshold. For a floor failure report all five win rates; for a difficulty failure report the comparison ID, share, pair counts, p-value, rejected count, and capped count.

When a fallback was required, commit it:

```powershell
git add -- src/ai/profiles.ts tests/ai/profiles.test.ts
git diff --cached --check
git commit -m "fix: calibrate global AI difficulty boundaries"
```

- [ ] **Step 4: Run the full unit suite and static checks**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:source-policy
```

Expected: all commands exit 0. Record the actual Vitest file/test totals instead of reusing an earlier run.

- [ ] **Step 5: Build production web and run delivery gates**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:delivery-gates
```

Expected: both commands exit 0. This logic-only change does not require a new visual smoke or asset generation.

- [ ] **Step 6: Inspect final repository state**

```powershell
git diff --check
git status --short --branch
git log -8 --oneline --decorate
```

Expected: only the user-owned `?? tmp/` remains unstaged, and the task commits are local on `feat/pve-delivery`. Do not push until the user explicitly requests it.
