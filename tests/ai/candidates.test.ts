import { describe, expect, it } from 'vitest';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  canPlace,
  cellsFor,
  createAiObservation,
  createMatch,
  emptyBoard,
  ghostY,
  spawnPiece,
  stepMatch,
  tryRotateClockwise,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type GameCommand,
  type MatchState,
  type PieceKind,
  type PieceToken,
} from '../../src/core/index';
import { enumerateCandidates } from '../../src/ai/candidates';
import { scoreCandidates } from '../../src/ai/evaluate';
import { AI_FLOOR_PROFILES } from '../../src/ai/profiles';

const VISIBLE_ROWS = 20;

function emptyVisibleBoard(): (Cell | null)[] {
  return Array<Cell | null>(BOARD_WIDTH * VISIBLE_ROWS).fill(null);
}

function observation(
  kind: PieceKind,
  board: readonly (Cell | null)[] = emptyVisibleBoard(),
): AiObservation {
  const internal: Board = {
    cells: [
      ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
      ...board,
    ],
  };
  const active: ActivePiece = {
    token: piece(kind, 0),
    x: 3,
    y: 2,
    rotation: 0,
  };
  const side = {
    board,
    active: { token: { kind, marker: null }, x: 3, y: -2, rotation: 0 as const },
    ghostY: ghostY(internal, active) - HIDDEN_ROWS,
    next: [
      { kind: 'T' as const, marker: null },
      { kind: 'L' as const, marker: null },
    ] as const,
    combo: 0,
    incoming: 0,
    inventory: { rowClear: 0, freeze: 0, queueSwap: 0 },
    freezeTicks: 0,
    phase: 'active' as const,
    topOut: false,
  };
  return {
    tick: 0,
    status: 'playing',
    self: side,
    opponent: {
      board: emptyVisibleBoard(),
      active: null,
      combo: 0,
      incoming: 0,
      inventory: { rowClear: 0, freeze: 0, queueSwap: 0 },
      freezeTicks: 0,
      phase: 'active',
      topOut: false,
    },
  };
}

function jaggedBoard(): readonly (Cell | null)[] {
  const board = emptyVisibleBoard();
  const heights = [1, 4, 2, 6, 3, 5, 1, 3, 2, 4];
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    for (let offset = 0; offset < heights[x]!; offset += 1) {
      board[(VISIBLE_ROWS - 1 - offset) * BOARD_WIDTH + x] = { kind: 'J' };
    }
  }
  return board;
}

