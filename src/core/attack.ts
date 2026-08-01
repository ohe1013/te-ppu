import { dropGarbageCell } from './board';
import { BOARD_WIDTH, type GameEvent, type SideId, type SideState } from './model';
import { randomInt, RandomStream } from './random';

export type AttackExchangeInput = {
  readonly playerIncoming: number;
  readonly opponentIncoming: number;
  readonly playerOutgoing: number;
  readonly opponentOutgoing: number;
};

export type AttackExchangeResult = {
  readonly playerIncoming: number;
  readonly opponentIncoming: number;
  readonly playerOffset: number;
  readonly opponentOffset: number;
  readonly sentToPlayer: number;
  readonly sentToOpponent: number;
};

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function resolveAttackExchange(input: AttackExchangeInput): AttackExchangeResult {
  const playerIncoming = count(input.playerIncoming);
  const opponentIncoming = count(input.opponentIncoming);
  const playerOutgoing = count(input.playerOutgoing);
  const opponentOutgoing = count(input.opponentOutgoing);
  const playerOffset = Math.min(playerIncoming, playerOutgoing);
  const opponentOffset = Math.min(opponentIncoming, opponentOutgoing);
  const playerExcess = playerOutgoing - playerOffset;
  const opponentExcess = opponentOutgoing - opponentOffset;
  const sentToOpponent = Math.max(0, playerExcess - opponentExcess);
  const sentToPlayer = Math.max(0, opponentExcess - playerExcess);

  return {
    playerIncoming: playerIncoming - playerOffset + sentToPlayer,
    opponentIncoming: opponentIncoming - opponentOffset + sentToOpponent,
    playerOffset,
    opponentOffset,
    sentToPlayer,
    sentToOpponent,
  };
}

function streamFor(recipient: SideId): RandomStream {
  return recipient === 'player'
    ? RandomStream.GARBAGE_TO_PLAYER
    : RandomStream.GARBAGE_TO_OPPONENT;
}

export function dropGarbageBatch(
  side: SideState,
  seed: number,
  recipient: SideId = 'player',
): { readonly side: SideState; readonly events: readonly GameEvent[] } {
  let board = side.board;
  let drawIndex = side.garbageDrawIndex;
  const events: GameEvent[] = [];

  for (let remaining = count(side.incoming); remaining > 0; remaining -= 1) {
    const column = randomInt(seed, streamFor(recipient), drawIndex, BOARD_WIDTH);
    drawIndex += 1;
    const dropped = dropGarbageCell(board, column);
    if (dropped.topOut) {
      return {
        side: {
          ...side,
          board: dropped.board,
          incoming: 0,
          garbageDrawIndex: drawIndex,
          phase: 'top-out',
          topOut: true,
        },
        events: [...events, { type: 'top-out', side: recipient }],
      };
    }

    board = dropped.board;
    events.push({ type: 'garbage-landed', side: recipient, amount: 1 });
  }

  return {
    side: { ...side, board, incoming: 0, garbageDrawIndex: drawIndex },
    events,
  };
}
