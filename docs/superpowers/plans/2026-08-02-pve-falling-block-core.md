# Deterministic PvE Falling-Block Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure TypeScript, deterministic 60 Hz two-side falling-block battle core implementing SRS/7-bag play, simultaneous attack offset and garbage, all three items, replay, public observations, and invariant/property tests.

**Architecture:** Keep all authoritative rules under `src/core` as immutable state transitions. `stepMatch` consumes tick-stamped commands, advances both sides from snapshots, resolves cross-side effects simultaneously, and emits ordered events; rendering, UI, AI search, persistence, and wall-clock scheduling remain consumers of this API.

**Tech Stack:** TypeScript, Vitest, fast-check, npm, Node.js ESM

## Global Constraints

- Core code imports no DOM, React, PixiJS, Apps-in-Toss SDK, wall clock, or unseeded randomness.
- Use exactly 60 fixed game ticks per second; rendering cadence cannot change rule outcomes.
- Each board is 10 columns by 24 stored rows: hidden rows `0..3`, visible rows `4..23`.
- Use seven four-cell pieces, deterministic 7-bag generation, clockwise SRS wall kicks, two previews, and no general hold.
- Gravity is 48 ticks per row, continuous soft drop is 3 ticks per row, lock delay is 30 ticks, and at most 15 successful grounded moves/rotations reset lock delay.
- A normal clear sends `clearedLines + max(0, combo - 1)` with no combo or garbage cap; a no-clear lock resets combo to zero.
- Garbage uses recipient-specific seeded columns with replacement, lands one cell at a time, does not itself scan full rows, and tops out above hidden row zero or on blocked spawn.
- Item eligibility is tested exactly once per newly generated piece at 15%; each type appears at most once per side per match.
- Freeze lasts exactly 180 game ticks and pauses the target's commands, AI advancement, gravity, lock delay, item timing, and garbage application.
- Equal seeds and equal ordered `TimedCommand` values must produce byte-equivalent event sequences and equal state hashes.
- `MatchState.tick` is the last completed tick. A new match starts at tick `0`; `stepMatch` accepts only commands for `state.tick + 1`, resolves that tick, and returns a state whose tick is incremented by one.
- Do not add AI search, UI, rendering, persistence, platform integration, or network code in this plan.

---

## Planned File Map

- `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`: strict TypeScript and deterministic test tooling.
- `src/core/model.ts`: constants, state, command, event, public-view, and replay-facing types.
- `src/core/random.ts`: counter-based seeded random values and isolated stream identifiers.
- `src/core/pieces.ts`: piece geometry, 7-bag lookup, spawn, SRS kicks, and ghost projection.
- `src/core/board.ts`: board collision, lock, normal line clears, explicit row deletion, and garbage landing.
- `src/core/field.ts`: per-side fixed-tick `active`/`lock`/`clear-and-attack` state transitions.
- `src/core/items.ts`: marker generation/acquisition and row-clear, freeze, and queue-swap effects.
- `src/core/attack.ts`: combo attack calculation, simultaneous offset/return, and garbage batches.
- `src/core/match.ts`: immutable two-side orchestration and public/AI-safe projections.
- `src/core/invariants.ts`, `src/core/replay.ts`: invariant diagnostics, canonical hashes, and replay execution.
- `src/core/index.ts`: sole consumer-facing barrel with the integration contract at the end of this plan.
- `tests/core/*.test.ts`: example, integration, determinism, replay, invariant, and property tests.

### Task 1: Tooling, Canonical Contracts, and Isolated Random Streams

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/core/model.ts`
- Create: `src/core/random.ts`
- Test: `tests/core/random.test.ts`

**Interfaces:**
- Produces: `SideId`, the exact `GameCommand` and `TimedCommand` unions, board/timing constants, `counterU32(seed, stream, index, lane?)`, `randomInt(seed, stream, index, maxExclusive, lane?)`, and immutable domain state types used by every later task.
- Consumes: none.

- [ ] **Step 1: Bootstrap the runner and write the failing random-vector test**

Run:

```powershell
npm init -y
npm install --save-dev typescript@7.0.2 vitest@4.1.10 @vitest/coverage-v8@4.1.10 fast-check@4.9.0 @types/node@22.20.1
npm pkg set type=module scripts.test="vitest run" scripts.typecheck="tsc --noEmit"
npm pkg set private=true --json
```

Create strict `tsconfig.json` with `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `strict: true`, `noUncheckedIndexedAccess: true`, and includes `src` and `tests`. Configure Vitest for `tests/**/*.test.ts`, Node environment, and no concurrent test files. Then add:

