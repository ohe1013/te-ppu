import { describe, expect, it } from 'vitest';
import { raiseGarbageBatch, resolveAttackExchange } from '../../src/core/attack';
import { emptyBoard } from '../../src/core/board';
import { createSideState } from '../../src/core/field';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  type Board,
  type SideState,
} from '../../src/core/model';

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
  it('requires the recipient stream at the API boundary', () => {
    if (false) {
      // @ts-expect-error garbage recipient must be explicit
      raiseGarbageBatch(waitingForGarbage(1), 0);
    }

    expect(true).toBe(true);
  });

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

  it('uses the opponent recipient stream for row holes', () => {
    const result = raiseGarbageBatch(waitingForGarbage(4), 0, 'opponent');

    expect(result.events).toEqual([{
      type: 'garbage-raised',
      side: 'opponent',
      amount: 4,
      holeColumns: [5, 2, 9, 2],
    }]);
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
    expect(result.side.incoming).toBe(0);
    expect(result.side).toMatchObject({ phase: 'top-out', topOut: true });
  });
});
