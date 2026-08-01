import { cellsFor } from './pieces';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  type ItemType,
  type MatchState,
  type MatchStatus,
  type PieceKind,
  type PieceToken,
  type SideId,
  type SidePhase,
  type SideState,
} from './model';

const SIDES: readonly SideId[] = ['player', 'opponent'];
const PIECE_KINDS: readonly PieceKind[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
const ITEM_TYPES: readonly ItemType[] = ['row-clear', 'freeze', 'queue-swap'];
const SIDE_PHASES: readonly SidePhase[] = [
  'countdown',
  'active',
  'lock',
  'clear-and-attack',
  'offset',
  'garbage-drop',
  'top-out',
  'game-over',
];
const MATCH_STATUSES: readonly MatchStatus[] = [
  'countdown',
  'playing',
  'player-won',
  'opponent-won',
  'draw',
];

export class CoreInvariantError extends Error {
  readonly tick: number;
  readonly seed: number;
  readonly reason: string;

  constructor(tick: number, seed: number, reason: string) {
    super(`core invariant failed at tick ${tick}, seed ${seed}: ${reason}`);
    this.name = 'CoreInvariantError';
    this.tick = tick;
    this.seed = seed;
    this.reason = reason;
  }
}

function fail(state: MatchState, reason: string): never {
  throw new CoreInvariantError(state.tick, state.matchSeed, reason);
}

function isNonnegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function assertCount(state: MatchState, side: SideId, name: string, value: number): void {
  if (!isNonnegativeInteger(value)) {
    fail(state, `${side} ${name} must be a nonnegative integer`);
  }
}

function assertToken(
  state: MatchState,
  side: SideId,
  label: string,
  token: PieceToken,
): void {
  assertCount(state, side, `${label}.serial`, token.serial);
  if (!PIECE_KINDS.includes(token.kind)) fail(state, `${side} ${label}.kind is invalid`);
  if (token.marker === null) return;
  if (!ITEM_TYPES.includes(token.marker.item)) {
    fail(state, `${side} ${label}.marker item is invalid`);
  }
  if (!Number.isInteger(token.marker.minoIndex)
    || token.marker.minoIndex < 0
    || token.marker.minoIndex > 3) {
    fail(state, `${side} ${label}.marker minoIndex must be an integer from 0 to 3`);
  }
}

function assertBoard(state: MatchState, side: SideId, value: SideState): void {
  if (value.board.cells.length !== BOARD_WIDTH * BOARD_ROWS) {
    fail(
      state,
      `${side} board dimensions must be ${BOARD_WIDTH}x${BOARD_ROWS}; got ${value.board.cells.length} cells`,
    );
  }

  for (let index = 0; index < value.board.cells.length; index += 1) {
    const cell = value.board.cells[index];
    if (cell === null) continue;
    if (cell === undefined || !PIECE_KINDS.includes(cell.kind)) {
      fail(state, `${side} board cell ${index} has an invalid piece kind`);
    }
    if (cell.marker !== undefined && !ITEM_TYPES.includes(cell.marker)) {
      fail(state, `${side} board cell ${index} has an invalid item marker`);
    }
  }
}

function assertActive(state: MatchState, side: SideId, value: SideState): void {
  if (value.active === null) return;
  assertToken(state, side, 'active token', value.active.token);
  if (!Number.isInteger(value.active.x)
    || !Number.isInteger(value.active.y)
    || !Number.isInteger(value.active.rotation)
    || value.active.rotation < 0
    || value.active.rotation > 3) {
    fail(state, `${side} active coordinates and rotation must be integers`);
  }

  for (const cell of cellsFor(value.active)) {
    if (cell.x < 0 || cell.x >= BOARD_WIDTH || cell.y < 0 || cell.y >= BOARD_ROWS) {
      fail(state, `${side} active cell (${cell.x},${cell.y}) is outside board bounds`);
    }
    if (value.board.cells[cell.y * BOARD_WIDTH + cell.x] !== null) {
      fail(state, `${side} active cell (${cell.x},${cell.y}) overlaps the board`);
    }
  }
}

function assertSide(state: MatchState, side: SideId, value: SideState): void {
  assertBoard(state, side, value);
  assertActive(state, side, value);

  if (value.next.length !== 2) fail(state, `${side} queue length must be exactly 2`);
  assertToken(state, side, 'queue[0]', value.next[0]);
  assertToken(state, side, 'queue[1]', value.next[1]);
  assertCount(state, side, 'nextSerial', value.nextSerial);

  for (const item of ITEM_TYPES) {
    if (typeof value.appeared[item] !== 'boolean') {
      fail(state, `${side} appeared.${item} must be boolean`);
    }
  }
  assertCount(state, side, 'inventory.rowClear', value.inventory.rowClear);
  assertCount(state, side, 'inventory.freeze', value.inventory.freeze);
  assertCount(state, side, 'inventory.queueSwap', value.inventory.queueSwap);
  assertCount(state, side, 'combo', value.combo);
  assertCount(state, side, 'incoming', value.incoming);
  assertCount(state, side, 'garbageDrawIndex', value.garbageDrawIndex);
  assertCount(state, side, 'freezeTicks', value.freezeTicks);
  assertCount(state, side, 'gravityTicks', value.gravityTicks);
  assertCount(state, side, 'softDropTicks', value.softDropTicks);
  assertCount(state, side, 'lockTicks', value.lockTicks);
  assertCount(state, side, 'lockResets', value.lockResets);
  if (typeof value.softDropActive !== 'boolean') {
    fail(state, `${side} softDropActive must be boolean`);
  }
  if (typeof value.topOut !== 'boolean') fail(state, `${side} topOut must be boolean`);
  if (!SIDE_PHASES.includes(value.phase)) fail(state, `${side} phase is invalid: ${value.phase}`);

  if (value.topOut !== (value.phase === 'top-out')) {
    fail(state, `${side} phase/topOut consistency is invalid`);
  }
  if (value.phase === 'top-out' && value.active !== null) {
    fail(state, `${side} top-out phase cannot retain an active piece`);
  }
  if (['clear-and-attack', 'offset', 'garbage-drop'].includes(value.phase)
    && value.active !== null) {
    fail(state, `${side} ${value.phase} phase cannot retain an active piece`);
  }
  if (['countdown', 'active', 'lock'].includes(value.phase) && value.active === null) {
    fail(state, `${side} ${value.phase} phase requires an active piece`);
  }
}

function assertTerminalConsistency(state: MatchState): void {
  const player = state.sides.player;
  const opponent = state.sides.opponent;

  if (state.status === 'countdown') {
    if (state.countdownTicks <= 0) fail(state, 'countdown status requires a positive countdown timer');
    if (player.phase !== 'countdown' || opponent.phase !== 'countdown') {
      fail(state, 'countdown status requires both sides in countdown phase');
    }
    if (player.topOut || opponent.topOut) fail(state, 'countdown status cannot contain topOut flags');
    return;
  }

  if (state.status === 'playing') {
    if (state.countdownTicks !== 0) fail(state, 'playing status requires countdownTicks to be zero');
    if (player.topOut || opponent.topOut) fail(state, 'playing status cannot contain topOut flags');
    if (player.phase === 'countdown' || opponent.phase === 'countdown'
      || player.phase === 'game-over' || opponent.phase === 'game-over') {
      fail(state, 'playing status contains a terminal or countdown phase');
    }
    return;
  }

  if (state.countdownTicks !== 0) fail(state, 'terminal status requires countdownTicks to be zero');
  if (state.status === 'draw') {
    if (!player.topOut || !opponent.topOut) {
      fail(state, 'terminal draw requires both topOut flags');
    }
    return;
  }

  const playerWon = state.status === 'player-won';
  const winner = playerWon ? player : opponent;
  const loser = playerWon ? opponent : player;
  if (winner.topOut || !loser.topOut) {
    fail(state, `terminal ${state.status} has inconsistent topOut flags`);
  }
  if (winner.phase !== 'game-over' || loser.phase !== 'top-out') {
    fail(state, `terminal ${state.status} has inconsistent side phases`);
  }
}

export function assertMatchInvariants(state: MatchState): void {
  if (!isNonnegativeInteger(state.tick)) fail(state, 'match tick must be a nonnegative integer');
  if (!isNonnegativeInteger(state.countdownTicks)) {
    fail(state, 'match countdownTicks must be a nonnegative integer');
  }
  if (!MATCH_STATUSES.includes(state.status)) fail(state, `match status is invalid: ${state.status}`);

  for (const side of SIDES) assertSide(state, side, state.sides[side]);
  assertTerminalConsistency(state);
}
