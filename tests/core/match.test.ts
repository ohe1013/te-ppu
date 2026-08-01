import { describe, expect, it } from 'vitest';
import { emptyBoard, occupiedCells } from '../../src/core/board';
import { createMatch, stepMatch } from '../../src/core/match';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  FREEZE_TICKS,
  type ActivePiece,
  type Board,
  type Cell,
  type GameCommand,
  type MatchState,
  type SideId,
  type SideState,
  type TimedCommand,
} from '../../src/core/model';

function command(
  state: MatchState,
  side: SideId,
  gameCommand: GameCommand,
  tick = state.tick + 1,
): TimedCommand {
  return { tick, side, command: gameCommand };
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

function boardCompletableByHorizontalI(): Board {
  let board = emptyBoard();
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    if (x < 3 || x > 6) board = boardWithCell(board, x, BOARD_ROWS - 1);
  }
  return board;
}

function active(kind: ActivePiece['token']['kind'], x = 3, y = 2): ActivePiece {
  return {
    token: { serial: 90, kind, marker: null },
    x,
    y,
    rotation: 0,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

describe('match creation and command frames', () => {
  it('starts at tick zero with a default countdown and equal independent side streams', () => {
    const state = createMatch({ matchSeed: 13 });

    expect(state).toMatchObject({ tick: 0, countdownTicks: 180, status: 'countdown' });
    expect(state.sides.player.phase).toBe('countdown');
    expect(state.sides.opponent.phase).toBe('countdown');
    expect(state.sides.player.active?.token).toEqual(state.sides.opponent.active?.token);
    expect(state.sides.player.next).toEqual(state.sides.opponent.next);
    expect(state.sides.player).not.toBe(state.sides.opponent);
    expect(state.sides.player.board).not.toBe(state.sides.opponent.board);
    expect(state.sides.player.appeared).not.toBe(state.sides.opponent.appeared);
  });

  it('accepts only the next tick and preserves each side command order', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', { active: active('T') });
    state = patchSide(state, 'opponent', { active: active('T') });

    const result = stepMatch(state, [
      command(state, 'player', { type: 'hard-drop' }),
      command(state, 'opponent', { type: 'move', dx: -1 }),
      command(state, 'player', { type: 'move', dx: 1 }),
    ]);

    expect(result.state.tick).toBe(1);
    expect(occupiedCells(result.state.sides.player.board)).toEqual([
      { x: 4, y: 22, kind: 'T' },
      { x: 3, y: 23, kind: 'T' },
      { x: 4, y: 23, kind: 'T' },
      { x: 5, y: 23, kind: 'T' },
    ]);
    expect(result.state.sides.opponent.active).toMatchObject({ x: 2, y: 2 });
  });

  it('ignores stale and future item commands without consuming them', () => {
    let state = createMatch({ matchSeed: 5, countdownTicks: 0 });
    const board = boardWithCell(emptyBoard(), 0, 10);
    state = patchSide(state, 'player', {
      board,
      inventory: { rowClear: 1, freeze: 1, queueSwap: 1 },
    });
    const next = state.sides.player.next;

    const result = stepMatch(state, [
      command(state, 'player', { type: 'use-row-clear', row: 6 }, state.tick),
      command(state, 'player', { type: 'use-freeze' }, state.tick + 2),
      command(state, 'player', { type: 'use-queue-swap' }, state.tick + 2),
    ]);

    expect(result.state.sides.player.inventory).toEqual({ rowClear: 1, freeze: 1, queueSwap: 1 });
    expect(result.state.sides.player.next).toEqual(next);
    expect(result.state.sides.player.board).toEqual(board);
  });

  it('does not mutate frozen input state or command arrays', () => {
    const state = deepFreeze(createMatch({ matchSeed: 8, countdownTicks: 0 }));
    const commands = deepFreeze([
      command(state, 'player', { type: 'move', dx: 1 }),
      command(state, 'opponent', { type: 'rotate-clockwise' }),
    ] as const);
    const stateSnapshot = JSON.stringify(state);
    const commandSnapshot = JSON.stringify(commands);

    const result = stepMatch(state, commands);

    expect(result.state).not.toBe(state);
    expect(JSON.stringify(state)).toBe(stateSnapshot);
    expect(JSON.stringify(commands)).toBe(commandSnapshot);
  });
});

describe('simultaneous freeze', () => {
  it('validates both uses from the pre-tick snapshot and freezes both targets', () => {
    let state = createMatch({ matchSeed: 2, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      inventory: { ...state.sides.player.inventory, freeze: 1 },
    });
    state = patchSide(state, 'opponent', {
      inventory: { ...state.sides.opponent.inventory, freeze: 1 },
    });

    const result = stepMatch(state, [
      command(state, 'opponent', { type: 'use-freeze' }),
      command(state, 'player', { type: 'use-freeze' }),
    ]);

    expect(result.state.sides.player.inventory.freeze).toBe(0);
    expect(result.state.sides.opponent.inventory.freeze).toBe(0);
    expect(result.state.sides.player.freezeTicks).toBe(FREEZE_TICKS - 1);
    expect(result.state.sides.opponent.freezeTicks).toBe(FREEZE_TICKS - 1);
    expect(result.state.sides.player.gravityTicks).toBe(0);
    expect(result.state.sides.opponent.gravityTicks).toBe(0);
    expect(result.events.filter(({ type }) => type === 'item-used').map(({ side }) => side))
      .toEqual(['player', 'opponent']);
    expect(result.events.filter(({ type }) => type === 'freeze-applied').map(({ side }) => side))
      .toEqual(['player', 'opponent']);
  });

  it('suppresses every target command on the activation tick while the actor advances', () => {
    let state = createMatch({ matchSeed: 3, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      inventory: { ...state.sides.player.inventory, freeze: 1 },
    });
    const opponentActive = state.sides.opponent.active;

    const result = stepMatch(state, [
      command(state, 'opponent', { type: 'hard-drop' }),
      command(state, 'player', { type: 'use-freeze' }),
      command(state, 'opponent', { type: 'move', dx: 1 }),
    ]);

    expect(result.state.sides.opponent.active).toBe(opponentActive);
    expect(result.state.sides.opponent.board.cells.every((cell) => cell === null)).toBe(true);
    expect(result.state.sides.opponent.freezeTicks).toBe(FREEZE_TICKS - 1);
    expect(result.state.sides.opponent.gravityTicks).toBe(0);
    expect(result.state.sides.player.gravityTicks).toBe(1);
  });

  it('skips exactly 180 target advances including the activation tick', () => {
    let state = createMatch({ matchSeed: 4, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      inventory: { ...state.sides.player.inventory, freeze: 1 },
    });

    state = stepMatch(state, [command(state, 'player', { type: 'use-freeze' })]).state;
    for (let skipped = 1; skipped < FREEZE_TICKS; skipped += 1) {
      state = stepMatch(state, []).state;
    }

    expect(state.tick).toBe(FREEZE_TICKS);
    expect(state.sides.opponent.freezeTicks).toBe(0);
    expect(state.sides.opponent.gravityTicks).toBe(0);

    state = stepMatch(state, []).state;
    expect(state.sides.opponent.gravityTicks).toBe(1);
  });
});

describe('simultaneous attack, garbage, and top-out', () => {
  it('resolves a normal clear and row item attack together without ending the item user piece', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardCompletableByHorizontalI(),
      active: active('I'),
    });
    state = patchSide(state, 'opponent', {
      board: boardWithCell(emptyBoard(), 0, 10),
      incoming: 1,
      inventory: { ...state.sides.opponent.inventory, rowClear: 1 },
    });
    const opponentToken = state.sides.opponent.active?.token;
    const opponentNextSerial = state.sides.opponent.nextSerial;

    const result = stepMatch(state, [
      command(state, 'opponent', { type: 'use-row-clear', row: 6 }),
      command(state, 'player', { type: 'hard-drop' }),
    ]);

    expect(result.state.sides.player.combo).toBe(1);
    expect(result.state.sides.player.incoming).toBe(0);
    expect(result.state.sides.opponent.incoming).toBe(1);
    expect(result.state.sides.opponent.garbageDrawIndex).toBe(0);
    expect(result.state.sides.opponent.phase).toBe('active');
    expect(result.state.sides.opponent.active?.token).toBe(opponentToken);
    expect(result.state.sides.opponent.nextSerial).toBe(opponentNextSerial);
    expect(result.state.sides.opponent.inventory.rowClear).toBe(0);
  });

  it('keeps incoming queued until a normal lock then drops the whole batch before spawn', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', { incoming: 3 });
    const nextToken = state.sides.player.next[0];

    state = stepMatch(state, []).state;
    expect(state.sides.player.incoming).toBe(3);
    expect(state.sides.player.garbageDrawIndex).toBe(0);
    expect(state.sides.player.board.cells.every((cell) => cell === null)).toBe(true);

    const result = stepMatch(state, [command(state, 'player', { type: 'hard-drop' })]);

    expect(result.state.sides.player.incoming).toBe(0);
    expect(result.state.sides.player.garbageDrawIndex).toBe(3);
    expect(occupiedCells(result.state.sides.player.board)).toHaveLength(7);
    expect(result.state.sides.player.active?.token).toEqual(nextToken);
    expect(result.events.filter(({ type, side }) => type === 'garbage-landed' && side === 'player'))
      .toHaveLength(3);
  });

  it('finishes both same-tick garbage top-outs before declaring a draw', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardWithCell(emptyBoard(), 3, 0),
      incoming: 1,
    });
    state = patchSide(state, 'opponent', {
      board: boardWithCell(emptyBoard(), 5, 0),
      incoming: 1,
    });

    const result = stepMatch(state, [
      command(state, 'opponent', { type: 'hard-drop' }),
      command(state, 'player', { type: 'hard-drop' }),
    ]);

    expect(result.state.status).toBe('draw');
    expect(result.state.sides.player).toMatchObject({ active: null, phase: 'top-out', topOut: true });
    expect(result.state.sides.opponent).toMatchObject({ active: null, phase: 'top-out', topOut: true });
    expect(result.events.filter(({ type }) => type === 'top-out').map(({ side }) => side))
      .toEqual(['player', 'opponent']);
  });
});
