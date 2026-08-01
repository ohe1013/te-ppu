import { createMatch, stepMatch } from './match';
import type {
  ActivePiece,
  Cell,
  GameEvent,
  MatchConfig,
  MatchState,
  PieceToken,
  SideState,
  TimedCommand,
} from './model';

export type ReplayV1 = {
  readonly version: 1;
  readonly config: MatchConfig;
  readonly endTick: number;
  readonly commands: readonly TimedCommand[];
};

export type ReplayResult = {
  readonly state: MatchState;
  readonly events: readonly GameEvent[];
  readonly hash: string;
};

function projectCell(cell: Cell | null): readonly unknown[] | null {
  return cell === null ? null : [cell.kind, cell.marker ?? null];
}

function projectToken(token: PieceToken): readonly unknown[] {
  return [
    token.serial,
    token.kind,
    token.marker === null ? null : [token.marker.item, token.marker.minoIndex],
  ];
}

function projectActive(active: ActivePiece | null): readonly unknown[] | null {
  return active === null
    ? null
    : [projectToken(active.token), active.x, active.y, active.rotation];
}

function projectSide(side: SideState): readonly unknown[] {
  return [
    side.board.cells.map(projectCell),
    projectActive(side.active),
    [projectToken(side.next[0]), projectToken(side.next[1])],
    side.nextSerial,
    [side.appeared['row-clear'], side.appeared.freeze, side.appeared['queue-swap']],
    [side.inventory.rowClear, side.inventory.freeze, side.inventory.queueSwap],
    side.combo,
    side.incoming,
    side.garbageDrawIndex,
    side.freezeTicks,
    side.phase,
    side.topOut,
    side.gravityTicks,
    side.softDropActive,
    side.softDropTicks,
    side.lockTicks,
    side.lockResets,
  ];
}

function authoritativeProjection(state: MatchState): readonly unknown[] {
  return [
    state.tick,
    state.matchSeed,
    state.countdownTicks,
    state.status,
    projectSide(state.sides.player),
    projectSide(state.sides.opponent),
  ];
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashMatchState(state: MatchState): string {
  const json = JSON.stringify(authoritativeProjection(state));
  return fnv1a32(json).toString(16).padStart(8, '0');
}

export function runReplay(replay: ReplayV1): ReplayResult {
  if ((replay as { readonly version: number }).version !== 1) {
    throw new RangeError('replay version must be 1');
  }
  if (!Number.isInteger(replay.endTick) || replay.endTick < 0) {
    throw new RangeError('replay endTick must be a nonnegative integer');
  }

  const commandsByTick = new Map<number, TimedCommand[]>();
  for (const timed of replay.commands) {
    const atTick = commandsByTick.get(timed.tick);
    if (atTick === undefined) commandsByTick.set(timed.tick, [timed]);
    else atTick.push(timed);
  }

  let state = createMatch(replay.config);
  const events: GameEvent[] = [];
  while (state.tick < replay.endTick) {
    const step = stepMatch(state, commandsByTick.get(state.tick + 1) ?? []);
    state = step.state;
    events.push(...step.events);
  }

  return { state, events, hash: hashMatchState(state) };
}
