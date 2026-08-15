# Batched Garbage Rows and Restrained Attack Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert each uncancelled attack unit into one queued garbage row and coordinate a restrained launch-to-impact reaction across portraits, HUD, Pixi boards, sound, and haptics without pausing gameplay.

**Architecture:** Keep `resolveAttackExchange` and the existing post-lock garbage gate unchanged. Add a pure immutable row-raise primitive, a seeded batch orchestrator, and one `garbage-raised` batch event; separately derive attack presentation cues from `attack-sent` batches and drive a wall-clock FIFO timeline shared by the HUD and canvas.

**Tech Stack:** TypeScript 7, React 19, PixiJS 8 / `@pixi/react`, Vitest 4 with Testing Library, Playwright, Vite 8, PowerShell on Windows.

## Global Constraints

- Work only in `C:\Users\USER\Desktop\workspace\git\te-ppu\.worktrees\delivery` on `feat/pve-delivery`.
- Preserve the user-owned untracked `tmp/` directory; never inspect, stage, delete, or modify it.
- Do not stop or reconfigure the user-owned Vite process on port 5173.
- Use `C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd` for every npm command; the repository requires Node `>=24.15.0 <25`.
- Use `apply_patch` for every tracked file edit and explicitly stage only files named by the current task.
- Add no dependencies and generate no new bitmap, audio, or atlas assets.
- Preserve attack, combo, score, item, AI, and 1:1 cancellation formulas exactly.
- Apply queued garbage only at the existing recipient post-lock `garbage-drop` gate; never mutate a board under an active falling piece.
- Keep the 60 Hz core simulation, command intake, AI, replay, and match completion running during all feedback.
- Limit local impact displacement to 2 px, 4 px, or 6 px; never shake the page or entire canvas.
- Respect `prefers-reduced-motion` by removing translations while retaining portrait, outline, combo text, audio, and enabled haptics.
- One garbage batch produces one `garbage-raised` event and one land sound, not one event or sound per row.
- One attack cue produces at most one attack sound and one haptic at the impact boundary.
- Historical specs may retain the old phrase `garbage-landed`; production source and active tests must not.

---

## File Structure

### Core ownership

- `src/core/board.ts`: immutable one-row insertion and runtime validation of a supplied hole.
- `src/core/attack.ts`: seeded hole selection, multi-row orchestration, partial-overflow behavior, and one batch event.
- `src/core/model.ts`: `garbage-raised` event payload.
- `src/core/match.ts`: existing post-lock call site; only the batch helper name and event output change.
- `src/core/index.ts`: public exports for the renamed row and batch APIs.

### Presentation ownership

- `src/ui/match/attack-feedback.ts`: pure cue extraction, intensity tiers, phase timing, and side-role helpers.
- `src/ui/match/use-reduced-motion.ts`: browser motion preference subscription with a false fallback.
- `src/ui/match/use-attack-feedback.ts`: FIFO wall-clock attack timeline and one-shot impact callback.
- `src/ui/match/portrait-state.ts`: base portrait memory plus terminal-safe feedback override.
- `src/ui/match/BattleHud.tsx`: feedback data attributes and transient `N COMBO!` label.
- `src/ui/match/match-layout.css`: local plate animations and reduced-motion rules.
- `src/render/draw-primitives.ts`: row-rise content offset and procedural bottom impact placement.
- `src/render/BoardScene.tsx`: snapshot-owned rising board content and board-local clipping.
- `src/render/attack-impact-geometry.ts`: deterministic target-only board displacement.
- `src/render/BattleCanvas.tsx`: shared-cue projectile, target board movement, impact ring, and overlay alignment.
- `src/render/event-animation-queue.ts`: map `garbage-raised`; stop independently creating an attack projectile.
- `src/ui/match/sound-feedback.ts`: keep immediate non-attack cues and expose one attack-impact sound helper.
- `src/ui/screens/MatchScreen.tsx`: create the shared timeline, coordinate portraits/HUD/canvas, and deliver impact audio/haptics.

### New tests

- `src/ui/match/attack-feedback.test.ts`
- `src/ui/match/use-reduced-motion.test.tsx`
- `src/ui/match/use-attack-feedback.test.tsx`
- `src/render/attack-impact-geometry.test.ts`

Existing core, render, HUD, portrait, sound, match-screen, replay/property, and integration tests change beside their owners.

---

### Task 1: Immutable garbage-row board primitive

**Files:**
- Modify: `src/core/board.ts`
- Modify: `src/core/index.ts`
- Test: `tests/core/board.test.ts`

**Interfaces:**
- Consumes: `Board`, `Cell`, `BOARD_ROWS`, and `BOARD_WIDTH` from `src/core/model.ts`.
- Produces:

```ts
export type RaiseGarbageRowResult =
  | { readonly board: Board; readonly status: 'raised' }
  | { readonly board: Board; readonly status: 'top-out' | 'invalid-hole' };

export function raiseGarbageRow(
  board: Board,
  holeColumn: number,
): RaiseGarbageRowResult;
```

- A successful result drops the top stored row, shifts every other stored row up one, and appends nine `{ kind: 'O', garbage: true }` cells plus one `null` hole.
- A failed result returns the exact original `board` reference.
- Keep the existing `dropGarbageCell` and `GarbageResult` exports through this
  task so `attack.ts` and the full suite stay green. Task 2 removes them after
  the batch caller has switched.

- [ ] **Step 1: Replace the falling-cell tests with failing row-raise tests**

Add tests that prove immutability, marker preservation, the exact hole, invalid input, and top-out:

```ts
it('raises every fixed cell one row and appends nine garbage cells around one hole', () => {
  let board = boardWithCell(emptyBoard(), 5, 1, {
    kind: 'T',
    marker: 'freeze',
  });
  const snapshot = [...board.cells];

  const result = raiseGarbageRow(board, 4);

  expect(result.status).toBe('raised');
  expect(result.board.cells[4 * BOARD_WIDTH + 1]).toEqual({
    kind: 'T',
    marker: 'freeze',
  });
  const bottom = result.board.cells.slice((BOARD_ROWS - 1) * BOARD_WIDTH);
  expect(bottom[4]).toBeNull();
  expect(bottom.filter((cell) => cell?.garbage === true)).toHaveLength(9);
  expect(board.cells).toEqual(snapshot);
});

it.each([-1, 10, 1.5, Number.NaN])(
  'returns an invalid-hole failure without mutation for %s',
  (holeColumn) => {
    const board = emptyBoard();
    expect(raiseGarbageRow(board, holeColumn)).toEqual({
      board,
      status: 'invalid-hole',
    });
  },
);

it('returns top-out before discarding an occupied top stored row', () => {
  const board = boardWithCell(emptyBoard(), 0, 7);
  expect(raiseGarbageRow(board, 3)).toEqual({ board, status: 'top-out' });
});
```

