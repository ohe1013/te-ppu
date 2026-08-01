import { canPlace, emptyBoard, lockPiece } from './board';
import {
  GRAVITY_TICKS,
  LOCK_DELAY_TICKS,
  MAX_LOCK_RESETS,
  SOFT_DROP_TICKS,
  type ActivePiece,
  type AppearedItems,
  type GameCommand,
  type GameEvent,
  type Inventory,
  type PieceToken,
  type SideState,
} from './model';
import { ghostY, pieceKindAt, spawnPiece, tryRotateClockwise } from './pieces';

export type SideTick = {
  readonly state: SideState;
  readonly events: readonly GameEvent[];
  readonly locked: boolean;
};

const EMPTY_INVENTORY: Inventory = { rowClear: 0, freeze: 0, queueSwap: 0 };
const NO_APPEARED_ITEMS: AppearedItems = {
  'row-clear': false,
  freeze: false,
  'queue-swap': false,
};

function pieceTokenAt(seed: number, serial: number): PieceToken {
  return { serial, kind: pieceKindAt(seed, serial), marker: null };
}

function tick(state: SideState, locked = false): SideTick {
  return { state, events: [], locked };
}

function grounded(state: SideState, active: ActivePiece): boolean {
  return !canPlace(state.board, { ...active, y: active.y + 1 });
}

function resetLockAfterGroundedAction(
  state: SideState,
  active: ActivePiece,
  wasGrounded: boolean,
): Pick<SideState, 'active' | 'lockTicks' | 'lockResets'> {
  if (!wasGrounded || state.lockResets >= MAX_LOCK_RESETS) {
    return { active, lockTicks: state.lockTicks, lockResets: state.lockResets };
  }
  return { active, lockTicks: 0, lockResets: state.lockResets + 1 };
}

export function createSideState(seed: number): SideState {
  const current = pieceTokenAt(seed, 0);
  return {
    board: emptyBoard(),
    active: spawnPiece(current),
    next: [pieceTokenAt(seed, 1), pieceTokenAt(seed, 2)],
    nextSerial: 3,
    appeared: { ...NO_APPEARED_ITEMS },
    inventory: { ...EMPTY_INVENTORY },
    combo: 0,
    incoming: 0,
    garbageDrawIndex: 0,
    freezeTicks: 0,
    phase: 'active',
    topOut: false,
    gravityTicks: 0,
    softDropActive: false,
    softDropTicks: 0,
    lockTicks: 0,
    lockResets: 0,
  };
}

function applyCommand(state: SideState, command: GameCommand): SideTick {
  if (state.phase !== 'active' || state.active === null) return tick(state);

  if (command.type === 'soft-drop') {
    if (state.softDropActive === command.active && (command.active || state.softDropTicks === 0)) {
      return tick(state);
    }
    return tick({
      ...state,
      softDropActive: command.active,
      softDropTicks: command.active ? state.softDropTicks : 0,
    });
  }

  if (command.type === 'move') {
    const moved: ActivePiece = { ...state.active, x: state.active.x + command.dx };
    if (!canPlace(state.board, moved)) return tick(state);
    return tick({
      ...state,
      ...resetLockAfterGroundedAction(state, moved, grounded(state, state.active)),
    });
  }

  if (command.type === 'rotate-clockwise') {
    const rotated = tryRotateClockwise(state.board, state.active);
    if (rotated === state.active) return tick(state);
    return tick({
      ...state,
      ...resetLockAfterGroundedAction(state, rotated, grounded(state, state.active)),
    });
  }

  if (command.type === 'hard-drop') {
    return tick({
      ...state,
      active: { ...state.active, y: ghostY(state.board, state.active) },
      phase: 'lock',
    }, true);
  }

  return tick(state);
}

export function applySideCommands(
  state: SideState,
  commands: readonly GameCommand[],
): SideTick {
  let current = tick(state);
  for (const command of commands) {
    const next = applyCommand(current.state, command);
    current = {
      state: next.state,
      events: [...current.events, ...next.events],
      locked: current.locked || next.locked,
    };
  }
  return current;
}

export function advanceSideTick(state: SideState): SideTick {
  if (state.phase !== 'active' || state.active === null || state.freezeTicks > 0) {
    return tick(state);
  }

  const wasGrounded = grounded(state, state.active);
  const lockTicks = wasGrounded ? state.lockTicks + 1 : state.lockTicks;
  const gravityTicks = state.gravityTicks + 1;
  const softDropTicks = state.softDropActive ? state.softDropTicks + 1 : 0;
  const gravityDue = gravityTicks >= GRAVITY_TICKS;
  const softDropDue = state.softDropActive && softDropTicks >= SOFT_DROP_TICKS;

  if (lockTicks >= LOCK_DELAY_TICKS) {
    return tick({
      ...state,
      gravityTicks: gravityDue ? 0 : gravityTicks,
      softDropTicks: softDropDue ? 0 : softDropTicks,
      lockTicks,
      phase: 'lock',
    }, true);
  }

  let active = state.active;
  if (gravityDue) {
    const descended: ActivePiece = { ...active, y: active.y + 1 };
    if (canPlace(state.board, descended)) active = descended;
  }
  if (softDropDue) {
    const descended: ActivePiece = { ...active, y: active.y + 1 };
    if (canPlace(state.board, descended)) active = descended;
  }

  return tick({
    ...state,
    active,
    gravityTicks: gravityDue ? 0 : gravityTicks,
    softDropTicks: softDropDue ? 0 : softDropTicks,
    lockTicks,
  });
}

export function resolveLockedPiece(state: SideState): SideTick {
  if (state.phase !== 'lock' || state.active === null) return tick(state);
  return tick({
    ...state,
    board: lockPiece(state.board, state.active),
    active: null,
    phase: 'clear-and-attack',
  }, true);
}

export function spawnNextPiece(state: SideState, seed: number): SideTick {
  if (state.phase !== 'garbage-drop' || state.active !== null || state.topOut) return tick(state);

  const active = spawnPiece(state.next[0]);
  const resetCounters = {
    gravityTicks: 0,
    softDropActive: false,
    softDropTicks: 0,
    lockTicks: 0,
    lockResets: 0,
  } as const;

  if (!canPlace(state.board, active)) {
    return tick({
      ...state,
      active: null,
      phase: 'top-out',
      topOut: true,
      ...resetCounters,
    });
  }

  return tick({
    ...state,
    active,
    next: [state.next[1], pieceTokenAt(seed, state.nextSerial)],
    nextSerial: state.nextSerial + 1,
    phase: 'active',
    topOut: false,
    ...resetCounters,
  });
}