```ts
// tests/core/random.test.ts
import { describe, expect, it } from 'vitest';
import { RandomStream, counterU32, randomInt } from '../../src/core/random';

describe('counter RNG', () => {
  it('matches a stable vector and isolates streams', () => {
    const values = [0, 1, 2, 3, 4].map((i) => counterU32(0x12345678, RandomStream.PIECE_BAG, i));
    expect(values).toEqual([1207327010, 3383226662, 2337268077, 2678027879, 1617876997]);
    expect(counterU32(0x12345678, RandomStream.ITEM, 0)).toBe(666545579);
    expect(randomInt(7, RandomStream.GARBAGE_TO_PLAYER, 12, 10)).toBeGreaterThanOrEqual(0);
    expect(randomInt(7, RandomStream.GARBAGE_TO_PLAYER, 12, 10)).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `npm test -- tests/core/random.test.ts`

Expected: FAIL because `src/core/random.ts` does not exist.

- [ ] **Step 3: Add canonical types and the minimal counter RNG**

Use these exact public command shapes in `model.ts`:

```ts
export type SideId = 'player' | 'opponent';
export type GameCommand =
  | { readonly type: 'move'; readonly dx: -1 | 1 }
  | { readonly type: 'rotate-clockwise' }
  | { readonly type: 'soft-drop'; readonly active: boolean }
  | { readonly type: 'hard-drop' }
  | { readonly type: 'use-row-clear'; readonly row: number }
  | { readonly type: 'use-freeze' }
  | { readonly type: 'use-queue-swap' };
export type TimedCommand = { readonly tick: number; readonly side: SideId; readonly command: GameCommand };
export type MatchConfig = { readonly matchSeed: number; readonly countdownTicks?: number };
export type MatchStep = { readonly state: MatchState; readonly events: readonly GameEvent[] };

