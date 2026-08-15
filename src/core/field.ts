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
  type SideId,
  type SideState,
} from './model';
import { makePieceToken, useQueueSwap, useRowClear } from './items';
import { ghostY, spawnPiece, tryRotateClockwise } from './pieces';

export type SideTick = {
  readonly state: SideState;
  readonly events: readonly GameEvent[];
  readonly locked: boolean;
  readonly outgoingAttack: number;
};

const EMPTY_INVENTORY: Inventory = { rowClear: 0, freeze: 0, queueSwap: 0 };
const NO_APPEARED_ITEMS: AppearedItems = {
  'row-clear': false,
  freeze: false,
  'queue-swap': false,
};

function tick(
  state: SideState,
  locked = false,
  outgoingAttack = 0,
  events: readonly GameEvent[] = [],
): SideTick {
  return { state, events, locked, outgoingAttack };
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
  const current = makePieceToken(seed, 0, { ...NO_APPEARED_ITEMS });
  const firstPreview = makePieceToken(seed, 1, current.appeared);
  const secondPreview = makePieceToken(seed, 2, firstPreview.appeared);
  return {
    board: emptyBoard(),
    active: spawnPiece(current.token),
    next: [firstPreview.token, secondPreview.token],
    nextSerial: 3,
    appeared: secondPreview.appeared,
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

function applyCommand(state: SideState, command: GameCommand, side: SideId): SideTick {
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

  if (command.type === 'use-row-clear') {
    const action = useRowClear(state, command.row, side);
    return tick(action.state, false, action.outgoingAttack, action.events);
  }

  if (command.type === 'use-queue-swap') {
    const action = useQueueSwap(state, side);
    return tick(action.state, false, action.outgoingAttack, action.events);
  }

  return tick(state);
}

export function applySideCommands(
  state: SideState,
  commands: readonly GameCommand[],
  side: SideId,
): SideTick {
  let current = tick(state);
  for (const command of commands) {
    const next = applyCommand(current.state, command, side);
    current = {
      state: next.state,
      events: [...current.events, ...next.events],
      locked: current.locked || next.locked,
      outgoingAttack: current.outgoingAttack + next.outgoingAttack,
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

  const generated = makePieceToken(seed, state.nextSerial, state.appeared);
  return tick({
    ...state,
    active,
    next: [state.next[1], generated.token],
    nextSerial: state.nextSerial + 1,
    appeared: generated.appeared,
    phase: 'active',
    topOut: false,
    ...resetCounters,
  });
}