Add these tests beside the existing falling-cell tests; do not remove the
legacy tests until Task 2.

- [ ] **Step 2: Run the board test and verify RED**

Run:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/core/board.test.ts
```

Expected: FAIL because `raiseGarbageRow` and `RaiseGarbageRowResult` do not exist.

- [ ] **Step 3: Implement the discriminated result and row insertion**

Add this result and function beside the migration-only `GarbageResult` and
`dropGarbageCell`:

```ts
export type RaiseGarbageRowResult =
  | { readonly board: Board; readonly status: 'raised' }
  | { readonly board: Board; readonly status: 'top-out' | 'invalid-hole' };

export function raiseGarbageRow(board: Board, holeColumn: number): RaiseGarbageRowResult {
  if (!Number.isInteger(holeColumn) || holeColumn < 0 || holeColumn >= BOARD_WIDTH) {
    return { board, status: 'invalid-hole' };
  }
  if (board.cells.slice(0, BOARD_WIDTH).some((cell) => cell !== null)) {
    return { board, status: 'top-out' };
  }

  const garbageRow = Array.from<Cell | null>({ length: BOARD_WIDTH }, (_, x) => (
    x === holeColumn ? null : { kind: 'O', garbage: true }
  ));
  return {
    board: { cells: [...board.cells.slice(BOARD_WIDTH), ...garbageRow] },
    status: 'raised',
  };
}
```

Export the function and type from `src/core/index.ts` while retaining the old
exports until Task 2.

- [ ] **Step 4: Run the board test and verify GREEN**

Run the Step 2 command.

Expected: all `tests/core/board.test.ts` tests PASS.

- [ ] **Step 5: Commit the board primitive**

```powershell
git add -- src/core/board.ts src/core/index.ts tests/core/board.test.ts
git diff --cached --check
git commit -m "feat: raise immutable garbage rows"
```

---

### Task 2: Seeded batch rows, event payload, and match integration

**Files:**
- Modify: `src/core/board.ts`
- Modify: `src/core/model.ts`
- Modify: `src/core/attack.ts`
- Modify: `src/core/match.ts`
- Modify: `src/core/index.ts`
- Test: `tests/core/board.test.ts`
- Test: `tests/core/attack.test.ts`
- Test: `tests/core/match.test.ts`
- Test: `tests/core/core-integration.test.ts`
- Test: `tests/core/replay-and-properties.test.ts`

**Interfaces:**
- Consumes: `raiseGarbageRow(board, holeColumn)` from Task 1 and the unchanged `resolveAttackExchange`.
- Produces:

```ts
export function raiseGarbageBatch(
  side: SideState,
  seed: number,
  recipient: SideId,
): { readonly side: SideState; readonly events: readonly GameEvent[] };
```

- Extends `GameEvent['type']` with `garbage-raised` and adds
  `holeColumns?: readonly number[]`. For green intermediate commits, the legacy
  `garbage-landed`, `column`, and `landingRow` members remain type-compatible
  through Tasks 3 to 8, but no core path emits them after this task. Task 9
  removes the compatibility members after every consumer has migrated.
- Emits `{ type: 'garbage-raised', side, amount, holeColumns }` before `top-out` only when at least one row succeeded.

- [ ] **Step 1: Rewrite batch tests for one event and full rows**

Keep every `resolveAttackExchange` assertion unchanged. Replace seeded-cell assertions with exact batch assertions:

```ts
it('raises one deterministic player batch and advances one draw per successful row', () => {
  const original = waitingForGarbage(4);
  const result = raiseGarbageBatch(original, 0, 'player');

  expect(result.events).toEqual([{
    type: 'garbage-raised',
    side: 'player',
    amount: 4,
    holeColumns: [3, 2, 4, 3],
  }]);
  expect(result.side.garbageDrawIndex).toBe(4);
  expect(result.side.incoming).toBe(0);
  for (const [rowOffset, hole] of [3, 2, 4, 3].entries()) {
    const row = result.side.board.cells.slice(
      (BOARD_ROWS - 4 + rowOffset) * BOARD_WIDTH,
      (BOARD_ROWS - 3 + rowOffset) * BOARD_WIDTH,
    );
    expect(row[hole]).toBeNull();
    expect(row.filter((cell) => cell?.garbage === true)).toHaveLength(9);
  }
  expect(original.incoming).toBe(4);
  expect(original.garbageDrawIndex).toBe(0);
});

it('keeps successful rows and does not consume a failed overflow draw', () => {
  const board = boardWithCell(emptyBoard(), 4, 2);
  const result = raiseGarbageBatch(waitingForGarbage(4, board), 0, 'player');

  expect(result.side.garbageDrawIndex).toBe(2);
  expect(result.events).toEqual([
    {
      type: 'garbage-raised',
      side: 'player',
      amount: 2,
      holeColumns: [3, 2],
    },
    { type: 'top-out', side: 'player' },
  ]);
  expect(result.side).toMatchObject({ incoming: 0, phase: 'top-out', topOut: true });
});

it('emits only top-out when the first row cannot rise', () => {
  const board = boardWithCell(emptyBoard(), 7, 0);
  const result = raiseGarbageBatch(waitingForGarbage(3, board), 0, 'player');

  expect(result.side.garbageDrawIndex).toBe(0);
  expect(result.events).toEqual([{ type: 'top-out', side: 'player' }]);
});
```

Add the opponent stream expectation `[5, 2, 9, 2]` and retain the compile-time recipient argument assertion with the new helper name.

- [ ] **Step 2: Update match and property expectations before implementation**

In `tests/core/match.test.ts`, assert that three pending attacks remain queued until hard drop, then yield one event:

```ts
expect(result.events.filter(({ type }) => type === 'garbage-raised')).toEqual([{
  type: 'garbage-raised',
  side: 'player',
  amount: 3,
  holeColumns: [3, 2, 4],
}]);
expect(occupiedCells(result.state.sides.player.board)).toHaveLength(31);
```

In `tests/core/core-integration.test.ts`, replace the repeated-cell assertion with:

```ts
expect(result.events).toContainEqual({
  type: 'garbage-raised',
  side: 'player',
  amount: 5,
  holeColumns: [3, 2, 4, 3, 7],
});
expect(result.state.sides.player.garbageDrawIndex).toBe(5);
```

In the property test, validate `amount === holeColumns.length`, every hole is an integer in `[0, BOARD_WIDTH)`, and event coverage uses `garbage-raised`.

- [ ] **Step 3: Run focused core tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/core/board.test.ts tests/core/attack.test.ts tests/core/match.test.ts tests/core/core-integration.test.ts tests/core/replay-and-properties.test.ts
```