export const BOARD_WIDTH = 10;
export const HIDDEN_ROWS = 4;
export const VISIBLE_ROWS = 20;
export const BOARD_ROWS = 24;
export const GRAVITY_TICKS = 48;
export const SOFT_DROP_TICKS = 3;
export const LOCK_DELAY_TICKS = 30;
export const MAX_LOCK_RESETS = 15;
export const FREEZE_TICKS = 180;
```

Define `PieceKind`, `Rotation`, `ItemType`, `Cell`, `PieceToken`, `ActivePiece`, `Inventory`, `SideState`, `MatchConfig`, `MatchState`, `GameEvent`, `MatchStep`, `PublicSideView`, `PublicMatchView`, and `AiObservation` as readonly types. Internal `MatchState` must contain the seed, RNG draw counters, full piece tokens, and both side states; public types must not contain those fields.

```ts
// src/core/random.ts
export const enum RandomStream {
  PIECE_BAG = 1, ITEM = 2, GARBAGE_TO_PLAYER = 3,
  GARBAGE_TO_OPPONENT = 4, AI_MISTAKE = 5,
}
export function counterU32(seed: number, stream: RandomStream, index: number, lane = 0): number {
  let x = (seed ^ Math.imul(stream + 1, 0x9e3779b9) ^ Math.imul(index + 1, 0x85ebca6b) ^ Math.imul(lane + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
export function randomInt(seed: number, stream: RandomStream, index: number, maxExclusive: number, lane = 0): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError('maxExclusive must be positive');
  return Math.floor((counterU32(seed, stream, index, lane) / 0x1_0000_0000) * maxExclusive);
}
```

- [ ] **Step 4: Verify the foundation**

Run: `npm test -- tests/core/random.test.ts` and `npm run typecheck`

Expected: both commands PASS with zero type errors.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts src/core/model.ts src/core/random.ts tests/core/random.test.ts
git commit -m "feat(core): add deterministic domain contracts and rng"
```

### Task 2: Seven-Bag Pieces, SRS, Spawn, and Ghost

**Files:**
- Create: `src/core/pieces.ts`
- Test: `tests/core/pieces.test.ts`

**Interfaces:**
- Consumes: `PieceKind`, `PieceToken`, `ActivePiece`, board constants, `randomInt`.
- Produces: `pieceKindAt(seed, serial): PieceKind`, `spawnPiece(token): ActivePiece`, `cellsFor(piece)`, `tryRotateClockwise(board, piece)`, and `ghostY(board, piece)`.

- [ ] **Step 1: Write failing geometry, bag, and kick tests**

```ts
it('emits every kind exactly once in each bag', () => {
  for (let bag = 0; bag < 4; bag += 1) {
    expect(new Set(Array.from({ length: 7 }, (_, i) => pieceKindAt(91, bag * 7 + i))).size).toBe(7);
  }
});

it('uses the I 1->2 wall kick and keeps marker identity', () => {
  const piece = makeActive({ serial: 0, kind: 'I', marker: { item: 'freeze', minoIndex: 2 } }, -2, 4, 1);
  const rotated = tryRotateClockwise(emptyBoard(), piece);
  expect(rotated && { x: rotated.x, rotation: rotated.rotation }).toEqual({ x: 0, rotation: 2 });
  expect(cellsFor(rotated!)[2]).toEqual(expect.objectContaining({ marker: 'freeze' }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/pieces.test.ts`

Expected: FAIL because piece APIs are missing.

- [ ] **Step 3: Implement complete geometry and SRS tables**

Represent each orientation as four ordered `(x,y)` offsets so `minoIndex` survives rotation. Use canonical 4×4 spawn matrices for `I,J,L,O,S,T,Z`, origin `(x=3,y=2)`, and identical O orientations. Use these exact clockwise SRS kick candidates, already converted for board Y increasing downward; each list is tried from left to right:

```ts
const JLSTZ_CW_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
} as const;
const I_CW_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
} as const;
```

`tryRotateClockwise` tests candidates in listed order and returns the first collision-free immutable piece, or the original piece when none fit. Implement each bag with Fisher-Yates over `[I,J,L,O,S,T,Z]`, keyed by `bagIndex=floor(serial/7)` and RNG lane per swap, so lookup order cannot consume state.

```ts
export function pieceKindAt(seed: number, serial: number): PieceKind;
export function spawnPiece(token: PieceToken): ActivePiece;
export function cellsFor(piece: ActivePiece): readonly PositionedCell[];
export function tryRotateClockwise(board: Board, piece: ActivePiece): ActivePiece;
export function ghostY(board: Board, piece: ActivePiece): number;
```

- [ ] **Step 4: Verify pieces**

Run: `npm test -- tests/core/pieces.test.ts` and `npm run typecheck`

Expected: all bag, spawn, ghost, boundary, blocked-kick, I-kick, JLSTZ-kick, O-rotation, and marker-index tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/pieces.ts tests/core/pieces.test.ts
git commit -m "feat(core): add seven-bag pieces and SRS rotation"
```

### Task 3: Board Locking, Normal Clears, Explicit Row Delete, and Garbage Physics

**Files:**
- Create: `src/core/board.ts`
- Test: `tests/core/board.test.ts`

**Interfaces:**
- Consumes: board constants and `cellsFor`.
- Produces: `emptyBoard`, `canPlace`, `lockPiece`, `clearFullRows`, `deleteVisibleRow`, `dropGarbageCell`, and `occupiedCells`.

- [ ] **Step 1: Write failing board examples**

Create fixtures proving: collision rejects overlap/out-of-range cells; one through four full rows clear simultaneously and rows above preserve order; explicit visible-row deletion shifts all rows above once and does not scan another full row; a garbage cell lands above the topmost cell rather than entering a hole; landing above row zero reports top-out without mutating the input board.

```ts
it('does not scan rows after explicit deletion', () => {
  const board = boardWithFullRow(10, boardWithCell(23, 0));
  const result = deleteVisibleRow(board, 19);
  expect(result.deleted).toBe(true);
  expect(result.board.cells.slice(10 * 10, 11 * 10).every(Boolean)).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/board.test.ts`

Expected: FAIL because board operations are missing.

- [ ] **Step 3: Implement immutable board operations**

Store 240 row-major cells. `lockPiece` rejects invalid positions before copying. `clearFullRows` collects markers before removing every full stored row, prepends the same number of empty rows, and returns ascending cleared row indices. `deleteVisibleRow` accepts only public row `0..19`, maps it to stored row `row+4`, requires at least one cell, collects markers, deletes exactly that row, and prepends one empty row. `dropGarbageCell` computes `landingY = topmostOccupiedY - 1`, or `23` for an empty column; `landingY < 0` is top-out. It never invokes `clearFullRows`.

```ts
export type ClearResult = { readonly board: Board; readonly rows: readonly number[]; readonly markers: readonly ItemType[] };
export type DeleteRowResult = { readonly board: Board; readonly deleted: boolean; readonly markers: readonly ItemType[] };
export type GarbageResult = { readonly board: Board; readonly landedY: number | null; readonly topOut: boolean };
```

- [ ] **Step 4: Verify board rules**

Run: `npm test -- tests/core/board.test.ts` and `npm run typecheck`

Expected: all board tests PASS; input board snapshots remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add src/core/board.ts tests/core/board.test.ts
git commit -m "feat(core): add board clears and garbage landing"
```

### Task 4: Per-Side Fixed-Tick Movement, Gravity, Lock Delay, and Top-Out

**Files:**
- Create: `src/core/field.ts`
- Test: `tests/core/field.test.ts`

**Interfaces:**
- Consumes: piece/board APIs and movement commands.
- Produces: `createSideState`, `applySideCommands`, `advanceSideTick`, `resolveLockedPiece`, and `spawnNextPiece`.

- [ ] **Step 1: Write failing timing tests**

Test that gravity moves on tick 48 only; `{type:'soft-drop',active:true}` moves every third unfrozen side tick until an `active:false` command; hard drop locks immediately; grounded lock occurs after 30 ticks; the first 15 successful grounded moves/rotations reset delay and the sixteenth does not; blocked commands leave state unchanged; blocked spawn tops out.

```ts
it('locks after exactly thirty grounded ticks', () => {
  let side = groundedSide();
  for (let i = 0; i < 29; i += 1) side = advanceSideTick(side).state;
  expect(side.phase).toBe('active');
  side = advanceSideTick(side).state;
  expect(side.phase).toBe('lock');
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/field.test.ts`

Expected: FAIL because the side state machine is missing.

- [ ] **Step 3: Implement the fixed-tick side machine**

Apply same-side commands in array order. A soft-drop command changes held state, movement/rotation is legal only in `active`, and hard drop sets `y=ghostY` then enters `lock`. Increment gravity, soft-drop, and grounded lock counters only on an advancing, unfrozen side. A successful move/rotation while grounded resets `lockTicks` only while `lockResets < 15`; each spawn resets held soft drop and its counter. Resolve instantaneous phases in order `lock -> clear-and-attack -> offset -> garbage-drop -> top-out-check -> spawn`; expose the lock/attack/garbage checkpoints to `match.ts` so cross-side effects remain simultaneous.

```ts
export type SideTick = { readonly state: SideState; readonly events: readonly GameEvent[]; readonly locked: boolean };
export function applySideCommands(state: SideState, commands: readonly GameCommand[]): SideTick;
export function advanceSideTick(state: SideState): SideTick;
```

- [ ] **Step 4: Verify timing**

Run: `npm test -- tests/core/field.test.ts` and `npm run typecheck`

Expected: all fixed-tick, movement, reset-cap, hard-drop, spawn, and top-out tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/field.ts tests/core/field.test.ts
git commit -m "feat(core): add fixed-tick side state machine"
```

### Task 5: Combo Attacks and Deterministic Item Markers/Acquisition

**Files:**
- Create: `src/core/items.ts`
- Modify: `src/core/field.ts`
- Test: `tests/core/clears-and-items.test.ts`

**Interfaces:**
- Consumes: seed, piece serial, appeared-item flags, clear markers, inventory, previous combo.
- Produces: `makePieceToken`, `resolveNormalClear`, `acquireMarkers`, and marker/acquisition events.

- [ ] **Step 1: Write failing combo and marker tests**

Cover `4+1=5` at combo two, `4+2=6` at combo three, unbounded combo bonus, no-clear reset, one combo increment for a multi-line clear, one 15% check per eligible token, equal type/mino choice for equal seed and serial, appearance recorded immediately, no repeated type, marker movement/rotation/lock, and acquisition before row removal.

```ts
expect(resolveNormalClear(1, 4)).toEqual({ combo: 2, attack: 5 });
expect(resolveNormalClear(2, 4)).toEqual({ combo: 3, attack: 6 });
expect(resolveNormalClear(25, 1)).toEqual({ combo: 26, attack: 26 });
expect(resolveNormalClear(8, 0)).toEqual({ combo: 0, attack: 0 });
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/clears-and-items.test.ts`

Expected: FAIL because item and combo resolvers are missing.

- [ ] **Step 3: Implement marker rolls and clear rewards**

If all three types appeared, skip the item roll. Otherwise use `counterU32(seed, ITEM, serial, 0) < floor(0.15 * 2^32)`. On success, choose from the ordered unseen list `[row-clear, freeze, queue-swap]` with lane 1 and mino index `0..3` with lane 2; mark the type appeared when the token is created, not when acquired. `acquireMarkers` gives one row-clear charge, one freeze charge, or exactly three queue-swap charges. Normal clear acquisition occurs before cells are removed and every marker from all cleared rows is awarded.

```ts
export function resolveNormalClear(previousCombo: number, clearedLines: number): { readonly combo: number; readonly attack: number };
export function makePieceToken(seed: number, serial: number, appeared: AppearedItems): { readonly token: PieceToken; readonly appeared: AppearedItems };
export function acquireMarkers(inventory: Inventory, markers: readonly ItemType[]): Inventory;
```

- [ ] **Step 4: Verify combo and item generation**

Run: `npm test -- tests/core/clears-and-items.test.ts` and `npm run typecheck`

Expected: all formula, marker, appearance-limit, and acquisition tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/items.ts src/core/field.ts tests/core/clears-and-items.test.ts
git commit -m "feat(core): add combos and marked item acquisition"
```

### Task 6: Simultaneous Offset, Return Attacks, and Seeded Garbage Batches

**Files:**
- Create: `src/core/attack.ts`
- Test: `tests/core/attack.test.ts`

**Interfaces:**
- Consumes: both existing incoming counts, both same-tick outgoing counts, recipient seed stream/counter, and board garbage primitive.
- Produces: `resolveAttackExchange` and `dropGarbageBatch`.

- [ ] **Step 1: Write failing offset and garbage tests**

Test own incoming cancels first, only unmatched excess crosses, simultaneous excesses net before either queue grows, counts never go negative, seed zero sends the first four player-targeted cells to columns `[3,2,4,3]`, repeated columns stack sequentially, a garbage-completed line remains until a normal lock, unlimited batch size is accepted, and overflow reports top-out.

```ts
expect(resolveAttackExchange({ playerIncoming: 3, opponentIncoming: 1, playerOutgoing: 8, opponentOutgoing: 4 }))
  .toEqual({ playerIncoming: 0, opponentIncoming: 2, playerOffset: 3, opponentOffset: 1, sentToPlayer: 0, sentToOpponent: 2 });
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/attack.test.ts`

Expected: FAIL because attack exchange is missing.

- [ ] **Step 3: Implement snapshot-based exchange and sequential garbage**

For each side compute `localRemaining=max(0,incoming-outgoing)` and `localExcess=max(0,outgoing-incoming)`, then net the two excesses so only their positive difference crosses. Garbage uses `GARBAGE_TO_PLAYER` or `GARBAGE_TO_OPPONENT`, reads and increments only that recipient's `garbageDrawIndex`, calls `dropGarbageCell` sequentially, emits one landing event per successful cell, stops on overflow, and never scans full rows.

```ts
export function resolveAttackExchange(input: AttackExchangeInput): AttackExchangeResult;
export function dropGarbageBatch(side: SideState, seed: number): { readonly side: SideState; readonly events: readonly GameEvent[] };
```

- [ ] **Step 4: Verify combat math and garbage**

Run: `npm test -- tests/core/attack.test.ts` and `npm run typecheck`

Expected: all offset, simultaneous-net, seeded-column, line-retention, unbounded-batch, and top-out tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/attack.ts tests/core/attack.test.ts
git commit -m "feat(core): add attack offset and seeded garbage"
```

### Task 7: Row-Clear and Queue-Swap Item Commands

**Files:**
- Modify: `src/core/items.ts`
- Modify: `src/core/field.ts`
- Test: `tests/core/item-actions.test.ts`

**Interfaces:**
- Consumes: exact `use-row-clear` and `use-queue-swap` commands during `active`.
- Produces: `useRowClear`, `useQueueSwap`, fixed item attacks, lifted active-piece state, and item-use events.

- [ ] **Step 1: Write failing item-action tests**

Test invalid/out-of-visible/empty rows do not consume; valid deletion consumes one charge, shifts above rows, collects markers first, sends exactly one attack through normal offset, leaves combo unchanged, and does not scan other full rows. Test the active piece lifts the minimum rows needed or tops out when no hidden-row-valid position exists. Test queue swap preserves active token, swaps only two previews, consumes one of three charges, rejects a fourth use, and works only in `active`.

```ts
const after = useQueueSwap(sideWithSwapCharges(3));
expect(after.state.active?.token.serial).toBe(side.active?.token.serial);
expect(after.state.next.map((p) => p.serial)).toEqual([side.next[1].serial, side.next[0].serial]);
expect(after.state.inventory.queueSwap).toBe(2);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/item-actions.test.ts`

Expected: FAIL because item action functions are missing.

- [ ] **Step 3: Implement both item actions**

Map public row `0..19` to stored row `4..23`. After valid deletion, award row markers, consume one row-clear, preserve `combo`, return `outgoingAttack:1`, then test active-piece collision at integer lift distances in increasing order from zero; accept the first placement whose cells all remain at stored row `0` or greater and do not collide, otherwise top out. Queue swap exchanges the immutable tuple `[next,nextNext]` and decrements `queueSwap`; it never rerolls tokens or RNG.

```ts
export type ItemAction = { readonly state: SideState; readonly outgoingAttack: number; readonly events: readonly GameEvent[] };
export function useRowClear(state: SideState, visibleRow: number): ItemAction;
export function useQueueSwap(state: SideState): ItemAction;
```

- [ ] **Step 4: Verify usable items**

Run: `npm test -- tests/core/item-actions.test.ts` and `npm run typecheck`

Expected: all row validation, marker-chain, fixed-attack, combo-preservation, lift/top-out, and three-charge swap tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/items.ts src/core/field.ts tests/core/item-actions.test.ts
git commit -m "feat(core): add row clear and queue swap items"
```

### Task 8: Immutable Match Step, Simultaneous Freeze, and Safe Views

**Files:**
- Create: `src/core/match.ts`
- Test: `tests/core/match.test.ts`
- Test: `tests/core/public-view.test.ts`

**Interfaces:**
- Consumes: all earlier pure rules and current-tick `TimedCommand[]`.
- Produces: `createMatch(config): MatchState`, `stepMatch(state, commands): MatchStep`, `createPublicMatchView(state): PublicMatchView`, and `createAiObservation(state, side): AiObservation`.

- [ ] **Step 1: Write failing orchestration and information-boundary tests**

Cover commands for `state.tick + 1` grouped by side while preserving within-side array order; commands for any other tick are ignored without consuming items; both freeze commands validated against the pre-tick snapshot and both applied; a one-sided freeze suppresses the target's other commands on activation tick; exactly 180 target advances are skipped; no `stepMatch` call means no freeze consumption; normal/item attacks resolve simultaneously; incoming garbage applies only after that side locks and before spawn; simultaneous top-outs yield draw. Assert the render view exposes board, active, ghostY, two next tokens, combo, incoming, inventory, freeze ticks, phase, and topOut. Assert `AiObservation.self` exposes its own two previews while `AiObservation.opponent` omits `next`, hidden rows, ghost projection, seed, RNG counters, future tokens, and private command data.

```ts
expect(createPublicMatchView(state)).toEqual({
  tick: state.tick,
  status: 'playing',
  sides: { player: expect.any(Object), opponent: expect.any(Object) },
});
expect(JSON.stringify(createAiObservation(state, 'opponent'))).not.toMatch(/matchSeed|garbageDrawIndex|nextSerial/);
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/match.test.ts tests/core/public-view.test.ts`

Expected: FAIL because match orchestration and projections are missing.

- [ ] **Step 3: Implement one immutable simultaneous tick**

`createMatch` defaults `countdownTicks` to 180 and creates equal nth piece/item tokens for both sides. `stepMatch` performs exactly: let `nextTick = state.tick + 1` and filter for that tick; validate and consume both freeze uses from the starting snapshot; set target freezes; skip other commands and advancement for frozen sides; advance active sides; sum normal and row-item attacks; resolve offset from both snapshots; apply each ready side's entire remaining garbage queue; determine both top-outs together; spawn survivors; set the result tick to `nextTick`; return a new state and stable event order (`player` before `opponent` only when events are otherwise simultaneous). Freeze activation tick is skipped tick one and decrements remaining from 180 to 179 after that skip.

```ts
export function createMatch(config: MatchConfig): MatchState;
export function stepMatch(state: MatchState, commands: readonly TimedCommand[]): MatchStep;
export function createPublicMatchView(state: MatchState): PublicMatchView;
export function createAiObservation(state: MatchState, side: SideId): AiObservation;
```

`PublicMatchView` must be exactly `{ tick; status:'countdown'|'playing'|'player-won'|'opponent-won'|'draw'; sides:Record<SideId,PublicSideView> }`. `AiObservation` contains `tick`, `status`, `self: PublicSideView`, and `opponent: AiOpponentView`; `AiOpponentView` contains the opponent's visible board, current active piece, combo, incoming, inventory, freeze ticks, phase, and top-out flag but deliberately omits `next` and `ghostY`. Neither projection retains a reference to `MatchState`.

- [ ] **Step 4: Verify match behavior and purity**

Run: `npm test -- tests/core/match.test.ts tests/core/public-view.test.ts` and `npm run typecheck`

Expected: all phase-order, freeze, simultaneous attack/top-out, immutable-input, and hidden-information tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/match.ts tests/core/match.test.ts tests/core/public-view.test.ts
git commit -m "feat(core): orchestrate deterministic two-side matches"
```

### Task 9: Replay, Invariants, Property Tests, and Consumer Barrel

**Files:**
- Create: `src/core/invariants.ts`
- Create: `src/core/replay.ts`
- Create: `src/core/index.ts`
- Test: `tests/core/replay-and-properties.test.ts`
- Test: `tests/core/core-integration.test.ts`

**Interfaces:**
- Consumes: final `MatchState`, `TimedCommand`, `GameEvent`, `createMatch`, and `stepMatch`.
- Produces: replay execution/hash utilities, invariant assertions, and the stable cross-plan barrel contract.

- [ ] **Step 1: Write failing replay, invariant, and property tests**

Use fast-check to generate uint32 seeds and bounded command frames. Assert 500 runs of equal seed/commands produce identical state hashes and event arrays; every stored/active cell stays in bounds without overlap; counts/charges/timers are nonnegative; terminal status agrees with topOut flags; perturbing garbage or AI-mistake stream indices never changes the first 50 piece kinds. Run 100,000 independent eligible first-piece seeds and require marker rate in `[0.14,0.16]`; across generated matches no item type appears twice per side. Add a scripted integration replay exercising soft drop release, SRS kick, normal attack, offset, repeated-column garbage, all three items, freeze expiry, simultaneous top-out, and public-view sanitization.

```ts
fc.assert(fc.property(seedArb, framesArb, (matchSeed, frames) => {
  const endTick = frames.reduce((max, frame) => Math.max(max, frame.tick), 0) + 300;
  const a = runReplay({ version: 1, config: { matchSeed }, endTick, commands: frames });
  const b = runReplay({ version: 1, config: { matchSeed }, endTick, commands: frames });
  expect(a.hash).toBe(b.hash);
  expect(a.events).toEqual(b.events);
  assertMatchInvariants(a.state);
}), { numRuns: 500 });
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/core/replay-and-properties.test.ts tests/core/core-integration.test.ts`

Expected: FAIL because replay, invariant, and barrel modules are missing.

- [ ] **Step 3: Implement canonical replay and invariant diagnostics**

Define replay version 1 as `{version:1, config, endTick, commands}`. Require nonnegative integer `endTick`, preserve original command order inside each tick, and call `stepMatch` while `state.tick < endTick`, passing commands whose tick equals `state.tick + 1`, even when that set is empty. Concatenate events in emitted order, and hash an explicitly ordered JSON projection with 32-bit FNV-1a. The projection includes all authoritative state, including hidden counters, but excludes object identity and derived public views. `assertMatchInvariants` throws `CoreInvariantError` containing tick, seed, and a compact reason for dimensions, overlap, bounds, counters, inventory, queue length, phase, and terminal-result violations.

```ts
export type ReplayV1 = { readonly version: 1; readonly config: MatchConfig; readonly endTick: number; readonly commands: readonly TimedCommand[] };
export function runReplay(replay: ReplayV1): { readonly state: MatchState; readonly events: readonly GameEvent[]; readonly hash: string };
export function hashMatchState(state: MatchState): string;
export function assertMatchInvariants(state: MatchState): void;
```

Create `src/core/index.ts` with explicit named exports only; do not use `export *`.

- [ ] **Step 4: Run the complete core gate**

Run:

```powershell
npm test
npm run typecheck
```

Expected: every core example, integration, replay, 500-run property, and 100,000-sample rate test PASS; TypeScript reports zero errors.

- [ ] **Step 5: Commit**

```powershell
git add src/core/invariants.ts src/core/replay.ts src/core/index.ts tests/core/replay-and-properties.test.ts tests/core/core-integration.test.ts
git commit -m "test(core): lock replay determinism and invariants"
```

## Final Integration Contract

`src/core/index.ts` is the only import path for AI, UI, renderer, and app orchestration. It must export at minimum these exact names and signatures:

```ts
export type { GameCommand, TimedCommand, MatchConfig, MatchState, PublicMatchView, PublicSideView, AiOpponentView, GameEvent, MatchStep, AiObservation, SideId, ItemType } from './model';
export { createMatch, stepMatch, createPublicMatchView, createAiObservation } from './match';

// Locked signatures:
// type TimedCommand = { tick: number; side: SideId; command: GameCommand };
// type MatchStep = { state: MatchState; events: readonly GameEvent[] };
// type PublicMatchView = {
//   tick: number;
//   status: 'countdown' | 'playing' | 'player-won' | 'opponent-won' | 'draw';
//   sides: Readonly<Record<SideId, PublicSideView>>;
// };
// createMatch(config: MatchConfig): MatchState;
// stepMatch(state: MatchState, commands: readonly TimedCommand[]): MatchStep;
// createPublicMatchView(state: MatchState): PublicMatchView;
// createAiObservation(state: MatchState, side: SideId): AiObservation;
```

`PublicMatchView.sides[side]` exposes a 200-cell visible-only `board`, `active`, `ghostY`, exactly two `next` tokens, `combo`, `incoming`, `inventory`, `freezeTicks`, lower-case `phase`, and `topOut`. Consumers must never read `MatchState` for display or AI decisions; `createAiObservation` is the sole AI input and contains no hidden board rows, match seed, unseen self queue entries beyond two previews, opponent previews, item rolls, garbage columns, RNG counters, or opponent-private command history.
