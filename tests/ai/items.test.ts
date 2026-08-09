import { describe, expect, it } from 'vitest';
import {
  planItemCommands,
  projectRowClearObservation,
  shouldUseQueueSwap,
  shouldUseTacticalRowClear,
} from '../../src/ai/items';
import { AI_FLOOR_PROFILES } from '../../src/ai/profiles';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  acquireMarkers,
  createAiObservation,
  createMatch,
  ghostY,
  type ActivePiece,
  stepMatch,
  type AiObservation,
  type Board,
  type Cell,
  type MatchState,
  type PublicPieceToken,
  type SideId,
  type SideState,
  type TimedCommand,
} from '../../src/core/index';

const FLOOR_1 = AI_FLOOR_PROFILES[0]!;
const FLOOR_2 = AI_FLOOR_PROFILES[1]!;
const FLOOR_3 = AI_FLOOR_PROFILES[2]!;
const FLOOR_4 = AI_FLOOR_PROFILES[3]!;
const FLOOR_5 = AI_FLOOR_PROFILES[4]!;
const VISIBLE_ROWS = 20;

function emptyBoard(): (Cell | null)[] {
  return Array<Cell | null>(BOARD_WIDTH * VISIBLE_ROWS).fill(null);
}

function token(kind: PublicPieceToken['kind']): PublicPieceToken {
  return { kind, marker: null };
}

function withCell(
  board: readonly (Cell | null)[],
  x: number,
  row: number,
  kind: Cell['kind'] = 'J',
): readonly (Cell | null)[] {
  const result = [...board];
  result[row * BOARD_WIDTH + x] = { kind };
  return result;
}

function withFullRow(
  board: readonly (Cell | null)[],
  row: number,
  kind: Cell['kind'] = 'J',
): readonly (Cell | null)[] {
  let result = board;
  for (let x = 0; x < BOARD_WIDTH; x += 1) result = withCell(result, x, row, kind);
  return result;
}

function observation(options: {
  readonly board?: readonly (Cell | null)[];
  readonly opponentBoard?: readonly (Cell | null)[];
  readonly inventory?: Partial<AiObservation['self']['inventory']>;
  readonly next?: readonly [PublicPieceToken, PublicPieceToken];
  readonly combo?: number;
  readonly opponentCombo?: number;
  readonly incoming?: number;
  readonly status?: AiObservation['status'];
  readonly phase?: AiObservation['self']['phase'];
  readonly freezeTicks?: number;
} = {}): AiObservation {
  const base = createAiObservation(
    createMatch({ matchSeed: 17, countdownTicks: 0 }),
    'opponent',
  );
  const board = options.board ?? emptyBoard();
  const internalBoard: Board = {
    cells: [...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null), ...board],
  };
  const internalActive: ActivePiece = {
    token: { serial: 0, ...base.self.active!.token },
    x: base.self.active!.x,
    y: base.self.active!.y + HIDDEN_ROWS,
    rotation: base.self.active!.rotation,
  };
  return {
    ...base,
    status: options.status ?? base.status,
    self: {
      ...base.self,
      board,
      ghostY: ghostY(internalBoard, internalActive) - HIDDEN_ROWS,
      next: options.next ?? [token('T'), token('L')],
      combo: options.combo ?? 0,
      incoming: options.incoming ?? 0,
      inventory: { ...base.self.inventory, ...options.inventory },
      freezeTicks: options.freezeTicks ?? 0,
      phase: options.phase ?? 'active',
    },
    opponent: {
      ...base.opponent,
      board: options.opponentBoard ?? emptyBoard(),
      combo: options.opponentCombo ?? 0,
    },
  };
}

function patchSide(
  state: MatchState,
  side: SideId,
  patch: Partial<SideState>,
): MatchState {
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: { ...state.sides[side], ...patch },
    },
  };
}

