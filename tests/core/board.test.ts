import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type Cell,
  type PieceToken,
  type Rotation,
} from '../../src/core/model';
import {
  canPlace,
  clearFullRows,
  deleteVisibleRow,
  emptyBoard,
  lockPiece,
  occupiedCells,
  raiseGarbageRow,
} from '../../src/core/board';
import type { RaiseGarbageRowResult } from '../../src/core/board';

const BLOCK: Cell = { kind: 'O' };

function boardWithCell(board: Board, y: number, x: number, cell: Cell = BLOCK): Board {
  const cells = [...board.cells];
  cells[y * BOARD_WIDTH + x] = cell;
  return { cells };
}

function boardWithFullRow(y: number, board: Board = emptyBoard()): Board {
  const cells = [...board.cells];
  for (let x = 0; x < BOARD_WIDTH; x += 1) cells[y * BOARD_WIDTH + x] = BLOCK;
  return { cells };
}

function active(kind: PieceToken['kind'], x: number, y: number, rotation: Rotation = 0): ActivePiece {
  return { token: { serial: 0, kind, marker: null }, x, y, rotation };
}

describe('piece placement and locking', () => {
  it('rejects overlap and out-of-range piece cells', () => {
    const occupied = boardWithCell(emptyBoard(), 3, 4);

    expect(canPlace(occupied, active('T', 3, 2))).toBe(false);
    expect(canPlace(emptyBoard(), active('T', -4, 2))).toBe(false);
    expect(canPlace(emptyBoard(), active('T', 3, 23))).toBe(false);
  });

  it('locks every piece cell immutably and preserves its marker', () => {
    const board = emptyBoard();
    const piece: ActivePiece = {
      token: { serial: 7, kind: 'O', marker: { item: 'freeze', minoIndex: 3 } },
      x: 3,
      y: 5,
      rotation: 0,
    };

    const locked = lockPiece(board, piece);

    expect(board.cells.every((cell) => cell === null)).toBe(true);
    expect(occupiedCells(locked)).toEqual([
      { x: 4, y: 5, kind: 'O' },
      { x: 5, y: 5, kind: 'O' },
      { x: 4, y: 6, kind: 'O' },
      { x: 5, y: 6, kind: 'O', marker: 'freeze' },
    ]);
  });

  it('rejects an invalid lock without mutating its input board', () => {
    const board = boardWithCell(emptyBoard(), 3, 4);
    const snapshot = [...board.cells];

    expect(() => lockPiece(board, active('T', 3, 2))).toThrow(RangeError);
    expect(board.cells).toEqual(snapshot);
  });
});

describe('normal full-row clearing', () => {
  it.each([1, 2, 3, 4])('clears %i simultaneous full rows and preserves rows above in order', (count) => {
    let board = emptyBoard();
    for (let y = 20; y < 20 + count; y += 1) board = boardWithFullRow(y, board);
    board = boardWithCell(board, 19, 0, { kind: 'I', marker: 'queue-swap' });
    const snapshot = [...board.cells];

    const result = clearFullRows(board);

    expect(result.rows).toEqual(Array.from({ length: count }, (_, i) => 20 + i));
    expect(result.markers).toEqual([]);
    expect(result.board.cells.slice(0, count * BOARD_WIDTH).every((cell) => cell === null)).toBe(true);
    expect(result.board.cells[(19 + count) * BOARD_WIDTH]).toEqual({ kind: 'I', marker: 'queue-swap' });
    expect(board.cells).toEqual(snapshot);
  });

  it('collects markers from every full row before removal', () => {
    let board = boardWithFullRow(21);
    board = boardWithFullRow(22, board);
    board = boardWithCell(board, 21, 2, { kind: 'I', marker: 'freeze' });
    board = boardWithCell(board, 22, 7, { kind: 'T', marker: 'row-clear' });

    expect(clearFullRows(board).markers).toEqual(['freeze', 'row-clear']);
  });
});

describe('explicit visible-row deletion', () => {
  it('deletes exactly one non-empty visible row, collects its marker, and shifts above rows once', () => {
    let board = boardWithCell(emptyBoard(), 10, 1, { kind: 'T', marker: 'row-clear' });
    board = boardWithCell(board, 11, 0, { kind: 'I', marker: 'freeze' });
    const snapshot = [...board.cells];

    const result = deleteVisibleRow(board, 7);

    expect(result.deleted).toBe(true);
    expect(result.markers).toEqual(['freeze']);
    expect(result.board.cells.slice(0, BOARD_WIDTH).every((cell) => cell === null)).toBe(true);
    expect(result.board.cells[11 * BOARD_WIDTH + 1]).toEqual({ kind: 'T', marker: 'row-clear' });
    expect(board.cells).toEqual(snapshot);
  });

  it('does not scan rows after explicit deletion', () => {
    const board = boardWithFullRow(10, boardWithCell(emptyBoard(), 23, 0));

    const result = deleteVisibleRow(board, 19);

    expect(result.deleted).toBe(true);
    expect(result.board.cells.slice(11 * BOARD_WIDTH, 12 * BOARD_WIDTH).every(Boolean)).toBe(true);
  });

  it('leaves invalid, hidden, and empty visible rows unchanged', () => {
    const board = boardWithCell(emptyBoard(), 4, 0);

    for (const row of [-1, 1, 20]) {
      const result = deleteVisibleRow(board, row);
      expect(result).toEqual({ board, deleted: false, markers: [] });
    }
  });
});

describe('garbage physics', () => {
  it('raises every fixed cell one row and appends nine garbage cells around one hole', () => {
    let board = boardWithCell(emptyBoard(), 5, 1, {
      kind: 'T',
      marker: 'freeze',
    });
    const snapshot = [...board.cells];

    const result: RaiseGarbageRowResult = raiseGarbageRow(board, 4);

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
      const snapshot = [...board.cells];

      const result = raiseGarbageRow(board, holeColumn);

      expect(result.status).toBe('invalid-hole');
      expect(result.board).toBe(board);
      expect(board.cells).toEqual(snapshot);
    },
  );

  it('returns top-out before discarding an occupied top stored row', () => {
    const board = boardWithCell(emptyBoard(), 0, 7);
    const snapshot = [...board.cells];

    const result = raiseGarbageRow(board, 3);

    expect(result.status).toBe('top-out');
    expect(result.board).toBe(board);
    expect(board.cells).toEqual(snapshot);
  });

  it('keeps garbage identity through a different full-row clear and never assigns it to locked O cells', () => {
    let full = emptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x += 1) full = boardWithCell(full, BOARD_ROWS - 1, x, { kind: 'T' });
    const garbage = raiseGarbageRow(full, 3).board;
    const locked = lockPiece(emptyBoard(), active('O', 3, 5));

    const garbageCells = occupiedCells(garbage).filter((cell) => cell.garbage === true);
    const cleared = clearFullRows(garbage);
    expect(garbageCells.every((cell) => cell.garbage === true)).toBe(true);
    expect(garbageCells).toHaveLength(9);
    expect(occupiedCells(locked).every((cell) => cell.garbage !== true)).toBe(true);
    expect(cleared.rows).toEqual([BOARD_ROWS - 2]);
    expect(cleared.board.cells[(BOARD_ROWS - 1) * BOARD_WIDTH + 3]).toBeNull();
    expect(cleared.board.cells[(BOARD_ROWS - 1) * BOARD_WIDTH + 4])
      .toEqual({ kind: 'O', garbage: true });
  });
});
