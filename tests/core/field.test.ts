import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../../src/core/board';
import {
  advanceSideTick,
  applySideCommands,
  createSideState,
  resolveLockedPiece,
  spawnNextPiece,
} from '../../src/core/field';
import {
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type Cell,
  type SideState,
} from '../../src/core/model';
import { cellsFor, ghostY, spawnPiece } from '../../src/core/pieces';

function activeT(x = 3, y = 2): ActivePiece {
  return { token: { serial: 0, kind: 'T', marker: null }, x, y, rotation: 0 };
}

function activeO(x = 3, y = 22): ActivePiece {
  return { token: { serial: 0, kind: 'O', marker: null }, x, y, rotation: 0 };
}

function withActive(state: SideState, active: ActivePiece, board: Board = emptyBoard()): SideState {
  return {
    ...state,
    board,
    active,
    phase: 'active',
    topOut: false,
    gravityTicks: 0,
    softDropActive: false,
    softDropTicks: 0,
    lockTicks: 0,
    lockResets: 0,
  };
}

function groundedSide(): SideState {
  return withActive(createSideState(7), activeO());
}

function boardWithCell(board: Board, x: number, y: number, cell: Cell = { kind: 'O' }): Board {
  const boardCells = [...board.cells];
  boardCells[y * BOARD_WIDTH + x] = cell;
  return { cells: boardCells };
}

describe('side creation and spawning', () => {
  it('creates an active side with three deterministic sequential tokens', () => {
    const side = createSideState(19);

    expect(side.active?.token.serial).toBe(0);
    expect(side.next.map((token) => token.serial)).toEqual([1, 2]);
    expect(side.nextSerial).toBe(3);
    expect(side.phase).toBe('active');
    expect(side.topOut).toBe(false);
  });

  it('spawns the first preview and clears every per-piece input and timing counter', () => {
    const initial = createSideState(23);
    const ready: SideState = {
      ...initial,
      active: null,
      phase: 'garbage-drop',
      softDropActive: true,
      gravityTicks: 47,
      softDropTicks: 2,
      lockTicks: 29,
      lockResets: 15,
    };

    const spawned = spawnNextPiece(ready, 23).state;

    expect(spawned.active).toEqual(spawnPiece(initial.next[0]));
    expect(spawned.next[0]).toEqual(initial.next[1]);
    expect(spawned.next[1].serial).toBe(3);
    expect(spawned).toMatchObject({
      nextSerial: 4,
      phase: 'active',
      softDropActive: false,
      gravityTicks: 0,
      softDropTicks: 0,
      lockTicks: 0,
      lockResets: 0,
    });
    expect(ready.active).toBeNull();
    expect(ready.next).toEqual(initial.next);
  });

  it('tops out without mutating the side when the next piece cannot spawn', () => {
    const initial = createSideState(29);
    const spawnCell = cellsFor(spawnPiece(initial.next[0]))[0]!;
    const blocked: SideState = {
      ...initial,
      active: null,
      board: boardWithCell(initial.board, spawnCell.x, spawnCell.y),
      phase: 'garbage-drop',
    };

    const result = spawnNextPiece(blocked, 29).state;

    expect(result).toMatchObject({ active: null, phase: 'top-out', topOut: true });
    expect(blocked).toMatchObject({ active: null, phase: 'garbage-drop', topOut: false });
    expect(blocked.next).toEqual(initial.next);
  });
});

describe('fixed-tick descent', () => {
  it('moves by gravity on advancing tick forty-eight, not tick forty-seven', () => {
    let side = withActive(createSideState(0), activeT());

    for (let tick = 0; tick < 47; tick += 1) side = advanceSideTick(side).state;
    expect(side.active?.y).toBe(2);
    expect(side.gravityTicks).toBe(47);

    side = advanceSideTick(side).state;
    expect(side.active?.y).toBe(3);
    expect(side.gravityTicks).toBe(0);
  });

  it('moves every third held soft-drop tick and release discards partial progress', () => {
    let side = withActive(createSideState(0), activeT());
    side = applySideCommands(side, [{ type: 'soft-drop', active: true }]).state;

    side = advanceSideTick(side).state;
    side = advanceSideTick(side).state;
    expect(side.active?.y).toBe(2);
    expect(side.softDropTicks).toBe(2);

    side = advanceSideTick(side).state;
    expect(side.active?.y).toBe(3);
    expect(side.softDropTicks).toBe(0);

    side = advanceSideTick(side).state;
    side = applySideCommands(side, [{ type: 'soft-drop', active: false }]).state;
    expect(side.softDropTicks).toBe(0);
    for (let tick = 0; tick < 6; tick += 1) side = advanceSideTick(side).state;
    expect(side.active?.y).toBe(3);
  });

  it('applies both scheduled descents when gravity and held soft drop are due together', () => {
    let side = withActive(createSideState(0), activeT());
    side = applySideCommands(side, [{ type: 'soft-drop', active: true }]).state;

    for (let tick = 0; tick < 48; tick += 1) side = advanceSideTick(side).state;

    expect(side.active?.y).toBe(19);
  });

  it('does not advance any counter while frozen', () => {
    const side: SideState = {
      ...withActive(createSideState(0), activeT()),
      freezeTicks: 1,
      gravityTicks: 47,
      softDropActive: true,
      softDropTicks: 2,
    };

    expect(advanceSideTick(side).state).toBe(side);
  });
});