function replayRoute(
  view: AiObservation,
  commands: readonly GameCommand[],
): readonly { readonly x: number; readonly y: number }[] | null {
  if (view.self.active === null) return null;
  const board: Board = {
    cells: [
      ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
      ...view.self.board,
    ],
  };
  let active: ActivePiece = {
    token: { serial: 0, ...view.self.active.token },
    x: view.self.active.x,
    y: view.self.active.y + HIDDEN_ROWS,
    rotation: view.self.active.rotation,
  };

  for (const command of commands) {
    if (command.type === 'rotate-clockwise') {
      const rotated = tryRotateClockwise(board, active);
      if (rotated === active) return null;
      active = rotated;
    } else if (command.type === 'move') {
      const moved = { ...active, x: active.x + command.dx };
      if (!canPlace(board, moved)) return null;
      active = moved;
    } else if (command.type === 'hard-drop') {
      active = { ...active, y: ghostY(board, active) };
    } else {
      return null;
    }
  }

  if (commands.at(-1)?.type !== 'hard-drop') return null;
  return cellsFor(active)
    .map(({ x, y }) => ({ x, y: y - HIDDEN_ROWS }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

function piece(kind: PieceKind, serial: number): PieceToken {
  return { serial, kind, marker: null };
}

function realBoard(points: readonly { readonly x: number; readonly y: number }[]): Board {
  const cells = [...emptyBoard().cells];
  for (const { x, y } of points) cells[y * BOARD_WIDTH + x] = { kind: 'J' };
  return { cells };
}

function withOpponent(
  state: MatchState,
  board: Board,
  activeToken: PieceToken,
  next: readonly [PieceToken, PieceToken],
): MatchState {
  return {
    ...state,
    sides: {
      ...state.sides,
      opponent: {
        ...state.sides.opponent,
        board,
        active: spawnPiece(activeToken),
        next,
        nextSerial: Math.max(next[0].serial, next[1].serial) + 1,
        phase: 'active',
        topOut: false,
      },
    },
  };
}

function executeOpponentRoute(
  state: MatchState,
  commands: readonly GameCommand[],
): MatchState {
  return stepMatch(state, commands.map((command) => ({
    tick: state.tick + 1,
    side: 'opponent',
    command,
  }))).state;
}

describe('placement candidate enumeration', () => {
  it('enumerates exactly nine O placements and seventeen I placements on an empty board', () => {
    expect(enumerateCandidates(observation('O'))).toHaveLength(9);
    expect(enumerateCandidates(observation('I'))).toHaveLength(17);
  });

  it('keeps only routes whose ordinary core command replay reaches the advertised landing', () => {
    const view = observation('T', jaggedBoard());
    const candidates = enumerateCandidates(view);

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(replayRoute(view, candidate.commands)).toEqual(candidate.landingCells);
    }
  });

  it('deduplicates equivalent landings and ends every route with one hard drop', () => {
    const candidates = enumerateCandidates(observation('I', jaggedBoard()));
    const landingKeys = candidates.map((candidate) =>
      candidate.landingCells.map(({ x, y }) => `${x}:${y}`).join('|'));

    expect(new Set(landingKeys).size).toBe(landingKeys.length);
    for (const candidate of candidates) {
      expect(candidate.commands.at(-1)).toEqual({ type: 'hard-drop' });
      expect(candidate.commands.slice(0, -1).every((command) =>
        command.type === 'move' || command.type === 'rotate-clockwise')).toBe(true);
    }
  });

  it('keeps top-out unknown when a hidden vertical I clears into a safe actual spawn', () => {
    const filledRows = [0, 1].flatMap((visibleY) =>
      Array.from({ length: BOARD_WIDTH }, (_, x) => ({ x, y: visibleY + HIDDEN_ROWS }))
        .filter(({ x }) => x !== 5));
    const state = withOpponent(
      createMatch({ matchSeed: 31, countdownTicks: 0 }),
      realBoard([...filledRows, { x: 5, y: HIDDEN_ROWS + 2 }]),
      piece('I', 100),
      [piece('O', 101), piece('T', 102)],
    );
    const view = createAiObservation(state, 'opponent');
    const candidate = enumerateCandidates(view).find(({ rotation, column }) =>
      rotation === 1 && column === 3);

    expect(candidate).toBeDefined();
    expect(candidate!.landingCells).toEqual([
      { x: 5, y: -2 },
      { x: 5, y: -1 },
      { x: 5, y: 0 },
      { x: 5, y: 1 },
    ]);
    expect(candidate!.clearedLines).toBe(2);

    const actual = executeOpponentRoute(state, candidate!.commands);
    const actualView = createAiObservation(actual, 'opponent');
    expect(actual.sides.opponent.topOut).toBe(false);
    expect(actual.sides.opponent.active?.token.kind).toBe('O');
    expect(candidate!.topOut).toBe('unknown');
    expect(candidate!.resultingBoard).toEqual(actualView.self.board);
  });

  it('keeps the observed ghost but reports unknown top-out for a hidden-cell hard drop', () => {
    const state = withOpponent(
      createMatch({ matchSeed: 32, countdownTicks: 0 }),
      realBoard([{ x: 5, y: HIDDEN_ROWS - 1 }]),
      piece('S', 200),
      [piece('O', 201), piece('T', 202)],
    );
    const view = createAiObservation(state, 'opponent');
    expect(view.self.board.every((cell) => cell === null)).toBe(true);
    expect(view.self.ghostY).toBe(-2);

    const candidate = enumerateCandidates(view).find(({ rotation, column, commands }) =>
      rotation === 0
      && column === 3
      && commands.length === 1
      && commands[0]?.type === 'hard-drop');

    expect(candidate).toBeDefined();
    expect(candidate!.landingCells).toEqual([
      { x: 4, y: -2 },
      { x: 5, y: -2 },
      { x: 3, y: -1 },
      { x: 4, y: -1 },
    ]);

    const actual = executeOpponentRoute(state, candidate!.commands);
    const actualView = createAiObservation(actual, 'opponent');
    expect(actual.sides.opponent.topOut).toBe(true);
    expect(candidate!.topOut).toBe('unknown');
    expect(candidate!.resultingBoard).toEqual(actualView.self.board);
  });

  it('keeps hidden-row-dependent top-out explicitly unknown for identical observations', () => {
    const next = [piece('O', 301), piece('T', 302)] as const;
    const safeState = withOpponent(
      createMatch({ matchSeed: 33, countdownTicks: 0 }),
      emptyBoard(),
      piece('I', 300),
      next,
    );
    const unsafeState = withOpponent(
      createMatch({ matchSeed: 33, countdownTicks: 0 }),
      realBoard([{ x: 4, y: HIDDEN_ROWS - 2 }]),
      piece('I', 300),
      next,
    );
    const safeView = createAiObservation(safeState, 'opponent');
    const unsafeView = createAiObservation(unsafeState, 'opponent');

    expect(unsafeView).toEqual(safeView);
    expect(safeView.self.ghostY).toBe(18);
    expect(enumerateCandidates(unsafeView)).toEqual(enumerateCandidates(safeView));
    expect(scoreCandidates(unsafeView, AI_FLOOR_PROFILES[0]!)).toEqual(
      scoreCandidates(safeView, AI_FLOOR_PROFILES[0]!),
    );

    const candidate = enumerateCandidates(safeView).find(({ rotation, column, commands }) =>
      rotation === 0
      && column === 3
      && commands.length === 1
      && commands[0]?.type === 'hard-drop');
    expect(candidate).toBeDefined();
    expect(candidate!.topOut).toBe('unknown');

    const safeResult = executeOpponentRoute(safeState, candidate!.commands);
    const unsafeResult = executeOpponentRoute(unsafeState, candidate!.commands);
    expect(safeResult.sides.opponent.topOut).toBe(false);
    expect(unsafeResult.sides.opponent.topOut).toBe(true);
  });
});
