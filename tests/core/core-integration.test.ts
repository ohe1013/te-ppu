import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  FREEZE_TICKS,
  HIDDEN_ROWS,
  createAiObservation,
  createMatch,
  createPublicMatchView,
  runReplay,
  stepMatch,
  type ActivePiece,
  type Board,
  type Cell,
  type GameCommand,
  type MatchState,
  type SideId,
  type SideState,
  type TimedCommand,
} from '../../src/core/index';

function command(state: MatchState, side: SideId, gameCommand: GameCommand): TimedCommand {
  return { tick: state.tick + 1, side, command: gameCommand };
}

function patchSide(state: MatchState, side: SideId, patch: Partial<SideState>): MatchState {
  return {
    ...state,
    sides: { ...state.sides, [side]: { ...state.sides[side], ...patch } },
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

function horizontalI(serial = 90): ActivePiece {
  return { token: { serial, kind: 'I', marker: null }, x: 3, y: 2, rotation: 0 };
}

function completableRow(): Board {
  let board = createMatch({ matchSeed: 0, countdownTicks: 0 }).sides.player.board;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    if (x < 3 || x > 6) board = boardWithCell(board, x, BOARD_ROWS - 1);
  }
  return board;
}

describe('core consumer integration script', () => {
  it('replays soft-drop release and an I-piece SRS wall kick through the public barrel', () => {
    const replay = runReplay({
      version: 1,
      config: { matchSeed: 2, countdownTicks: 0 },
      endTick: 4,
      commands: [
        { tick: 1, side: 'player', command: { type: 'soft-drop', active: true } },
        { tick: 3, side: 'player', command: { type: 'soft-drop', active: false } },
      ],
    });
    expect(replay.state.sides.player.softDropActive).toBe(false);
    expect(replay.state.sides.player.softDropTicks).toBe(0);

    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      active: { token: { serial: 90, kind: 'I', marker: null }, x: -2, y: 4, rotation: 1 },
    });
    state = stepMatch(state, [command(state, 'player', { type: 'rotate-clockwise' })]).state;
    expect(state.sides.player.active).toMatchObject({ x: 0, y: 4, rotation: 2 });
  });

  it('combines normal attacks, own-queue offset, and repeated-column garbage deterministically', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: completableRow(),
      active: horizontalI(90),
      combo: 3,
      incoming: 2,
    });
    state = patchSide(state, 'opponent', {
      board: completableRow(),
      active: horizontalI(91),
      combo: 6,
    });

    const result = stepMatch(state, [
      command(state, 'player', { type: 'hard-drop' }),
      command(state, 'opponent', { type: 'hard-drop' }),
    ]);

    expect(result.events.filter(({ type }) => type === 'lines-cleared')).toEqual([
      { type: 'lines-cleared', side: 'player', amount: 1, rows: [19] },
      { type: 'lines-cleared', side: 'opponent', amount: 1, rows: [19] },
    ]);
    expect(result.events).toContainEqual({ type: 'attack-sent', side: 'opponent', amount: 5 });
    expect(result.events.filter(({ type, side }) => type === 'garbage-landed' && side === 'player'))
      .toHaveLength(5);
    expect(result.state.sides.player.garbageDrawIndex).toBe(5);
    expect(result.state.sides.player.board.cells[22 * BOARD_WIDTH + 3]).not.toBeNull();
    expect(result.state.sides.player.board.cells[23 * BOARD_WIDTH + 3]).not.toBeNull();
  });

  it('routes all three item commands and expires freeze after exactly 180 target ticks', () => {
    let state = createMatch({ matchSeed: 5, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardWithCell(state.sides.player.board, 0, HIDDEN_ROWS + 6, {
        kind: 'T',
        marker: 'row-clear',
      }),
      inventory: { rowClear: 1, freeze: 1, queueSwap: 1 },
    });

    const used = stepMatch(state, [
      command(state, 'player', { type: 'use-row-clear', row: 6 }),
      command(state, 'player', { type: 'use-queue-swap' }),
      command(state, 'player', { type: 'use-freeze' }),
    ]);
    expect(used.state.sides.player.inventory).toEqual({ rowClear: 1, freeze: 0, queueSwap: 0 });
    expect(used.events.filter(({ type }) => type === 'item-used').map(({ item }) => item))
      .toEqual(['freeze', 'row-clear', 'queue-swap']);
    expect(used.state.sides.opponent.freezeTicks).toBe(FREEZE_TICKS - 1);

    state = used.state;
    for (let elapsed = 1; elapsed < FREEZE_TICKS; elapsed += 1) {
      state = stepMatch(state, []).state;
    }
    expect(state.sides.opponent.freezeTicks).toBe(0);
    expect(state.sides.opponent.gravityTicks).toBe(0);
    state = stepMatch(state, []).state;
    expect(state.sides.opponent.gravityTicks).toBe(1);
  });

  it('finishes a mixed-source dual top-out after garbage overflow and blocked spawn', () => {
    let state = createMatch({ matchSeed: 0, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardWithCell(state.sides.player.board, 3, 0),
      active: { token: { serial: 90, kind: 'O', marker: null }, x: 6, y: 10, rotation: 0 },
      incoming: 1,
    });
    state = patchSide(state, 'opponent', {
      board: boardWithCell(state.sides.opponent.board, 4, 3),
      active: { token: { serial: 91, kind: 'O', marker: null }, x: 6, y: 10, rotation: 0 },
    });

    const result = stepMatch(state, [
      command(state, 'player', { type: 'hard-drop' }),
      command(state, 'opponent', { type: 'hard-drop' }),
    ]);

    expect(result.state.status).toBe('draw');
    expect(result.state.sides.player).toMatchObject({ phase: 'top-out', topOut: true });
    expect(result.state.sides.opponent).toMatchObject({ phase: 'top-out', topOut: true });
    expect(result.events.filter(({ type }) => type === 'top-out').map(({ side }) => side))
      .toEqual(['player', 'opponent']);
  });

  it('sanitizes renderer and AI projections at the sole consumer boundary', () => {
    let state = createMatch({ matchSeed: 77, countdownTicks: 0 });
    state = patchSide(state, 'player', {
      board: boardWithCell(state.sides.player.board, 1, 0, { kind: 'J' }),
    });

    const view = createPublicMatchView(state);
    const observation = createAiObservation(state, 'opponent');
    expect(view.sides.player.board).toHaveLength(200);
    expect(view.sides.player.board).not.toContainEqual({ kind: 'J' });
    expect(view.sides.player.next).toHaveLength(2);
    expect(observation.opponent).not.toHaveProperty('next');
    expect(observation.opponent).not.toHaveProperty('ghostY');
    expect(JSON.stringify({ view, observation })).not.toMatch(
      /matchSeed|nextSerial|garbageDrawIndex|gravityTicks|lockResets|serial/,
    );
  });
});