describe('AI item eligibility and priority', () => {
  it('never emits without acquired inventory', () => {
    expect(planItemCommands(observation(), FLOOR_3)).toEqual([]);
  });

  it.each([
    { label: 'outside play', patch: { status: 'countdown' as const } },
    { label: 'non-active', patch: { phase: 'offset' as const } },
    { label: 'frozen', patch: { freezeTicks: 1 } },
  ])('never emits while $label', ({ patch }) => {
    const board = withCell(emptyBoard(), 0, 19);
    expect(planItemCommands(observation({
      board,
      inventory: { rowClear: 1, freeze: 1, queueSwap: 1 },
      ...patch,
    }), FLOOR_1)).toEqual([]);
  });

  it('uses deterministic row-clear, freeze, then queue-swap priority', () => {
    const board = withCell(emptyBoard(), 0, 19);
    const allItems = observation({
      board,
      inventory: { rowClear: 1, freeze: 1, queueSwap: 1 },
    });
    const noRow = observation({ inventory: { freeze: 1, queueSwap: 1 } });

    expect(planItemCommands(allItems, FLOOR_1)).toEqual([
      { type: 'use-row-clear', row: 19 },
    ]);
    expect(planItemCommands(noRow, FLOOR_1)).toEqual([{ type: 'use-freeze' }]);
  });

  it('does not emit row-clear for an empty field or swap without a charge', () => {
    expect(planItemCommands(observation({ inventory: { rowClear: 1 } }), FLOOR_1)).toEqual([]);
    expect(planItemCommands(observation({ inventory: { queueSwap: 0 } }), FLOOR_3)).toEqual([]);
  });
});

