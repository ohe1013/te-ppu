import { describe, expect, it } from 'vitest';
import { dropGarbageBatch, resolveAttackExchange } from '../../src/core/attack';
import { emptyBoard, occupiedCells } from '../../src/core/board';
import { createSideState } from '../../src/core/field';
import { BOARD_ROWS, BOARD_WIDTH, type Board, type SideState } from '../../src/core/model';

function boardWithCell(board: Board, x: number, y: number): Board {
  const cells = [...board.cells];
  cells[y * BOARD_WIDTH + x] = { kind: 'O' };
  return { cells };
}

function waitingForGarbage(incoming: number, board = emptyBoard()): SideState {
  return {
    ...createSideState(1),
    board,
    active: null,
    incoming,
    phase: 'garbage-drop',
  };
}

describe('simultaneous attack offset', () => {
  it('cancels each sender\'s own queue before netting same-tick excesses', () => {
    expect(resolveAttackExchange({
      playerIncoming: 3,
      opponentIncoming: 1,
      playerOutgoing: 8,
      opponentOutgoing: 4,
    })).toEqual({
      playerIncoming: 0,
      opponentIncoming: 2,
      playerOffset: 3,
      opponentOffset: 1,
      sentToPlayer: 0,
      sentToOpponent: 2,
    });
  });

  it('nets simultaneous excesses before adding a queue entry', () => {
    expect(resolveAttackExchange({
      playerIncoming: 2,
      opponentIncoming: 0,
      playerOutgoing: 7,
      opponentOutgoing: 3,
    })).toEqual({
      playerIncoming: 0,
      opponentIncoming: 2,
      playerOffset: 2,
      opponentOffset: 0,
      sentToPlayer: 0,
      sentToOpponent: 2,
    });
  });

  it('never returns a negative queue or offset for non-positive inputs', () => {
    expect(resolveAttackExchange({
      playerIncoming: -3,
      opponentIncoming: 1,
      playerOutgoing: -2,
      opponentOutgoing: 0,
    })).toEqual({
      playerIncoming: 0,
      opponentIncoming: 1,
      playerOffset: 0,
      opponentOffset: 0,
      sentToPlayer: 0,
      sentToOpponent: 0,
    });
  });
});

describe('seeded garbage batches', () => {
  it('uses the player recipient stream and advances only that side draw index', () => {
    const side = waitingForGarbage(4);
    const result = dropGarbageBatch(side, 0);

    expect(occupiedCells(result.side.board)).toEqual([
      { x: 3, y: BOARD_ROWS - 2, kind: 'O' },
      { x: 2, y: BOARD_ROWS - 1, kind: 'O' },
      { x: 3, y: BOARD_ROWS - 1, kind: 'O' },
      { x: 4, y: BOARD_ROWS - 1, kind: 'O' },
    ]);
    expect(result.side.garbageDrawIndex).toBe(4);
    expect(result.side.incoming).toBe(0);
    expect(result.events).toEqual([
      { type: 'garbage-landed', side: 'player', amount: 1 },
      { type: 'garbage-landed', side: 'player', amount: 1 },
      { type: 'garbage-landed', side: 'player', amount: 1 },
      { type: 'garbage-landed', side: 'player', amount: 1 },
    ]);
    expect(side.incoming).toBe(4);
    expect(side.garbageDrawIndex).toBe(0);
  });

  it('leaves a garbage-completed row in place until normal locking clears it', () => {
    let board = emptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (x !== 3) board = boardWithCell(board, x, BOARD_ROWS - 1);
    }
    const side = waitingForGarbage(1, board);

    const result = dropGarbageBatch(side, 0);

    expect(result.side.board.cells.slice((BOARD_ROWS - 1) * BOARD_WIDTH).every(Boolean)).toBe(true);
    expect(result.events).toEqual([{ type: 'garbage-landed', side: 'player', amount: 1 }]);
  });

  it('accepts an unbounded batch and stops only when a sequential drop overflows', () => {
    const side = waitingForGarbage(1_000);
    const result = dropGarbageBatch(side, 9);

    expect(result.events).toHaveLength(182);
    expect(result.side.topOut).toBe(true);
    expect(result.side.incoming).toBe(0);
    expect(result.side.garbageDrawIndex).toBe(182);
  });

  it('stops at overflow, marks top-out, and reports the terminal event', () => {
    const side = waitingForGarbage(2, boardWithCell(emptyBoard(), 3, 0));
    const result = dropGarbageBatch(side, 0);

    expect(result.side.topOut).toBe(true);
    expect(result.side.phase).toBe('top-out');
    expect(result.side.incoming).toBe(0);
    expect(result.side.garbageDrawIndex).toBe(1);
    expect(result.events).toEqual([{ type: 'top-out', side: 'player' }]);
    expect(side.topOut).toBe(false);
  });
});
