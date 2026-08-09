import { describe, expect, it } from 'vitest';
import { emptyBoard, occupiedCells } from '../../src/core/board';
import { applySideCommands, createSideState } from '../../src/core/field';
import { useQueueSwap, useRowClear } from '../../src/core/items';
import {
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type Cell,
  type SidePhase,
  type SideState,
} from '../../src/core/model';

function boardWithCell(
  board: Board,
  x: number,
  y: number,
  cell: Cell = { kind: 'O' },
): Board {
  const cells = [...board.cells];
  cells[y * BOARD_WIDTH + x] = cell;
  return { cells };
}

function boardWithFullRow(board: Board, y: number): Board {
  let result = board;
  for (let x = 0; x < BOARD_WIDTH; x += 1) result = boardWithCell(result, x, y);
  return result;
}

function activeO(y: number): ActivePiece {
  return {
    token: { serial: 90, kind: 'O', marker: null },
    x: 3,
    y,
    rotation: 0,
  };
}

function sideWithItems(
  inventory: Partial<SideState['inventory']>,
  board: Board = emptyBoard(),
  active: ActivePiece | null = activeO(2),
): SideState {
  const initial = createSideState(37);
  return {
    ...initial,
    board,
    active,
    inventory: { ...initial.inventory, ...inventory },
    phase: 'active',
    topOut: false,
  };
}

describe('row-clear item', () => {
  it.each([
    { label: 'negative', row: -1, board: boardWithCell(emptyBoard(), 0, 4) },
    { label: 'fractional', row: 1.5, board: boardWithCell(emptyBoard(), 0, 5) },
    { label: 'past the visible field', row: 20, board: boardWithCell(emptyBoard(), 0, 23) },
    { label: 'empty', row: 6, board: emptyBoard() },
  ])('does not consume or change state for a $label row', ({ row, board }) => {
    const side = sideWithItems({ rowClear: 1 }, board);
    const result = useRowClear(side, row, 'player');

    expect(result.state).toBe(side);
    expect(result).toMatchObject({ outgoingAttack: 0, events: [] });
  });

  it('does not consume or change state without a charge', () => {
    const side = sideWithItems({ rowClear: 0 }, boardWithCell(emptyBoard(), 2, 12));
    const result = useRowClear(side, 8, 'player');

    expect(result.state).toBe(side);
    expect(result).toMatchObject({ outgoingAttack: 0, events: [] });
  });

  it('deletes exactly the selected row, awards its markers, and preserves combo', () => {
    let board = boardWithCell(emptyBoard(), 3, 9, { kind: 'T' });
    board = boardWithCell(board, 0, 10, { kind: 'I', marker: 'freeze' });
    board = boardWithCell(board, 5, 10, { kind: 'L', marker: 'row-clear' });
    board = boardWithCell(board, 9, 10, { kind: 'S', marker: 'queue-swap' });
    board = boardWithFullRow(board, 23);
    const side = {
      ...sideWithItems({ rowClear: 2, freeze: 4, queueSwap: 5 }, board),
      combo: 8,
    };
    const snapshot = [...side.board.cells];

    const result = useRowClear(side, 6, 'player');

    expect(result.outgoingAttack).toBe(1);
    expect(result.state.inventory).toEqual({ rowClear: 2, freeze: 5, queueSwap: 8 });
    expect(result.state.combo).toBe(8);
    expect(result.state.board.cells[10 * BOARD_WIDTH + 3]).toEqual({ kind: 'T' });
    expect(result.state.board.cells.slice(23 * BOARD_WIDTH).every(Boolean)).toBe(true);
    expect(occupiedCells(result.state.board)).toHaveLength(BOARD_WIDTH + 1);
    expect(result.events.map(({ type, item, row }) => ({ type, item, row }))).toEqual([
      { type: 'item-acquired', item: 'freeze', row: undefined },
      { type: 'item-acquired', item: 'row-clear', row: undefined },
      { type: 'item-acquired', item: 'queue-swap', row: undefined },
      { type: 'item-used', item: 'row-clear', row: 6 },
    ]);
    expect(side.board.cells).toEqual(snapshot);
    expect(side.inventory).toEqual({ rowClear: 2, freeze: 4, queueSwap: 5 });
  });

  it('lifts the active piece by the minimum collision-free integer distance', () => {
    let board = boardWithCell(emptyBoard(), 4, 5);
    board = boardWithCell(board, 0, 10);
    const side = sideWithItems({ rowClear: 1 }, board, activeO(6));

    const result = useRowClear(side, 6, 'player');

    expect(result.state.active).toEqual({ ...side.active, y: 4 });
    expect(result.state.topOut).toBe(false);
    expect(side.active?.y).toBe(6);
  });

  it('tops out when every lift either collides or crosses the hidden-row ceiling', () => {
    let board = boardWithCell(emptyBoard(), 4, 0);
    board = boardWithCell(board, 0, 4);
    const side = sideWithItems({ rowClear: 1 }, board, activeO(1));

    const result = useRowClear(side, 0, 'player');

    expect(result.outgoingAttack).toBe(1);
    expect(result.state).toMatchObject({ active: null, phase: 'top-out', topOut: true });
    expect(result.events.map(({ type }) => type)).toEqual(['item-used', 'top-out']);
  });
});