describe('floor-specific AI item policies', () => {
  it('floor 1 clears the lowest non-empty visible row and uses either other item immediately', () => {
    let board = withCell(emptyBoard(), 0, 4);
    board = withCell(board, 9, 17);

    expect(planItemCommands(observation({ board, inventory: { rowClear: 1 } }), FLOOR_1))
      .toEqual([{ type: 'use-row-clear', row: 17 }]);
    expect(planItemCommands(observation({ inventory: { freeze: 1 } }), FLOOR_1))
      .toEqual([{ type: 'use-freeze' }]);
    expect(planItemCommands(observation({ inventory: { queueSwap: 1 } }), FLOOR_1))
      .toEqual([{ type: 'use-queue-swap' }]);
  });

  it('floor 2 selects the row maximizing holes removed times two plus occupied cells', () => {
    let board = withCell(emptyBoard(), 0, 10);
    for (let x = 1; x <= 5; x += 1) board = withCell(board, x, 19);

    expect(planItemCommands(observation({
      board,
      incoming: 6,
      inventory: { rowClear: 1 },
    }), FLOOR_2)).toEqual([{ type: 'use-row-clear', row: 10 }]);
  });

  it('floor 2 resolves equal row ranks toward the lower visible row', () => {
    let board = withFullRow(emptyBoard(), 18);
    board = withFullRow(board, 19);

    expect(planItemCommands(observation({
      board,
      incoming: 6,
      inventory: { rowClear: 1 },
    }), FLOOR_2)).toEqual([{ type: 'use-row-clear', row: 19 }]);
  });

  it('floor 2 gates row-clear at the exact height, hole, and incoming thresholds', () => {
    let height13: readonly (Cell | null)[] = emptyBoard();
    let height14: readonly (Cell | null)[] = emptyBoard();
    for (let row = 7; row < VISIBLE_ROWS; row += 1) height13 = withCell(height13, 0, row);
    for (let row = 6; row < VISIBLE_ROWS; row += 1) height14 = withCell(height14, 0, row);
    let holes5 = withCell(emptyBoard(), 0, 13);
    let holes6 = withCell(emptyBoard(), 0, 12);
    holes5 = withCell(holes5, 0, 19);
    holes6 = withCell(holes6, 0, 19);

    expect(planItemCommands(observation({ board: height13, inventory: { rowClear: 1 } }), FLOOR_2))
      .toEqual([]);
    expect(planItemCommands(observation({ board: height14, inventory: { rowClear: 1 } }), FLOOR_2)[0]?.type)
      .toBe('use-row-clear');
    expect(planItemCommands(observation({ board: holes5, inventory: { rowClear: 1 } }), FLOOR_2))
      .toEqual([]);
    expect(planItemCommands(observation({ board: holes6, inventory: { rowClear: 1 } }), FLOOR_2)[0]?.type)
      .toBe('use-row-clear');
    expect(planItemCommands(observation({
      board: withCell(emptyBoard(), 0, 19),
      incoming: 6,
      inventory: { rowClear: 1 },
    }), FLOOR_2)[0]?.type).toBe('use-row-clear');
  });

  it('floor 2 freezes only at opponent height 14 or combo 2', () => {
    const height13 = withCell(emptyBoard(), 0, 7);
    const height14 = withCell(emptyBoard(), 0, 6);

    expect(planItemCommands(observation({
      opponentBoard: height13,
      opponentCombo: 1,
      inventory: { freeze: 1 },
    }), FLOOR_2)).toEqual([]);
    expect(planItemCommands(observation({
      opponentBoard: height14,
      inventory: { freeze: 1 },
    }), FLOOR_2)).toEqual([{ type: 'use-freeze' }]);
    expect(planItemCommands(observation({
      opponentCombo: 2,
      inventory: { freeze: 1 },
    }), FLOOR_2)).toEqual([{ type: 'use-freeze' }]);
  });

  it('floor 4 and 5 apply the tactical freeze policy at own combo 2 or opponent height 13', () => {
    const height12 = withCell(emptyBoard(), 0, 8);
    const height13 = withCell(emptyBoard(), 0, 7);

    for (const profile of [FLOOR_4, FLOOR_5]) {
      expect(planItemCommands(observation({
        combo: 1,
        opponentBoard: height12,
        inventory: { freeze: 1 },
      }), profile)).toEqual([]);
      expect(planItemCommands(observation({ combo: 2, inventory: { freeze: 1 } }), profile))
        .toEqual([{ type: 'use-freeze' }]);
      expect(planItemCommands(observation({
        opponentBoard: height13,
        inventory: { freeze: 1 },
      }), profile)).toEqual([{ type: 'use-freeze' }]);
    }
  });

  it('applies the exact tactical row-clear score boundary and visible survival rule', () => {
    expect(shouldUseTacticalRowClear(10, 13.999, 0)).toBe(false);
    expect(shouldUseTacticalRowClear(10, 14, 0)).toBe(true);
    expect(shouldUseTacticalRowClear(Number.NEGATIVE_INFINITY, -100, 0)).toBe(true);
    expect(shouldUseTacticalRowClear(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, 0))
      .toBe(false);
    expect(shouldUseTacticalRowClear(10, 9, 1)).toBe(true);
  });

  it('floor 5 simulates valid visible deletes and resolves equal scores to the lower row', () => {
    let board = withFullRow(emptyBoard(), 18);
    board = withFullRow(board, 19);

    expect(planItemCommands(observation({
      board,
      incoming: 1,
      inventory: { rowClear: 1 },
    }), FLOOR_5)).toEqual([{ type: 'use-row-clear', row: 19 }]);
  });

  it('projects the same minimum active lift and one-line incoming offset as the real core', () => {
    let state = createMatch({ matchSeed: 53, countdownTicks: 0 });
    const cells = [...state.sides.opponent.board.cells];
    cells[5 * BOARD_WIDTH + 4] = { kind: 'J' };
    cells[10 * BOARD_WIDTH] = { kind: 'L' };
    state = patchSide(state, 'opponent', {
      board: { cells },
      active: {
        token: { serial: 90, kind: 'O', marker: null },
        x: 3,
        y: 6,
        rotation: 0,
      },
      incoming: 2,
      inventory: acquireMarkers(state.sides.opponent.inventory, ['row-clear']),
    });
    const before = createAiObservation(state, 'opponent');
    const projected = projectRowClearObservation(before, 6);
    const stepped = stepMatch(state, [{
      tick: 1,
      side: 'opponent',
      command: { type: 'use-row-clear', row: 6 },
    }]);
    const actual = createAiObservation(stepped.state, 'opponent');

    expect(actual.self).toMatchObject({
      active: expect.objectContaining({ y: 0 }),
      incoming: 1,
      phase: 'active',
      topOut: false,
    });
    expect(projected.self).toMatchObject({
      active: expect.objectContaining({ y: 0 }),
      incoming: 1,
      phase: 'active',
      topOut: false,
    });
    expect(projected.self.board).toEqual(actual.self.board);
    expect(projected.self.ghostY).toBe(actual.self.ghostY);
  });

  it('keeps a lift-surviving tactical row scoreable and selects its lower-row tie', () => {
    let state = createMatch({ matchSeed: 53, countdownTicks: 0 });
    const cells = [...state.sides.opponent.board.cells];
    cells[5 * BOARD_WIDTH + 4] = { kind: 'J' };
    cells[10 * BOARD_WIDTH] = { kind: 'L' };
    state = patchSide(state, 'opponent', {
      board: { cells },
      active: {
        token: { serial: 90, kind: 'O', marker: null },
        x: 3,
        y: 6,
        rotation: 0,
      },
      incoming: 1,
      inventory: acquireMarkers(state.sides.opponent.inventory, ['row-clear']),
    });
    const zeroWeights = {
      ...FLOOR_5,
      weights: Object.fromEntries(
        Object.keys(FLOOR_5.weights).map((name) => [name, 0]),
      ) as typeof FLOOR_5.weights,
    };

    expect(planItemCommands(createAiObservation(state, 'opponent'), zeroWeights)).toEqual([
      { type: 'use-row-clear', row: 6 },
    ]);
  }, 10_000);

  it('applies exact floor 2 and floor 5 queue-swap score-gap boundaries', () => {
    expect(shouldUseQueueSwap(FLOOR_2, 10, 12.999)).toBe(false);
    expect(shouldUseQueueSwap(FLOOR_2, 10, 13)).toBe(true);
    expect(shouldUseQueueSwap(FLOOR_5, 10, 12.499)).toBe(false);
    expect(shouldUseQueueSwap(FLOOR_5, 10, 12.5)).toBe(true);
  });

  it('uses only visible projected survival for floor 5 and does not add it to floor 2', () => {
    expect(shouldUseQueueSwap(FLOOR_2, Number.NEGATIVE_INFINITY, -100)).toBe(false);
    expect(shouldUseQueueSwap(FLOOR_5, Number.NEGATIVE_INFINITY, -100)).toBe(true);
    expect(shouldUseQueueSwap(FLOOR_5, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY))
      .toBe(false);
  });

  it('integrates the real one-preview evaluator for a beneficial and harmful floor-3 swap', () => {
    const previewWeighted = {
      ...FLOOR_3,
      weights: Object.fromEntries(
        Object.entries(FLOOR_3.weights).map(([name, weight]) => [name, weight * 6]),
      ) as typeof FLOOR_3.weights,
    };
    const beneficial = observation({
      inventory: { queueSwap: 1 },
      next: [token('O'), token('I')],
    });
    const harmful = observation({
      inventory: { queueSwap: 1 },
      next: [token('I'), token('O')],
    });
    expect(planItemCommands(beneficial, previewWeighted)).toEqual([
      { type: 'use-queue-swap' },
    ]);
    expect(planItemCommands(harmful, previewWeighted)).toEqual([]);
  });

  it('queue-swap scoring swaps only the two exposed previews and obeys profile lookahead', () => {
    const withThird = (kind: PublicPieceToken['kind']): AiObservation => {
      const view = observation({
        board: withCell(emptyBoard(), 3, 2),
        inventory: { queueSwap: 1 },
        next: [token('O'), token('I')],
      });
      return {
        ...view,
        self: {
          ...view.self,
          next: [token('O'), token('I'), token(kind)] as unknown as AiObservation['self']['next'],
        },
      };
    };

    expect(planItemCommands(withThird('Z'), FLOOR_5))
      .toEqual(planItemCommands(withThird('S'), FLOOR_5));
  });

  it('ignores non-contract hidden fields and plans from the sanitized observation only', () => {
    const nearTop = withCell(emptyBoard(), 3, 2);
    const view = observation({
      board: nearTop,
      combo: 2,
      inventory: { freeze: 1 },
    });
    const hiddenVariant = {
      ...view,
      hiddenBoard: Array(BOARD_WIDTH * HIDDEN_ROWS).fill({ kind: 'Z' }),
    } as AiObservation;

    expect(planItemCommands(view, FLOOR_5)).toEqual(planItemCommands(hiddenVariant, FLOOR_5));
  });
});