Expected: FAIL on the missing `raiseGarbageBatch` API and old event schema.

- [ ] **Step 4: Implement the successful-draw batch loop**

Replace the old batch helper with this control flow:

```ts
export function raiseGarbageBatch(
  side: SideState,
  seed: number,
  recipient: SideId,
): { readonly side: SideState; readonly events: readonly GameEvent[] } {
  let board = side.board;
  let drawIndex = side.garbageDrawIndex;
  const holeColumns: number[] = [];

  for (let remaining = count(side.incoming); remaining > 0; remaining -= 1) {
    const hole = randomInt(seed, streamFor(recipient), drawIndex, BOARD_WIDTH);
    const raised = raiseGarbageRow(board, hole);
    if (raised.status !== 'raised') {
      const raisedEvent: GameEvent[] = holeColumns.length === 0 ? [] : [{
        type: 'garbage-raised',
        side: recipient,
        amount: holeColumns.length,
        holeColumns,
      }];
      return {
        side: {
          ...side,
          board,
          incoming: 0,
          garbageDrawIndex: drawIndex,
          phase: 'top-out',
          topOut: true,
        },
        events: [...raisedEvent, { type: 'top-out', side: recipient }],
      };
    }
    board = raised.board;
    holeColumns.push(hole);
    drawIndex += 1;
  }

  return {
    side: { ...side, board, incoming: 0, garbageDrawIndex: drawIndex },
    events: holeColumns.length === 0 ? [] : [{
      type: 'garbage-raised',
      side: recipient,
      amount: holeColumns.length,
      holeColumns,
    }],
  };
}
```

Treat `invalid-hole` as the same defensive terminal failure path; production RNG never generates it.

- [ ] **Step 5: Update the event model and the existing match gate**

Add the new type and payload to `GameEvent` while retaining the three legacy
members temporarily:

```ts
readonly type:
  | 'piece-locked'
  | 'lines-cleared'
  | 'attack-sent'
  | 'garbage-raised'
  | 'garbage-landed' // migration-only; removed in Task 9
  | 'item-acquired'
  | 'item-used'
  | 'freeze-applied'
  | 'top-out'
  | 'match-ended';
readonly holeColumns?: readonly number[];
```

Keep `column` and `landingRow` only as migration-compatible optional members.
In `match.ts`, call `raiseGarbageBatch` at the existing `readyForGarbage` loop
without changing when the loop runs. Rename exports in `core/index.ts`.
Now remove `dropGarbageCell`, `GarbageResult`, their public exports, and the
legacy falling-cell test block from `board.ts`, `core/index.ts`, and
`board.test.ts`; no production caller remains.

- [ ] **Step 6: Run core tests and typecheck**

Run the Step 3 command, then:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: focused tests and typecheck PASS. Presentation consumers compile
against the temporary compatibility members but receive only the new event at
runtime.

- [ ] **Step 7: Commit the core batch conversion**

```powershell
git add -- src/core/board.ts src/core/model.ts src/core/attack.ts src/core/match.ts src/core/index.ts tests/core/board.test.ts tests/core/attack.test.ts tests/core/match.test.ts tests/core/core-integration.test.ts tests/core/replay-and-properties.test.ts
git diff --cached --check
git commit -m "feat: apply queued attacks as garbage rows"
```

---

### Task 3: Present all garbage rows as one board rise

**Files:**
- Modify: `src/render/event-animation-queue.ts`
- Modify: `src/render/event-animation-queue.test.ts`
- Modify: `src/render/draw-primitives.ts`
- Modify: `src/render/draw-primitives.test.ts`
- Modify: `src/render/BoardScene.tsx`
- Modify: `src/render/BoardScene.test.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`

**Interfaces:**
- Consumes: `garbage-raised` with `amount` and `holeColumns` from Task 2.
- Produces:

```ts
export function garbageRiseOffsetRows(
  effect: AnimationEffect,
  side: SideId,
  fallbackProgress: number,
): number;
```

- `createBoardPrimitives` gains `contentOffsetRows?: number`; only board content moves, while the background, grid, warning bar, and effect overlays remain fixed.
- `BoardScene` gains optional `reducedMotion?: boolean`, clips shifted content
  to its board rectangle, and uses the event's owning snapshot during the rise.

- [ ] **Step 1: Write failing event and offset tests**

Replace `garbage-landed` literals with one batch event and assert one critical effect:

```ts
const garbageEvent: GameEvent = {
  type: 'garbage-raised',
  side: 'player',
  amount: 3,
  holeColumns: [3, 2, 4],
};

expect(effectsForEvents([garbageEvent], 9, queueView).map(({ group }) => group))
  .toEqual(['garbage-land']);
```

Add offset tests:

```ts
it.each([
  { progress: 0, offset: 3 },
  { progress: 0.5, offset: 1.5 },
  { progress: 1, offset: 0 },
])('moves one three-row batch together at $progress', ({ progress, offset }) => {
  expect(garbageRiseOffsetRows({
    event: garbageEvent,
    group: 'garbage-land',
    id: 'garbage-9',
    priority: 'critical',
    presentationProgress: progress,
    side: 'player',
    tick: 9,
    view: queueView,
  }, 'player', 0)).toBe(offset);
});
```

Assert that `createBoardPrimitives({ contentOffsetRows: 2.5, ... })` moves fixed cells and item markers down by 2.5 rows while leaving grid cells unchanged.

- [ ] **Step 2: Run render tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/render/event-animation-queue.test.ts src/render/draw-primitives.test.ts src/render/BoardScene.test.tsx src/render/BattleCanvas.test.tsx
```

Expected: FAIL because `garbage-raised`, `garbageRiseOffsetRows`, and `contentOffsetRows` are not handled.

- [ ] **Step 3: Map the new event and calculate the capped offset**

Map `garbage-raised` to the existing `garbage-land` animation group. Implement:

```ts
export function garbageRiseOffsetRows(
  effect: AnimationEffect,
  side: SideId,
  fallbackProgress: number,
): number {
  if (animationEffectSide(effect) !== side
    || animationEffectGroup(effect) !== 'garbage-land'
    || effect.event?.type !== 'garbage-raised') return 0;
  const amount = Math.min(20, Math.max(0, Math.trunc(effect.event.amount ?? 0)));
  const progress = Math.min(1, Math.max(
    0,
    effect.presentationProgress ?? fallbackProgress,
  ));
  return amount * (1 - progress);
}
```

For the procedural impact placement, return one board-width primitive at the bottom instead of one falling cell. Rename the primitive role from `garbage-drop` to `garbage-rise-impact`.

- [ ] **Step 4: Offset only movable board primitives**

Add `contentOffsetRows = 0` to `createBoardPrimitives`. Apply it when creating fixed cells, their item markers, active cells, and ghost cells. Keep `board-background`, `grid-cell`, `incoming`, `line-clear`, and effect primitives stationary.

Use the event snapshot while an active rise is present:

```ts
const garbageRise = effects.find((effect) => (
  animationEffectSide(effect) === side
  && animationEffectGroup(effect) === 'garbage-land'
  && effect.event?.type === 'garbage-raised'
));
const contentOffsetRows = garbageRise === undefined
  ? 0
  : garbageRiseOffsetRows(garbageRise, side, effectProgress);
