import { dropGarbageBatch, resolveAttackExchange } from './attack';
import { clearFullRows } from './board';
import {
  advanceSideTick,
  applySideCommands,
  createSideState,
  resolveLockedPiece,
  spawnNextPiece,
} from './field';
import { acquireMarkers, resolveNormalClear } from './items';
import {
  FREEZE_TICKS,
  HIDDEN_ROWS,
  BOARD_WIDTH,
  type AiObservation,
  type GameCommand,
  type GameEvent,
  type MatchConfig,
  type MatchState,
  type MatchStatus,
  type MatchStep,
  type PieceToken,
  type PublicActivePiece,
  type PublicMatchView,
  type PublicPieceToken,
  type PublicSideView,
  type SideId,
  type SideState,
  type TimedCommand,
} from './model';
import { ghostY } from './pieces';

const SIDES: readonly SideId[] = ['player', 'opponent'];

type SideCommands = Record<SideId, GameCommand[]>;
type SideFlags = Record<SideId, boolean>;

function otherSide(side: SideId): SideId {
  return side === 'player' ? 'opponent' : 'player';
}

function normalizeCountdown(value: number | undefined): number {
  if (value === undefined) return FREEZE_TICKS;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function statusFor(player: SideState, opponent: SideState): MatchStatus {
  if (player.topOut && opponent.topOut) return 'draw';
  if (player.topOut) return 'opponent-won';
  if (opponent.topOut) return 'player-won';
  return 'playing';
}

function groupCommands(
  commands: readonly TimedCommand[],
  tick: number,
): SideCommands {
  const grouped: SideCommands = { player: [], opponent: [] };
  for (const timed of commands) {
    if (timed.tick === tick) grouped[timed.side].push(timed.command);
  }
  return grouped;
}

function canUseFreeze(side: SideState, commands: readonly GameCommand[]): boolean {
  return side.phase === 'active'
    && !side.topOut
    && side.freezeTicks === 0
    && side.inventory.freeze > 0
    && commands.some(({ type }) => type === 'use-freeze');
}

function withoutFreeze(commands: readonly GameCommand[]): GameCommand[] {
  return commands.filter(({ type }) => type !== 'use-freeze');
}

function cloneToken(token: PieceToken): PublicPieceToken {
  return {
    kind: token.kind,
    marker: token.marker === null ? null : { ...token.marker },
  };
}

function cloneActive(active: SideState['active']): PublicActivePiece | null {
  if (active === null) return null;
  return {
    token: cloneToken(active.token),
    x: active.x,
    y: active.y - HIDDEN_ROWS,
    rotation: active.rotation,
  };
}

function publicSide(side: SideState): PublicSideView {
  const active = cloneActive(side.active);
  return {
    board: side.board.cells
      .slice(HIDDEN_ROWS * BOARD_WIDTH)
      .map((cell) => cell === null ? null : { ...cell }),
    active,
    ghostY: side.active === null ? null : ghostY(side.board, side.active) - HIDDEN_ROWS,
    next: [cloneToken(side.next[0]), cloneToken(side.next[1])],
    combo: side.combo,
    incoming: side.incoming,
    inventory: { ...side.inventory },
    freezeTicks: side.freezeTicks,
    phase: side.phase,
    topOut: side.topOut,
  };
}

export function createMatch(config: MatchConfig): MatchState {
  const countdownTicks = normalizeCountdown(config.countdownTicks);
  const player = createSideState(config.matchSeed);
  const opponent = createSideState(config.matchSeed);
  const countdown = countdownTicks > 0;

  return {
    tick: 0,
    matchSeed: config.matchSeed,
    countdownTicks,
    status: countdown ? 'countdown' : 'playing',
    sides: {
      player: countdown ? { ...player, phase: 'countdown' } : player,
      opponent: countdown ? { ...opponent, phase: 'countdown' } : opponent,
    },
  };
}

export function stepMatch(
  state: MatchState,
  commands: readonly TimedCommand[],
): MatchStep {
  const nextTick = state.tick + 1;

  if (state.status === 'countdown') {
    const countdownTicks = Math.max(0, state.countdownTicks - 1);
    const starts = countdownTicks === 0;
    return {
      state: {
        ...state,
        tick: nextTick,
        countdownTicks,
        status: starts ? 'playing' : 'countdown',
        sides: starts
          ? {
              player: { ...state.sides.player, phase: 'active' },
              opponent: { ...state.sides.opponent, phase: 'active' },
            }
          : state.sides,
      },
      events: [],
    };
  }

  if (state.status !== 'playing') {
    return { state: { ...state, tick: nextTick }, events: [] };
  }

  const grouped = groupCommands(commands, nextTick);
  const freezeUses: SideFlags = {
    player: canUseFreeze(state.sides.player, grouped.player),
    opponent: canUseFreeze(state.sides.opponent, grouped.opponent),
  };
  const targeted: SideFlags = {
    player: freezeUses.opponent,
    opponent: freezeUses.player,
  };
  const freezeUseEvents: GameEvent[] = [];
  const freezeApplyEvents: GameEvent[] = [];

  let sides: Record<SideId, SideState> = {
    player: state.sides.player,
    opponent: state.sides.opponent,
  };

  for (const side of SIDES) {
    if (!freezeUses[side]) continue;
    const actor = sides[side];
    sides = {
      ...sides,
      [side]: {
        ...actor,
        inventory: { ...actor.inventory, freeze: actor.inventory.freeze - 1 },
      },
    };
    freezeUseEvents.push({ type: 'item-used', side, item: 'freeze' });
  }

  for (const side of SIDES) {
    if (!targeted[side]) continue;
    sides = { ...sides, [side]: { ...sides[side], freezeTicks: FREEZE_TICKS } };
    freezeApplyEvents.push({ type: 'freeze-applied', side, item: 'freeze' });
  }

  const commandEvents: GameEvent[] = [];
  const lockEvents: GameEvent[] = [];
  const clearEvents: GameEvent[] = [];
  const outgoing: Record<SideId, number> = { player: 0, opponent: 0 };
  const readyForGarbage: SideFlags = { player: false, opponent: false };

  for (const side of SIDES) {
    let current = sides[side];
    if (current.freezeTicks > 0) {
      sides = {
        ...sides,
        [side]: { ...current, freezeTicks: current.freezeTicks - 1 },
      };
      continue;
    }

    const applied = applySideCommands(current, withoutFreeze(grouped[side]), side);
    current = applied.state;
    outgoing[side] += applied.outgoingAttack;
    commandEvents.push(...applied.events);

    current = advanceSideTick(current).state;
    if (current.phase === 'lock' && current.active !== null) {
      current = resolveLockedPiece(current).state;
      lockEvents.push({ type: 'piece-locked', side });
    }

    if (current.phase === 'clear-and-attack') {
      const cleared = clearFullRows(current.board);
      const normal = resolveNormalClear(current.combo, cleared.rows.length);
      current = {
        ...current,
        board: cleared.board,
        inventory: acquireMarkers(current.inventory, cleared.markers),
        combo: normal.combo,
        phase: 'offset',
      };
      outgoing[side] += normal.attack;
      readyForGarbage[side] = true;
      if (cleared.rows.length > 0) {
        clearEvents.push({ type: 'lines-cleared', side, amount: cleared.rows.length });
      }
      for (const item of cleared.markers) {
        clearEvents.push({ type: 'item-acquired', side, item });
      }
    }

    sides = { ...sides, [side]: current };
  }

  const exchange = resolveAttackExchange({
    playerIncoming: sides.player.incoming,
    opponentIncoming: sides.opponent.incoming,
    playerOutgoing: outgoing.player,
    opponentOutgoing: outgoing.opponent,
  });
  sides = {
    player: {
      ...sides.player,
      incoming: exchange.playerIncoming,
      phase: readyForGarbage.player ? 'garbage-drop' : sides.player.phase,
    },
    opponent: {
      ...sides.opponent,
      incoming: exchange.opponentIncoming,
      phase: readyForGarbage.opponent ? 'garbage-drop' : sides.opponent.phase,
    },
  };

  const attackEvents: GameEvent[] = [];
  if (exchange.sentToOpponent > 0) {
    attackEvents.push({ type: 'attack-sent', side: 'player', amount: exchange.sentToOpponent });
  }
  if (exchange.sentToPlayer > 0) {
    attackEvents.push({ type: 'attack-sent', side: 'opponent', amount: exchange.sentToPlayer });
  }

  const garbageEvents: GameEvent[] = [];
  const spawnEvents: GameEvent[] = [];
  for (const side of SIDES) {
    if (!readyForGarbage[side]) continue;
    let current = sides[side];
    const dropped = dropGarbageBatch(current, state.matchSeed, side);
    current = dropped.side;
    garbageEvents.push(...dropped.events);

    if (!current.topOut && current.phase === 'garbage-drop') {
      const spawned = spawnNextPiece(current, state.matchSeed).state;
      if (!current.topOut && spawned.topOut) {
        spawnEvents.push({ type: 'top-out', side });
      }
      current = spawned;
    }
    sides = { ...sides, [side]: current };
  }

  const status = statusFor(sides.player, sides.opponent);
  const matchEvents: GameEvent[] = [];
  if (status !== 'playing') {
    if (status === 'draw') {
      matchEvents.push(
        { type: 'match-ended', side: 'player' },
        { type: 'match-ended', side: 'opponent' },
      );
    } else {
      matchEvents.push({
        type: 'match-ended',
        side: status === 'player-won' ? 'player' : otherSide('player'),
      });
    }
    sides = {
      player: sides.player.topOut ? sides.player : { ...sides.player, phase: 'game-over' },
      opponent: sides.opponent.topOut ? sides.opponent : { ...sides.opponent, phase: 'game-over' },
    };
  }

  return {
    state: {
      ...state,
      tick: nextTick,
      status,
      sides,
    },
    events: [
      ...freezeUseEvents,
      ...freezeApplyEvents,
      ...commandEvents,
      ...lockEvents,
      ...clearEvents,
      ...attackEvents,
      ...garbageEvents,
      ...spawnEvents,
      ...matchEvents,
    ],
  };
}

export function createPublicMatchView(state: MatchState): PublicMatchView {
  return {
    tick: state.tick,
    status: state.status,
    sides: {
      player: publicSide(state.sides.player),
      opponent: publicSide(state.sides.opponent),
    },
  };
}

export function createAiObservation(
  state: MatchState,
  side: SideId,
): AiObservation {
  const view = createPublicMatchView(state);
  const opponent = view.sides[otherSide(side)];
  return {
    tick: view.tick,
    status: view.status,
    self: view.sides[side],
    opponent: {
      board: opponent.board,
      active: opponent.active,
      combo: opponent.combo,
      incoming: opponent.incoming,
      inventory: opponent.inventory,
      freezeTicks: opponent.freezeTicks,
      phase: opponent.phase,
      topOut: opponent.topOut,
    },
  };
}
