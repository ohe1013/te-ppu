import { describe, expect, it } from 'vitest';
import { clearFullRows, emptyBoard, lockPiece, occupiedCells } from '../../src/core/board';
import { createSideState, spawnNextPiece } from '../../src/core/field';
import { acquireMarkers, makePieceToken, resolveNormalClear } from '../../src/core/items';
import {
  BOARD_WIDTH,
  type AppearedItems,
  type Board,
  type Cell,
  type Inventory,
} from '../../src/core/model';
import { spawnPiece, tryRotateClockwise } from '../../src/core/pieces';

const NONE_APPEARED: AppearedItems = {
  'row-clear': false,
  freeze: false,
  'queue-swap': false,
};

const EMPTY_INVENTORY: Inventory = { rowClear: 0, freeze: 0, queueSwap: 0 };

function boardWithFullRow(y: number, board: Board = emptyBoard()): Board {
  const cells = [...board.cells];
  for (let x = 0; x < BOARD_WIDTH; x += 1) cells[y * BOARD_WIDTH + x] = { kind: 'O' };
  return { cells };
}

function boardWithCell(board: Board, x: number, y: number, cell: Cell): Board {
  const cells = [...board.cells];
  cells[y * BOARD_WIDTH + x] = cell;
  return { cells };
}

describe('normal clear combos', () => {
  it.each([
    { previous: 1, lines: 4, expected: { combo: 2, attack: 5 } },
    { previous: 2, lines: 4, expected: { combo: 3, attack: 6 } },
    { previous: 25, lines: 1, expected: { combo: 26, attack: 26 } },
    { previous: 8, lines: 0, expected: { combo: 0, attack: 0 } },
  ])('resolves combo $previous with $lines cleared lines', ({ previous, lines, expected }) => {
    expect(resolveNormalClear(previous, lines)).toEqual(expected);
  });

  it('increments a combo once for a multi-line lock rather than once per line', () => {
    expect(resolveNormalClear(6, 3)).toEqual({ combo: 7, attack: 9 });
  });
});

describe('deterministic item markers', () => {
  it('gives equal-seed sides equal tokens without sharing their appearance record', () => {
    const player = createSideState(0);
    const opponent = createSideState(0);

    expect(player.active?.token).toEqual(opponent.active?.token);
    expect(player.next).toEqual(opponent.next);
    expect(player.appeared).toEqual(opponent.appeared);
    expect(player.appeared).not.toBe(opponent.appeared);
  });

  it('uses only the eligibility lane for the single fifteen-percent token check', () => {
    const result = makePieceToken(0, 0, NONE_APPEARED);

    expect(result.token.marker).toBeNull();
    expect(result.appeared).toEqual(NONE_APPEARED);
  });

  it('repeats the same type and mino choice for equal seed, serial, and appearance state', () => {
    const first = makePieceToken(4, 0, NONE_APPEARED);
    const second = makePieceToken(4, 0, { ...NONE_APPEARED });

    expect(first).toEqual(second);
    expect(first.token.marker).toEqual({ item: 'row-clear', minoIndex: 1 });
  });

  it('chooses uniformly from the ordered unseen types and records appearance immediately', () => {
    const rowClearSeen: AppearedItems = { ...NONE_APPEARED, 'row-clear': true };
    const rowClearAndFreezeSeen: AppearedItems = { ...rowClearSeen, freeze: true };

    const first = makePieceToken(4, 0, NONE_APPEARED);
    const second = makePieceToken(4, 0, rowClearSeen);
    const third = makePieceToken(4, 0, rowClearAndFreezeSeen);

    expect(first).toMatchObject({
      token: { marker: { item: 'row-clear', minoIndex: 1 } },
      appeared: { 'row-clear': true, freeze: false, 'queue-swap': false },
    });
    expect(second).toMatchObject({
      token: { marker: { item: 'freeze', minoIndex: 1 } },
      appeared: { 'row-clear': true, freeze: true, 'queue-swap': false },
    });
    expect(third).toMatchObject({
      token: { marker: { item: 'queue-swap', minoIndex: 1 } },
      appeared: { 'row-clear': true, freeze: true, 'queue-swap': true },
    });
    expect(rowClearSeen).toEqual({ 'row-clear': true, freeze: false, 'queue-swap': false });
  });

  it('skips the eligibility roll after all three item types have appeared', () => {
    const allAppeared: AppearedItems = {
      'row-clear': true,
      freeze: true,
      'queue-swap': true,
    };

    expect(makePieceToken(4, 0, allAppeared)).toMatchObject({
      token: { marker: null },
      appeared: allAppeared,
    });
  });

  it('threads appearances through previews so a marker is never rerolled after generation', () => {
    const initial = createSideState(13);

    expect(initial.next[0].marker).toEqual({ item: 'row-clear', minoIndex: 2 });
    expect(initial.appeared).toEqual({
      'row-clear': true,
      freeze: false,
      'queue-swap': false,
    });

    const firstSpawn = spawnNextPiece({ ...initial, active: null, phase: 'garbage-drop' }, 13).state;
    expect(firstSpawn.next[1].marker).toEqual({ item: 'freeze', minoIndex: 2 });

    const secondSpawn = spawnNextPiece(
      { ...firstSpawn, active: null, phase: 'garbage-drop' },
      13,
    ).state;
    expect(secondSpawn.next[1].marker).toEqual({ item: 'queue-swap', minoIndex: 3 });
    expect(secondSpawn.appeared).toEqual({
      'row-clear': true,
      freeze: true,
      'queue-swap': true,
    });
  });

  it('keeps a generated marker attached through movement, rotation, and lock', () => {
    const { token } = makePieceToken(10, 0, NONE_APPEARED);
    const moved = { ...spawnPiece(token), x: 4 };
    const rotated = tryRotateClockwise(emptyBoard(), moved);
    const locked = lockPiece(emptyBoard(), rotated);

    expect(occupiedCells(locked).filter((cell) => cell.marker !== undefined)).toEqual([
      { x: 6, y: 4, kind: 'I', marker: 'row-clear' },
    ]);
  });
});

describe('marker acquisition', () => {
  it('awards every cleared marker before row removal and gives three queue-swap charges', () => {
    let board = boardWithFullRow(22);
    board = boardWithFullRow(23, board);
    board = boardWithCell(board, 1, 22, { kind: 'I', marker: 'freeze' });
    board = boardWithCell(board, 6, 22, { kind: 'T', marker: 'row-clear' });
    board = boardWithCell(board, 4, 23, { kind: 'L', marker: 'queue-swap' });
    const snapshot = [...board.cells];

    const cleared = clearFullRows(board);
    const inventory = acquireMarkers(EMPTY_INVENTORY, cleared.markers);

    expect(cleared.markers).toEqual(['freeze', 'row-clear', 'queue-swap']);
    expect(inventory).toEqual({ rowClear: 1, freeze: 1, queueSwap: 3 });
    expect(cleared.board.cells.every((cell) => cell === null)).toBe(true);
    expect(board.cells).toEqual(snapshot);
  });

  it('adds rewards to an existing inventory without mutating it', () => {
    const inventory: Inventory = { rowClear: 2, freeze: 4, queueSwap: 5 };

    expect(acquireMarkers(inventory, ['queue-swap', 'freeze'])).toEqual({
      rowClear: 2,
      freeze: 5,
      queueSwap: 8,
    });
    expect(inventory).toEqual({ rowClear: 2, freeze: 4, queueSwap: 5 });
  });
});