describe('queue-swap item', () => {
  it('swaps only the two full preview tokens and spends one of three charges', () => {
    const side = sideWithItems({ queueSwap: 3 });

    const result = useQueueSwap(side, 'player');

    expect(result.state.active).toBe(side.active);
    expect(result.state.next[0]).toBe(side.next[1]);
    expect(result.state.next[1]).toBe(side.next[0]);
    expect(result.state.inventory.queueSwap).toBe(2);
    expect(result.state.nextSerial).toBe(side.nextSerial);
    expect(result.state.appeared).toBe(side.appeared);
    expect(result.outgoingAttack).toBe(0);
    expect(result.events.map(({ type, item }) => ({ type, item }))).toEqual([
      { type: 'item-used', item: 'queue-swap' },
    ]);
    expect(side.inventory.queueSwap).toBe(3);
  });

  it('allows exactly three acquired charges and rejects a fourth use', () => {
    const side = sideWithItems({ queueSwap: 3 });
    const first = useQueueSwap(side, 'player');
    const second = useQueueSwap(first.state, 'player');
    const third = useQueueSwap(second.state, 'player');
    const fourth = useQueueSwap(third.state, 'player');

    expect(third.state.inventory.queueSwap).toBe(0);
    expect(third.state.next).toEqual([side.next[1], side.next[0]]);
    expect(fourth.state).toBe(third.state);
    expect(fourth).toMatchObject({ outgoingAttack: 0, events: [] });
  });
});

describe('item command gating', () => {
  it('requires the caller to attribute item events to an explicit side', () => {
    const side = sideWithItems({ rowClear: 1, queueSwap: 1 });

    if (false) {
      // @ts-expect-error row-clear item events require an actor side
      useRowClear(side, 0);
      // @ts-expect-error queue-swap item events require an actor side
      useQueueSwap(side);
      // @ts-expect-error routed item commands require an actor side
      applySideCommands(side, []);
    }

    expect(true).toBe(true);
  });

  it.each(['lock', 'clear-and-attack', 'offset', 'garbage-drop', 'top-out'] as const)(
    'leaves both items unused during %s',
    (phase: SidePhase) => {
      const board = boardWithCell(emptyBoard(), 0, 10);
      const side = { ...sideWithItems({ rowClear: 1, queueSwap: 1 }, board), phase };
      const rowClear = useRowClear(side, 6, 'player');
      const queueSwap = useQueueSwap(side, 'player');

      expect(rowClear.state).toBe(side);
      expect(rowClear).toMatchObject({ outgoingAttack: 0, events: [] });
      expect(queueSwap.state).toBe(side);
      expect(queueSwap).toMatchObject({ outgoingAttack: 0, events: [] });
    },
  );

  it('routes exact active item commands and retains the row attack for offset', () => {
    const board = boardWithCell(emptyBoard(), 0, 10);
    const side = sideWithItems({ rowClear: 1, queueSwap: 1 }, board);

    const result = applySideCommands(side, [
      { type: 'use-row-clear', row: 6 },
      { type: 'use-queue-swap' },
    ], 'opponent');

    expect(result.state.inventory).toEqual({ rowClear: 0, freeze: 0, queueSwap: 0 });
    expect(result.outgoingAttack).toBe(1);
    expect(result.events.map(({ item }) => item)).toEqual(['row-clear', 'queue-swap']);
    expect(result.events.map(({ side: eventSide }) => eventSide)).toEqual(['opponent', 'opponent']);
  });
});