const presentedModel = garbageRise?.view.sides[side] ?? model;
```

- [ ] **Step 5: Clip shifted content inside BoardScene**

Split BoardScene into a stationary background/effect layer and a content layer. Give the content container a rectangular Pixi `Graphics` mask matching `rect.width` by `rect.height`, and apply `contentOffsetRows * rect.height / 20` only to that content container. Keep texture-cache ownership unchanged.

Use this component shape, with the existing procedural and textured content
moved into the masked container:

```tsx
const [contentMask, setContentMask] = useState<Graphics | null>(null);
const captureContentMask = useCallback((value: Graphics | null) => {
  setContentMask((current) => current === value ? current : value);
}, []);

<pixiContainer x={rect.x} y={rect.y}>
  <pixiGraphics draw={drawStationaryBoard} />
  <pixiGraphics ref={captureContentMask} draw={drawBoardMask} />
  <pixiContainer
    alpha={contentAlpha}
    data-content-alpha={contentAlpha}
    data-content-offset-rows={contentOffsetRows}
    mask={contentMask}
    y={contentOffsetRows * rect.height / 20}
  >
    <pixiGraphics draw={drawBoardContent} />
    {texturedCells}
  </pixiContainer>
  {texturedEffects}
</pixiContainer>
```

Expose `data-content-offset-rows` and `data-content-alpha` on the content
container in tests. Assert that a three-row event starts at `3`, ends at `0`,
and uses the event snapshot rather than a later model. With
`reducedMotion={true}`, keep the offset at zero and transition content alpha
from `0.7` to `1`; this replaces row translation with the specified short
opacity presentation.

- [ ] **Step 6: Run render tests and typecheck**

Run the Step 2 command and:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all named render tests PASS and old event-field TypeScript errors are gone from production render files.

- [ ] **Step 7: Commit the batched rise presentation**

```powershell
git add -- src/render/event-animation-queue.ts src/render/event-animation-queue.test.ts src/render/draw-primitives.ts src/render/draw-primitives.test.ts src/render/BoardScene.tsx src/render/BoardScene.test.tsx src/render/BattleCanvas.test.tsx
git diff --cached --check
git commit -m "feat: animate garbage rows as one rise"
```

---

### Task 4: Pure attack cue and intensity model

**Files:**
- Create: `src/ui/match/attack-feedback.ts`
- Create: `src/ui/match/attack-feedback.test.ts`

**Interfaces:**
- Consumes: `GameEventBatch` and the owning `PublicMatchView` snapshot.
- Produces:

```ts
export type AttackIntensity = 'light' | 'medium' | 'strong';
export type AttackFeedbackPhase = 'launch' | 'impact' | 'settle';

export interface AttackFeedbackCue {
  readonly id: string;
  readonly source: SideId;
  readonly target: SideId;
  readonly amount: number;
  readonly combo: number;
  readonly intensity: AttackIntensity;
  readonly comboLabel: string | null;
}

export interface AttackFeedbackPresentation extends AttackFeedbackCue {
  readonly phase: AttackFeedbackPhase;
  readonly phaseProgress: number;
  readonly displacementPx: 0 | 2 | 4 | 6;
  readonly reducedMotion: boolean;
}

export const ATTACK_LAUNCH_MS = 150;
export const ATTACK_SETTLE_MS = 100;
export function attackFeedbackCuesForBatches(
  batches: readonly GameEventBatch[],
): readonly AttackFeedbackCue[];
export function attackFeedbackAtElapsed(
  cue: AttackFeedbackCue,
  elapsedMs: number,
  reducedMotion: boolean,
): AttackFeedbackPresentation | null;
```

- [ ] **Step 1: Write failing cue-mapping and timing tests**

Cover exact thresholds, net amount ownership, combo labels, invalid amounts, batch order, and phase deadlines:

```ts
it.each([
  { amount: 1, combo: 1, intensity: 'light', displacementPx: 2 },
  { amount: 2, combo: 1, intensity: 'medium', displacementPx: 4 },
  { amount: 1, combo: 2, intensity: 'medium', displacementPx: 4 },
  { amount: 4, combo: 1, intensity: 'strong', displacementPx: 6 },
  { amount: 1, combo: 3, intensity: 'strong', displacementPx: 6 },
] as const)('maps $amount attack and $combo combo to $intensity', (sample) => {
  const cue = cueFor(sample.amount, sample.combo);
  expect(cue.intensity).toBe(sample.intensity);
  expect(attackFeedbackAtElapsed(cue, 0, false)?.displacementPx)
    .toBe(sample.displacementPx);
});

it('uses launch, tier impact, settle, then completion boundaries', () => {
  const cue = cueFor(2, 2);
  expect(attackFeedbackAtElapsed(cue, 149, false)?.phase).toBe('launch');
  expect(attackFeedbackAtElapsed(cue, 150, false)?.phase).toBe('impact');
  expect(attackFeedbackAtElapsed(cue, 299, false)?.phase).toBe('impact');
  expect(attackFeedbackAtElapsed(cue, 300, false)?.phase).toBe('settle');
  expect(attackFeedbackAtElapsed(cue, 400, false)).toBeNull();
});

