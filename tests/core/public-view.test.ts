import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../src/core/board';
import {
  createAiObservation,
  createMatch,
  createPublicMatchView,
  stepMatch,
} from '../../src/core/match';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  VISIBLE_ROWS,
  type Board,
  type Cell,
  type MatchState,
  type SideId,
  type SideState,
} from '../../src/core/model';
import { ghostY } from '../../src/core/pieces';

function boardWithCell(board: Board, x: number, y: number, cell: Cell): Board {
  const cells = [...board.cells];
  cells[y * BOARD_WIDTH + x] = cell;
  return { cells };
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

describe('public match projection', () => {
  it('exposes exactly the visible render contract with two serial-free previews', () => {
    let state = createMatch({ matchSeed: 13, countdownTicks: 0 });
    const board = boardWithCell(emptyBoard(), 2, HIDDEN_ROWS, {
      kind: 'T',
      marker: 'freeze',
    });
    state = patchSide(state, 'player', {
      board,
      combo: 4,
      incoming: 7,
      inventory: { rowClear: 1, freeze: 2, queueSwap: 3 },
      freezeTicks: 9,
    });

    const view = createPublicMatchView(state);
    const player = view.sides.player;

    expect(view).toEqual({
      tick: state.tick,
      status: 'playing',
      sides: { player: expect.any(Object), opponent: expect.any(Object) },
    });
    expect(Object.keys(player)).toEqual([
      'board',
      'active',
      'ghostY',
      'next',
      'combo',
      'incoming',
      'inventory',
      'freezeTicks',
      'phase',
      'topOut',
    ]);
    expect(player.board).toHaveLength(BOARD_WIDTH * VISIBLE_ROWS);
    expect(player.board[2]).toEqual({ kind: 'T', marker: 'freeze' });
    expect(player.active?.y).toBe(state.sides.player.active!.y - HIDDEN_ROWS);
    expect(player.ghostY).toBe(ghostY(board, state.sides.player.active!) - HIDDEN_ROWS);
    expect(player.next).toHaveLength(2);
    expect(player.next[0]).not.toHaveProperty('serial');
    expect(player.next[1]).not.toHaveProperty('serial');
    expect(player).toMatchObject({
      combo: 4,
      incoming: 7,
      inventory: { rowClear: 1, freeze: 2, queueSwap: 3 },
      freezeTicks: 9,
      phase: 'active',
      topOut: false,
    });
  });

  it('returns detached nested values and reading views does not consume freeze time', () => {
    let state = createMatch({ matchSeed: 6, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardWithCell(emptyBoard(), 0, HIDDEN_ROWS, { kind: 'I' }),
      inventory: { ...state.sides.player.inventory, freeze: 1 },
    });
    state = stepMatch(state, [{
      tick: 1,
      side: 'player',
      command: { type: 'use-freeze' },
    }]).state;

    const first = createPublicMatchView(state);
    const second = createPublicMatchView(state);

    expect(state.sides.opponent.freezeTicks).toBe(179);
    expect(first.sides.opponent.freezeTicks).toBe(179);
    expect(second.sides.opponent.freezeTicks).toBe(179);
    expect(first.sides.player.board).not.toBe(state.sides.player.board.cells);
    expect(first.sides.player.board[0]).not.toBe(state.sides.player.board.cells[HIDDEN_ROWS * BOARD_WIDTH]);
    expect(first.sides.player.active).not.toBe(state.sides.player.active);
    expect(first.sides.player.active?.token).not.toBe(state.sides.player.active?.token);
    expect(first.sides.player.next[0]).not.toBe(state.sides.player.next[0]);
    expect(first.sides.player.inventory).not.toBe(state.sides.player.inventory);
  });
});

describe('AI observation boundary', () => {
  it('shows self previews but removes opponent previews, ghost, hidden rows, and private state', () => {
    let state = createMatch({ matchSeed: 21, countdownTicks: 0 });
    let playerBoard = boardWithCell(emptyBoard(), 0, 0, { kind: 'I' });
    playerBoard = boardWithCell(playerBoard, 1, HIDDEN_ROWS, { kind: 'J' });
    let opponentBoard = boardWithCell(emptyBoard(), 2, 1, { kind: 'L' });
    opponentBoard = boardWithCell(opponentBoard, 3, HIDDEN_ROWS, { kind: 'S' });
    state = patchSide(state, 'player', { board: playerBoard });
    state = patchSide(state, 'opponent', { board: opponentBoard });

    const observation = createAiObservation(state, 'opponent');

    expect(observation.tick).toBe(state.tick);
    expect(observation.status).toBe('playing');
    expect(observation.self.next).toHaveLength(2);
    expect(observation.self).toHaveProperty('ghostY');
    expect(observation.self.board).toHaveLength(BOARD_WIDTH * VISIBLE_ROWS);
    expect(observation.self.board[3]).toEqual({ kind: 'S' });
    expect(observation.self.board).not.toContainEqual({ kind: 'L' });
    expect(observation.opponent.board).toHaveLength(BOARD_WIDTH * VISIBLE_ROWS);
    expect(observation.opponent.board[1]).toEqual({ kind: 'J' });
    expect(observation.opponent.board).not.toContainEqual({ kind: 'I' });
    expect(observation.opponent).not.toHaveProperty('next');
    expect(observation.opponent).not.toHaveProperty('ghostY');
    expect(Object.keys(observation.opponent)).toEqual([
      'board',
      'active',
      'combo',
      'incoming',
      'inventory',
      'freezeTicks',
      'phase',
      'topOut',
    ]);
    expect(JSON.stringify(observation)).not.toMatch(
      /matchSeed|countdownTicks|garbageDrawIndex|nextSerial|appeared|gravityTicks|softDrop|lockTicks|lockResets|serial/,
    );
  });
});