describe('commands and locking', () => {
  it('applies successful same-side movement commands in array order', () => {
    const side = withActive(createSideState(0), activeT());

    const result = applySideCommands(side, [
      { type: 'move', dx: 1 },
      { type: 'move', dx: 1 },
      { type: 'rotate-clockwise' },
    ]).state;

    expect(result.active).toMatchObject({ x: 5, rotation: 1 });
    expect(side.active).toEqual(activeT());
  });

  it('returns the same state for blocked and non-active movement commands', () => {
    const blocked = withActive(createSideState(0), activeT(0, 2));
    const locked: SideState = { ...blocked, phase: 'lock' };

    expect(applySideCommands(blocked, [{ type: 'move', dx: -1 }]).state).toBe(blocked);
    expect(applySideCommands(locked, [{ type: 'move', dx: 1 }]).state).toBe(locked);
  });

  it('hard drops to the ghost row and enters lock immediately', () => {
    const side = withActive(createSideState(0), activeT());

    const result = applySideCommands(side, [{ type: 'hard-drop' }]);

    expect(result.locked).toBe(true);
    expect(result.state.phase).toBe('lock');
    expect(result.state.active?.y).toBe(ghostY(side.board, side.active!));
    expect(side.phase).toBe('active');
  });

  it('locks after exactly thirty grounded ticks', () => {
    let side = groundedSide();

    for (let tick = 0; tick < 29; tick += 1) side = advanceSideTick(side).state;
    expect(side.phase).toBe('active');
    expect(side.lockTicks).toBe(29);

    const result = advanceSideTick(side);
    expect(result.state.phase).toBe('lock');
    expect(result.locked).toBe(true);
  });

  it('only the first fifteen successful grounded moves and rotations reset lock delay', () => {
    let side = groundedSide();

    for (let reset = 0; reset < 15; reset += 1) {
      side = advanceSideTick(side).state;
      const command = reset % 2 === 0
        ? { type: 'rotate-clockwise' } as const
        : { type: 'move', dx: reset % 4 === 1 ? -1 : 1 } as const;
      side = applySideCommands(side, [command]).state;
      expect(side.lockTicks).toBe(0);
    }
    expect(side.lockResets).toBe(15);

    for (let tick = 0; tick < 7; tick += 1) side = advanceSideTick(side).state;
    side = applySideCommands(side, [{ type: 'move', dx: -1 }]).state;
    expect(side.lockTicks).toBe(7);
    expect(side.lockResets).toBe(15);
  });

  it('does not spend a reset or alter state for a blocked grounded command', () => {
    const groundedAtWall = withActive(createSideState(0), activeT(0, 22));
    const elapsed: SideState = { ...groundedAtWall, lockTicks: 12, lockResets: 4 };

    expect(applySideCommands(elapsed, [{ type: 'move', dx: -1 }]).state).toBe(elapsed);
  });

  it('commits a locked piece and stops at the clear-and-attack checkpoint', () => {
    const dropped = applySideCommands(
      withActive(createSideState(0), activeT()),
      [{ type: 'hard-drop' }],
    ).state;

    const resolved = resolveLockedPiece(dropped);

    expect(resolved.locked).toBe(true);
    expect(resolved.state.phase).toBe('clear-and-attack');
    expect(resolved.state.active).toBeNull();
    expect(resolved.state.board.cells.filter(Boolean)).toHaveLength(4);
    expect(dropped.board.cells.every((cell) => cell === null)).toBe(true);
  });
});