it('keeps phases but removes displacement for reduced motion', () => {
  const presentation = attackFeedbackAtElapsed(cueFor(5, 4), 151, true);
  expect(presentation).toMatchObject({
    phase: 'impact',
    displacementPx: 0,
    reducedMotion: true,
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/match/attack-feedback.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact intensity and duration tables**

Use these authorities:

```ts
const IMPACT_MS: Readonly<Record<AttackIntensity, number>> = {
  light: 120,
  medium: 150,
  strong: 180,
};
const DISPLACEMENT_PX: Readonly<Record<AttackIntensity, 2 | 4 | 6>> = {
  light: 2,
  medium: 4,
  strong: 6,
};

function intensityFor(amount: number, combo: number): AttackIntensity {
  if (amount >= 4 || combo >= 3) return 'strong';
  if (amount >= 2 || combo >= 2) return 'medium';
  return 'light';
}
```

Sort batches by tick and original batch index. For each `attack-sent`, normalize a positive integer amount, read combo from `batch.view.sides[event.side].combo`, derive target as the opposite side, and set ID to `attack:${batch.tick}:${eventIndex}`. Skip zero or invalid amounts.

- [ ] **Step 4: Implement pure phase interpolation**

Clamp negative and non-finite elapsed time to zero. Return launch, impact, and settle with phase-local progress in `[0, 1]`; return null at or after the total duration. Set displacement to zero only when reduced motion is true.

```ts
const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
const impactMs = IMPACT_MS[cue.intensity];
const impactEnd = ATTACK_LAUNCH_MS + impactMs;
const total = impactEnd + ATTACK_SETTLE_MS;
if (elapsed >= total) return null;
if (elapsed < ATTACK_LAUNCH_MS) {
  return presentation(cue, 'launch', elapsed / ATTACK_LAUNCH_MS, reducedMotion);
}
if (elapsed < impactEnd) {
  return presentation(cue, 'impact', (elapsed - ATTACK_LAUNCH_MS) / impactMs, reducedMotion);
}
return presentation(cue, 'settle', (elapsed - impactEnd) / ATTACK_SETTLE_MS, reducedMotion);
```

- [ ] **Step 5: Run the cue test and verify GREEN**

Run the Step 2 command.

Expected: all attack feedback model tests PASS.

- [ ] **Step 6: Commit the pure presentation model**

```powershell
git add -- src/ui/match/attack-feedback.ts src/ui/match/attack-feedback.test.ts
git diff --cached --check
git commit -m "feat: model restrained attack feedback"
```

---

### Task 5: Reduced-motion subscription and FIFO feedback timeline

**Files:**
- Create: `src/ui/match/use-reduced-motion.ts`
- Create: `src/ui/match/use-reduced-motion.test.tsx`
- Create: `src/ui/match/use-attack-feedback.ts`
- Create: `src/ui/match/use-attack-feedback.test.tsx`

**Interfaces:**
- Consumes: Task 4 cue extraction and elapsed-time presentation.
- Produces:

```ts
export function useReducedMotion(): boolean;

export interface UseAttackFeedbackOptions {
  readonly eventBatches: readonly GameEventBatch[];
  readonly onImpact?: (cue: AttackFeedbackCue) => void;
  readonly reducedMotion: boolean;
}

export function useAttackFeedback(
  options: UseAttackFeedbackOptions,
): AttackFeedbackPresentation | null;
```

- Keeps one active cue, queues every unseen cue FIFO, calls `onImpact` exactly once when launch crosses into impact, and cancels its frame on unmount.

- [ ] **Step 1: Write failing motion-subscription tests**

Mock `window.matchMedia` with `matches`, `addEventListener`, and `removeEventListener`. Render a probe component and assert false fallback, initial true, change publication, and cleanup:

```tsx
function MotionProbe() {
  return <output data-testid="motion">{String(useReducedMotion())}</output>;
}

expect(screen.getByTestId('motion')).toHaveTextContent('true');
act(() => changeListener?.({ matches: false } as MediaQueryListEvent));
expect(screen.getByTestId('motion')).toHaveTextContent('false');
```

- [ ] **Step 2: Write failing timeline tests with a manual RAF clock**

Use a probe that exposes the current phase and capture `onImpact`. Test:

```tsx
function FeedbackProbe(props: UseAttackFeedbackOptions) {
  const feedback = useAttackFeedback(props);
  return <output data-testid="feedback">
    {feedback === null ? 'none' : `${feedback.id}:${feedback.phase}`}
  </output>;
}
```

Prove these behaviors:

- one attack starts at launch;
- crossing 150 ms starts impact and calls `onImpact` once;
- rerendering the same batch does not restart or call again;
- two catch-up batches play in tick order without dropping either;
- `reducedMotion: true` yields zero displacement;
- unmount cancels the pending frame.

- [ ] **Step 3: Run both hook tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/match/use-reduced-motion.test.tsx src/ui/match/use-attack-feedback.test.tsx
```

Expected: FAIL because both hooks are missing.

- [ ] **Step 4: Implement the media-query hook**

Query `'(prefers-reduced-motion: reduce)'`, default to false when `matchMedia` is absent, subscribe with `change`, and remove the exact listener during cleanup.

```ts
const query = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const [reduced, setReduced] = useState(query?.matches ?? false);
useEffect(() => {
  if (query === null) return;
  const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}, [query]);
```

- [ ] **Step 5: Implement FIFO ownership with refs and one RAF**

Use refs for handled IDs, pending cues, the active cue/start time, and impacted IDs. Store `onImpact` in a current ref. On each event batch update:

```ts
for (const cue of attackFeedbackCuesForBatches(eventBatches)) {
  if (handledIds.current.has(cue.id)) continue;
  handledIds.current.add(cue.id);
  pending.current.push(cue);
}
```

Start the first pending cue at `performance.now()`. Each RAF computes `attackFeedbackAtElapsed`; when phase first becomes `impact`, add the cue ID to `impactedIds` before invoking the callback. When a cue returns null, remove it, start the next pending cue at the current frame timestamp, and continue. Publish null and stop requesting frames when the queue is empty.

- [ ] **Step 6: Run hook tests and verify GREEN**

Run the Step 3 command.

Expected: all hook tests PASS with zero pending frames after unmount.

- [ ] **Step 7: Commit the presentation clock**

```powershell
git add -- src/ui/match/use-reduced-motion.ts src/ui/match/use-reduced-motion.test.tsx src/ui/match/use-attack-feedback.ts src/ui/match/use-attack-feedback.test.tsx
git diff --cached --check
git commit -m "feat: queue attack feedback timelines"
```

---

### Task 6: HUD combo, local plate reaction, and portrait override

**Files:**
- Modify: `src/ui/match/portrait-state.ts`
- Modify: `src/ui/match/portrait-state.test.ts`
- Modify: `src/ui/match/BattleHud.tsx`
- Modify: `src/ui/match/BattleHud.test.tsx`
- Modify: `src/ui/match/match-layout.css`

**Interfaces:**
- Consumes: `AttackFeedbackPresentation` from Task 4.
- Produces:

```ts
export function portraitStateWithAttackFeedback(
  base: PortraitState,
  side: SideId,
  terminal: boolean,
  feedback: AttackFeedbackPresentation | null,
): PortraitState;
```

- `BattleHudProps` gains `feedback?: AttackFeedbackPresentation | null`.
- Source launch displays `attack`; target impact displays `hit`; terminal state
  wins. The old tick-memory attack and garbage reactions remain temporarily so
  the intermediate commit keeps MatchScreen regressions green; Task 8 removes
  those two legacy owners when the shared timeline is wired.

- [ ] **Step 1: Write failing portrait override tests**

Add exact source, target, phase, and terminal cases:

```ts
expect(portraitStateWithAttackFeedback('idle', 'player', false, {
  ...launchFeedback,
  source: 'player',
  target: 'opponent',
})).toBe('attack');
expect(portraitStateWithAttackFeedback('idle', 'opponent', false, {
  ...impactFeedback,
  source: 'player',
  target: 'opponent',
})).toBe('hit');
expect(portraitStateWithAttackFeedback('defeat', 'opponent', true, impactFeedback))
  .toBe('defeat');
```

Keep existing memory assertions unchanged in this task. Add only the pure
override cases. The ownership switch belongs to Task 8 so MatchScreen never has
an intermediate commit with no attack or hit portrait feedback.

- [ ] **Step 2: Write failing HUD behavior tests**

Render synthetic launch and impact presentations. Assert:

```ts
expect(hud).toHaveAttribute('data-attack-role', 'source');
expect(hud).toHaveAttribute('data-attack-phase', 'launch');
expect(hud).toHaveAttribute('data-impact-intensity', 'medium');
expect(within(hud).getByText('2 COMBO!')).toBeVisible();
```

For target impact, expect role `target` and no combo label. For reduced motion, expect `data-reduced-motion="true"`.

- [ ] **Step 3: Run portrait and HUD tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.test.tsx
```

Expected: FAIL because feedback override and HUD props do not exist.

- [ ] **Step 4: Implement portrait priority and HUD data**

Implement terminal-first priority, then source launch, then target impact, otherwise base. In `BattleHud`, derive role from `side`, render the combo label only for source feedback with non-null `comboLabel`, and attach deterministic data attributes to the section.

```ts
export function portraitStateWithAttackFeedback(
  base: PortraitState,
  side: SideId,
  terminal: boolean,
  feedback: AttackFeedbackPresentation | null,
): PortraitState {
  if (terminal || feedback === null) return base;
  if (feedback.phase === 'launch' && feedback.source === side) return 'attack';
  if (feedback.phase === 'impact' && feedback.target === side) return 'hit';
  return base;
}
```

```tsx
{feedback?.source === side && feedback.comboLabel !== null ? (
  <output className="battle-hud__combo-pop" key={feedback.id}>
    {feedback.comboLabel}
  </output>
) : null}
```

- [ ] **Step 5: Add restrained transform/opacity CSS**

Set `.battle-hud { position: relative; }`. Add intensity variables of 2 px, 4 px, and 6 px. During source launch, move only the portrait plate forward at most 2 px. During target impact, apply one damped plate transform and one outline-opacity pulse. Position `.battle-hud__combo-pop` absolutely so it creates no layout shift.

Add both selectors:

```css
.battle-hud[data-reduced-motion="true"] .battle-hud__portrait--plate {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .battle-hud__portrait--plate {
    transform: none !important;
  }
}
```

Do not animate width, height, margin, padding, left, or top.

- [ ] **Step 6: Run tests and typecheck**

Run the Step 3 command and:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: portrait and HUD tests and typecheck PASS. MatchScreen remains on its
base portrait presentation until the optional feedback prop is wired in Task 8.

- [ ] **Step 7: Commit the character reaction layer**

```powershell
git add -- src/ui/match/portrait-state.ts src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.tsx src/ui/match/BattleHud.test.tsx src/ui/match/match-layout.css
git diff --cached --check
git commit -m "feat: react portraits and hud to attacks"
```

---

### Task 7: Shared-cue projectile, target-only board nudge, and impact ring

**Files:**
- Create: `src/render/attack-impact-geometry.ts`
- Create: `src/render/attack-impact-geometry.test.ts`
- Modify: `src/render/attack-ribbon.ts`
- Modify: `src/render/attack-ribbon.test.ts`
- Modify: `src/render/event-animation-queue.ts`
- Modify: `src/render/event-animation-queue.test.ts`
- Modify: `src/render/BattleCanvas.tsx`
- Modify: `src/render/BattleCanvas.test.tsx`

**Interfaces:**
- Consumes: `AttackFeedbackPresentation` from Task 4 and board layout rectangles.
- Produces:

```ts
export interface ImpactOffset { readonly x: number; readonly y: number }
export function boardImpactOffset(
  feedback: AttackFeedbackPresentation | null,
  side: SideId,
  sourceRect: Rect,
  targetRect: Rect,
): ImpactOffset;
```

- `BattleCanvasProps` gains optional
  `attackFeedback?: AttackFeedbackPresentation | null`, defaulting to null so
  the canvas commit remains compatible until MatchScreen wiring in Task 8.
- `BattleCanvasProps` also gains optional `reducedMotion?: boolean`, defaulting
  to false and forwarding it to both BoardScene instances.
- `attack-sent` no longer creates an independent `attack-shot` effect in `effectsForEvents`.

- [ ] **Step 1: Write failing deterministic geometry tests**

Test zero motion outside target impact and bounded damped motion during impact:

```ts
expect(boardImpactOffset(null, 'opponent', playerRect, opponentRect))
  .toEqual({ x: 0, y: 0 });
expect(boardImpactOffset(launchFeedback, 'opponent', playerRect, opponentRect))
  .toEqual({ x: 0, y: 0 });
expect(boardImpactOffset({ ...impactFeedback, phaseProgress: 0.25 }, 'player', playerRect, opponentRect))
  .toEqual({ x: 0, y: 0 });

const offset = boardImpactOffset(
  { ...impactFeedback, phaseProgress: 0.25, displacementPx: 6 },
  'opponent',
  playerRect,
  opponentRect,
);
expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(6);
```

Return zero for reduced motion because its presentation displacement is already zero.

- [ ] **Step 2: Write failing BattleCanvas feedback tests**

Change existing attack tests so an `attack-sent` event alone creates no projectile. Pass a launch presentation and assert exactly one atlas sprite or procedural ribbon. Pass impact presentation and assert:

- projectile is absent;
- one impact ring is present at the target;
- only the target BoardScene rectangle is displaced;
- `player-board-overlay` receives the same offset when player is the target;
- reduced motion keeps both board rectangles unchanged and is forwarded to
  both BoardScene instances for garbage-rise presentation.

- [ ] **Step 3: Run focused canvas tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/render/attack-impact-geometry.test.ts src/render/attack-ribbon.test.ts src/render/event-animation-queue.test.ts src/render/BattleCanvas.test.tsx
```

Expected: FAIL because the geometry module and `attackFeedback` prop are missing.

- [ ] **Step 4: Implement one bounded damped offset**

During target impact only, compute the normalized source-to-target direction and multiply by:

```ts
const damped = Math.sin(feedback.phaseProgress * Math.PI * 2)
  * (1 - feedback.phaseProgress)
  * feedback.displacementPx;
```

Return `{ x: directionX * damped, y: directionY * damped }`. Clamp phase progress to `[0, 1]`; never use randomness.

- [ ] **Step 5: Make the shared cue the only projectile owner**

Remove `attack-sent` from `groupForEvent`. During feedback launch, ease projectile progress with `1 - (1 - progress) ** 3`, then use `computeAttackRibbon`. In reduced motion, draw the projectile at target position and vary alpha only. Reuse the complete `attack-shot` atlas when present and the existing procedural ribbon otherwise.

```ts
const projectileProgress = attackFeedback?.reducedMotion
  ? 1
  : 1 - (1 - attackFeedback!.phaseProgress) ** 3;
const ribbon = computeAttackRibbon(sourceRect, targetRect, projectileProgress);
```

- [ ] **Step 6: Render target impact without moving the canvas root**

Apply the geometry result by offsetting only the target BoardScene rectangle. Draw one ring whose radius increases and alpha decreases with impact progress. Forward the same x/y offset to the player board DOM overlay. Add test IDs `attack-impact-ring` and existing `attack-shot-sprite` / `attack-ribbon`; do not add particles or flashes.

```ts
const playerOffset = boardImpactOffset(attackFeedback, 'player', sourceRect, targetRect);
const opponentOffset = boardImpactOffset(attackFeedback, 'opponent', sourceRect, targetRect);
const presentedPlayer = {
  ...layout.player,
  x: layout.player.x + playerOffset.x,
  y: layout.player.y + playerOffset.y,
};
```

Use `presentedPlayer` for both the player BoardScene and overlay coordinates;
use the equivalent opponent rectangle only for the opponent BoardScene.

- [ ] **Step 7: Run canvas tests and typecheck**

Run the Step 3 command and:

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: focused render tests PASS; no duplicate projectile is created from event animation effects.

- [ ] **Step 8: Commit the canvas impact layer**

```powershell
git add -- src/render/attack-impact-geometry.ts src/render/attack-impact-geometry.test.ts src/render/attack-ribbon.ts src/render/attack-ribbon.test.ts src/render/event-animation-queue.ts src/render/event-animation-queue.test.ts src/render/BattleCanvas.tsx src/render/BattleCanvas.test.tsx
git diff --cached --check
git commit -m "feat: add restrained target impact feedback"
```

---

### Task 8: MatchScreen coordination, impact audio, and one-shot haptics

**Files:**
- Modify: `src/ui/match/sound-feedback.ts`
- Modify: `src/ui/match/sound-feedback.test.ts`
- Modify: `src/ui/match/portrait-state.ts`
- Modify: `src/ui/match/portrait-state.test.ts`
- Modify: `src/ui/screens/MatchScreen.tsx`
- Modify: `src/ui/screens/MatchScreen.test.tsx`

**Interfaces:**
- Consumes: `useAttackFeedback`, `AttackFeedbackCue`, updated `BattleHud`, updated `BattleCanvas`, and existing `AudioPort` / `PlatformPort`.
- Produces:

```ts
export function attackSoundFeedback(amount: number): SoundFeedback;

export type AttackFeedbackHook = (
  options: UseAttackFeedbackOptions,
) => AttackFeedbackPresentation | null;
```

- `soundFeedbackForEvents` excludes `attack-sent`; MatchScreen calls `attackSoundFeedback` only at timeline impact.
- `hapticForEvent` excludes `attack-sent`; MatchScreen sends `success` for a player source or `error` for an opponent source only at impact.

- [ ] **Step 1: Write failing sound ownership tests**

Update sound tests:

```ts
expect(soundFeedbackForEvents([
  { type: 'attack-sent', side: 'player', amount: 4 },
], viewWithPlayerCombo(3))).toEqual([]);

expect(attackSoundFeedback(1)).toEqual({
  cue: 'attack',
  options: { intensity: 0, duckMusic: false },
});
expect(attackSoundFeedback(4)).toEqual({
  cue: 'attack',
  options: { intensity: 3, duckMusic: true },
});
```

Change `garbage-raised` to map to one `land` cue regardless of amount.

- [ ] **Step 2: Write failing MatchScreen coordination tests**

Extend the BattleCanvas mock to capture `attackFeedback`. Supply an injectable `useAttackFeedbackImpl` prop following the existing `useMatchLoopImpl` pattern. A test implementation captures `onImpact` and returns a synthetic presentation.

Assert all of the following:

- both HUDs and BattleCanvas receive the same presentation object;
- source launch uses attack portrait and target impact uses hit portrait;
- terminal portrait still wins;
- `onEvents` immediately forwards score events and plays non-attack clear audio;
- `onEvents` does not play attack audio or attack haptic;
- invoking the captured impact callback plays attack audio once and calls one source-dependent haptic;
- disabled sound or haptics suppress only that channel;
- thrown/rejected audio and haptic calls do not interrupt score forwarding or rendering.

Update portrait-memory tests in this same RED step: `garbage-raised` no longer
starts `hit`, `attack-sent` no longer starts tick-owned `attack`, freeze still
starts `hit`, and a lieutenant attack still records its post-attack
`smugUntil` deadline. For an attack at tick 30, assert `attackUntil === 0` and
`smugUntil === 69` (`30 + 18 + 21`). For a garbage batch at tick 10, assert
`hitUntil === 0`; the freeze event at tick 10 still yields `hitUntil === 35`.

- [ ] **Step 3: Run sound and MatchScreen tests and verify RED**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.test.tsx
```

Expected: FAIL because attack impact is still delivered immediately and feedback is not wired.

- [ ] **Step 4: Separate immediate and impact sound feedback**

Remove `attack-sent` from `cueForEvent`. Export `attackSoundFeedback(amount)` using the existing clamped `(amount - 1)` intensity and `duckMusic: intensity >= 2`. Map `garbage-raised` with any positive amount to one land cue.

```ts
export function attackSoundFeedback(amount: number): SoundFeedback {
  const intensity = clampIntensity(amount - 1);
  return {
    cue: 'attack',
    options: { intensity, duckMusic: intensity >= 2 },
  };
}
```

- [ ] **Step 5: Create one stable impact callback**

Add `useAttackFeedbackImpl = useAttackFeedback` to props. Call
`useReducedMotion()` once in MatchScreen, pass its value as the timeline's
`reducedMotion` option, and pass the same value to BattleCanvas. Use a
ref-backed callback so settings and ports stay current without restarting the
timeline:

```ts
const handleAttackImpact = useCallback((cue: AttackFeedbackCue) => {
  const feedback = feedbackRef.current;
  if (feedback.settings.soundEnabled) {
    const sound = attackSoundFeedback(cue.amount);
    try {
      feedback.audio.play(sound.cue, sound.options);
    } catch {
      // Optional audio feedback cannot own the match or presentation clock.
    }
  }
  if (feedback.settings.hapticsEnabled) {
    const haptic = cue.source === 'player' ? 'success' : 'error';
    ignoreEffect(() => feedback.platform.haptic(haptic));
  }
}, []);
```

Keep the existing explanatory comments in empty catches so optional ports remain clearly isolated.

- [ ] **Step 6: Wire one presentation everywhere**

Call the hook with `match.eventBatches` and the stable impact callback. Pass the returned object to both BattleHud instances and BattleCanvas. Feed it into `portraitStateWithAttackFeedback` before `createPortraitPresentation`. Remove tick-memory attack and garbage hit ownership as specified in Task 6.

```tsx
const reducedMotion = useReducedMotion();
const attackFeedback = useAttackFeedbackImpl({
  eventBatches: match.eventBatches,
  onImpact: handleAttackImpact,
  reducedMotion,
});

<BattleHud feedback={attackFeedback} side="player" {...playerHudProps} />
<BattleHud feedback={attackFeedback} side="opponent" {...opponentHudProps} />
<BattleCanvas
  attackFeedback={attackFeedback}
  reducedMotion={reducedMotion}
  {...canvasProps}
/>
```

Keep `onScoreEvents` immediate and preserve its exact input array identity.

In `portrait-state.ts`, remove `garbage-raised` from the hit-memory branch and
remove `attackUntil` changes for `attack-sent`. Preserve lieutenant smug memory
by setting its deadline directly from the attack event tick. The shared
presentation override now exclusively owns source launch and target impact
poses.

- [ ] **Step 7: Run integrated UI tests and typecheck**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/ui/match/attack-feedback.test.ts src/ui/match/use-reduced-motion.test.tsx src/ui/match/use-attack-feedback.test.tsx src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.test.tsx src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.test.tsx src/render/BattleCanvas.test.tsx
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
```

Expected: all named tests and typecheck PASS.

- [ ] **Step 8: Commit coordinated feedback delivery**

```powershell
git add -- src/ui/match/sound-feedback.ts src/ui/match/sound-feedback.test.ts src/ui/match/portrait-state.ts src/ui/match/portrait-state.test.ts src/ui/screens/MatchScreen.tsx src/ui/screens/MatchScreen.test.tsx
git diff --cached --check
git commit -m "feat: synchronize attack impact feedback"
```

---

### Task 9: Regression cleanup and delivery verification

**Files:**
- Modify: `src/core/model.ts`
- Modify only if the obsolete-name scan identifies an event literal in an
  already named active test file.
- Do not modify `tmp/` or historical design specs.

**Interfaces:**
- Consumes: all Tasks 1 through 8.
- Produces: a clean source tree, full automated evidence, a mobile portrait smoke result, and final commits ready to push.

- [ ] **Step 1: Remove migration-only event members and prove obsolete names are gone**

In `src/core/model.ts`, remove `garbage-landed` from `GameEvent['type']` and
remove the optional `column` and `landingRow` fields. Keep `garbage-raised` and
`holeColumns`.

```powershell
rg -n "garbage-landed|dropGarbageCell|dropGarbageBatch|landingRow" src tests
```

Expected: no matches. If a named active test still contains one, replace it with `garbage-raised` and the exact batch payload, run that test, and commit only that test with `test: align garbage row event coverage`.

Commit the schema removal:

```powershell
git add -- src/core/model.ts
git diff --cached --check
git commit -m "refactor: remove legacy garbage event schema"
```

- [ ] **Step 2: Run the focused core suite**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- tests/core/board.test.ts tests/core/attack.test.ts tests/core/match.test.ts tests/core/core-integration.test.ts tests/core/replay-and-properties.test.ts tests/ai/items.test.ts
```

Expected: PASS, including the 500-run deterministic replay/property test.

- [ ] **Step 3: Run the focused presentation suite**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test -- src/render/event-animation-queue.test.ts src/render/draw-primitives.test.ts src/render/BoardScene.test.tsx src/render/attack-ribbon.test.ts src/render/attack-impact-geometry.test.ts src/render/BattleCanvas.test.tsx src/ui/match/attack-feedback.test.ts src/ui/match/use-reduced-motion.test.tsx src/ui/match/use-attack-feedback.test.tsx src/ui/match/portrait-state.test.ts src/ui/match/BattleHud.test.tsx src/ui/match/sound-feedback.test.ts src/ui/screens/MatchScreen.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run the complete unit suite and static checks**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' test
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run typecheck
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run check:source-policy
```

Expected: all commands exit 0.

- [ ] **Step 5: Build production web and run delivery gates**

```powershell
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run build:web
& 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd' run test:delivery-gates
```

Expected: both commands exit 0. Do not run `check:ait` without an explicit `.ait` artifact path.

- [ ] **Step 6: Perform a read-only 360x640 smoke against the existing port-5173 server**

Do not start or stop a server. Run this Node script from the delivery worktree:

```powershell
@'
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/');
await page.locator('.title-screen__action--start').click();
await page.getByTestId('tower-screen').waitFor();
await page.locator('.floor-card').first().click();
await page.getByTestId('floor-intro-screen').waitFor();
await page.locator('.floor-intro-screen .screen-actions button').last().click();
await page.getByTestId('match-screen').waitFor();
const evidence = await page.evaluate(() => ({
  bodyWidth: document.body.scrollWidth,
  viewportWidth: window.innerWidth,
  canvas: document.querySelector('[data-testid="battle-canvas"]')?.getBoundingClientRect().toJSON(),
  controls: document.querySelector('.match-controls')?.getBoundingClientRect().toJSON(),
  hudRoles: [...document.querySelectorAll('.battle-hud')].map((node) => ({
    attackRole: node.getAttribute('data-attack-role'),
    phase: node.getAttribute('data-attack-phase'),
    rect: node.getBoundingClientRect().toJSON(),
  })),
}));
if (errors.length > 0) throw new Error(errors.join('\n'));
if (evidence.bodyWidth > evidence.viewportWidth) throw new Error(JSON.stringify(evidence));
if (!evidence.canvas || !evidence.controls || evidence.hudRoles.length !== 2) throw new Error(JSON.stringify(evidence));
console.log(JSON.stringify(evidence));
await browser.close();
'@ | & 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe' --input-type=module
```

Expected: JSON evidence with two HUDs, a visible canvas and controls, no horizontal overflow, and no browser errors. If the existing server is unavailable, report the smoke as not run; do not replace or stop the user's process.

- [ ] **Step 7: Inspect final Git state and commit any verified test-only adjustment**

```powershell
git status --short --branch
git diff --check
git log -10 --oneline --decorate
```

Expected: only the user-owned `?? tmp/` remains unstaged; the feature branch contains the task commits and is ahead of its remote until push authorization is exercised.

- [ ] **Step 8: Push only after all required verification is green**

```powershell
git push origin feat/pve-delivery
```

Expected: the remote branch advances to the verified local HEAD. If any required check failed, do not push and report the exact failure instead.
