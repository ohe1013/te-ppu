import { describe, expect, it } from 'vitest';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  canPlace,
  cellsFor,
  ghostY,
  tryRotateClockwise,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type GameCommand,
  type PieceKind,
} from '../../src/core/index';
import { enumerateCandidates } from '../../src/ai/candidates';

const VISIBLE_ROWS = 20;

function emptyVisibleBoard(): (Cell | null)[] {
  return Array<Cell | null>(BOARD_WIDTH * VISIBLE_ROWS).fill(null);
}

function observation(
  kind: PieceKind,
  board: readonly (Cell | null)[] = emptyVisibleBoard(),
): AiObservation {
  const side = {
    board,
    active: { token: { kind, marker: null }, x: 3, y: -2, rotation: 0 as const },
    ghostY: 18,
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
});