describe('AI item commands through the real core', () => {
  it('deletes exactly the floor-1-selected visible row and spends acquired inventory', () => {
    let state = createMatch({ matchSeed: 31, countdownTicks: 0 });
    const cells = [...state.sides.opponent.board.cells];
    cells[(HIDDEN_ROWS + 18) * BOARD_WIDTH] = { kind: 'I' };
    cells[(HIDDEN_ROWS + 19) * BOARD_WIDTH + 9] = { kind: 'L' };
    state = patchSide(state, 'opponent', {
      board: { cells },
      inventory: acquireMarkers(state.sides.opponent.inventory, ['row-clear']),
    });
    const command = planItemCommands(createAiObservation(state, 'opponent'), FLOOR_1)[0]!;
    const step = stepMatch(state, [{ tick: 1, side: 'opponent', command }]);

    expect(command).toEqual({ type: 'use-row-clear', row: 19 });
    expect(step.state.sides.opponent.inventory.rowClear).toBe(0);
    expect(step.state.sides.opponent.board.cells[(HIDDEN_ROWS + 19) * BOARD_WIDTH])
      .toEqual({ kind: 'I' });
    expect(step.state.sides.opponent.board.cells[(HIDDEN_ROWS + 19) * BOARD_WIDTH + 9])
      .toBeNull();
    expect(step.events).toContainEqual({
      type: 'item-used', side: 'opponent', item: 'row-clear', row: 19,
    });
  });

  it('spends exactly three acquired queue-swap charges and cannot issue a fourth swap', () => {
    let state = createMatch({ matchSeed: 37, countdownTicks: 0 });
    state = patchSide(state, 'opponent', {
      inventory: acquireMarkers(state.sides.opponent.inventory, ['queue-swap']),
    });
    const swaps: TimedCommand[] = [];

    for (let tick = 1; tick <= 4; tick += 1) {
      const command = planItemCommands(createAiObservation(state, 'opponent'), FLOOR_1)[0];
      const timed = command === undefined ? [] : [{ tick, side: 'opponent' as const, command }];
      if (command?.type === 'use-queue-swap') swaps.push(...timed);
      state = stepMatch(state, timed).state;
    }

    expect(swaps).toHaveLength(3);
    expect(state.sides.opponent.inventory.queueSwap).toBe(0);
  });

  it('lets both sides freeze one another on the same core tick', () => {
    let state = createMatch({ matchSeed: 41, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      inventory: acquireMarkers(state.sides.player.inventory, ['freeze']),
    });
    state = patchSide(state, 'opponent', {
      inventory: acquireMarkers(state.sides.opponent.inventory, ['freeze']),
    });
    const commands: TimedCommand[] = (['player', 'opponent'] as const).map((side) => ({
      tick: 1,
      side,
      command: planItemCommands(createAiObservation(state, side), FLOOR_1)[0]!,
    }));
    const step = stepMatch(state, commands);

    expect(commands.map(({ command }) => command)).toEqual([
      { type: 'use-freeze' },
      { type: 'use-freeze' },
    ]);
    expect(step.state.sides.player.freezeTicks).toBe(179);
    expect(step.state.sides.opponent.freezeTicks).toBe(179);
    expect(step.state.sides.player.inventory.freeze).toBe(0);
    expect(step.state.sides.opponent.inventory.freeze).toBe(0);
  });
});
