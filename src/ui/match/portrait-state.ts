import type { PortraitState } from '../../assets/index';
import type { GameEventBatch } from '../../app/use-match-loop';
import {
  BOARD_WIDTH,
  type PublicMatchView,
  type PublicSideView,
  type SideId,
} from '../../core/index';
import type { Floor } from '../../progression/index';

const HIT_TICKS = 25;
const ATTACK_TICKS = 18;
const FOCUS_TICKS = 18;
const SMUG_TICKS = 21;
const DANGER_ROWS = 4;

export type PortraitRole = 'hero' | 'lieutenant' | 'demon-king';

export interface PortraitPresentation {
  readonly state: PortraitState;
  readonly url?: string;
  readonly alt: string;
}

export interface PortraitMemory {
  readonly hitUntil: number;
  readonly attackUntil: number;
  readonly focusUntil: number;
  readonly smugUntil: number;
  readonly danger: boolean;
  readonly terminal: PortraitState | null;
}

export interface ResolvePortraitStateInput {
  readonly tick: number;
  readonly hitUntil: number;
  readonly attackUntil: number;
  readonly focusUntil?: number;
  readonly smugUntil?: number;
  readonly danger: boolean;
  readonly dangerState?: 'panic' | 'rage';
  readonly terminal: PortraitState | null;
}

export interface ReducePortraitBatchesInput {
  readonly batches: readonly GameEventBatch[];
  readonly floor: Floor;
  readonly latestView: PublicMatchView;
  readonly role: PortraitRole;
  readonly side: SideId;
}

export function createPortraitMemory(): PortraitMemory {
  return {
    attackUntil: 0,
    danger: false,
    focusUntil: 0,
    hitUntil: 0,
    smugUntil: 0,
    terminal: null,
  };
}

export function dangerForSide(side: PublicSideView): boolean {
  return side.incoming >= 4
    || side.board
      .slice(0, DANGER_ROWS * BOARD_WIDTH)
      .some((cell) => cell !== null);
}

function terminalFor(
  status: PublicMatchView['status'],
  floor: Floor,
  side: SideId,
): PortraitState | null {
  if (status === 'player-won') return side === 'player' ? 'win' : 'defeat';
  if (status === 'opponent-won') {
    if (side === 'player') return 'loss';
    return floor === 5 ? 'idle' : 'smug';
  }
  if (status === 'draw') return 'idle';
  return null;
}

function batchesInTickOrder(
  batches: readonly GameEventBatch[],
): readonly GameEventBatch[] {
  return batches
    .map((batch, index) => ({ batch, index }))
    .sort((left, right) => left.batch.tick - right.batch.tick || left.index - right.index)
    .map(({ batch }) => batch);
}

function applyEvent(
  memory: PortraitMemory,
  event: GameEventBatch['events'][number],
  tick: number,
  view: PublicMatchView,
  role: PortraitRole,
  side: SideId,
): PortraitMemory {
  if (event.side !== side) return memory;

  if (event.type === 'garbage-landed' || event.type === 'freeze-applied') {
    return {
      ...memory,
      hitUntil: Math.max(memory.hitUntil, tick + HIT_TICKS),
    };
  }
  if (event.type === 'attack-sent') {
    const attackUntil = Math.max(memory.attackUntil, tick + ATTACK_TICKS);
    return {
      ...memory,
      attackUntil,
      smugUntil: role === 'lieutenant'
        ? Math.max(memory.smugUntil, attackUntil + SMUG_TICKS)
        : memory.smugUntil,
    };
  }
  if (event.type === 'item-used') {
    return {
      ...memory,
      attackUntil: Math.max(memory.attackUntil, tick + ATTACK_TICKS),
    };
  }
  if (
    event.type === 'lines-cleared'
    && role === 'hero'
    && view.sides[side].combo >= 2
  ) {
    return {
      ...memory,
      focusUntil: Math.max(memory.focusUntil, tick + FOCUS_TICKS),
    };
  }
  return memory;
}

export function reducePortraitBatches(
  memory: PortraitMemory,
  {
    batches,
    floor,
    latestView,
    role,
    side,
  }: ReducePortraitBatchesInput,
): PortraitMemory {
  let next = memory;
  let lastBatchTick: number | null = null;
  for (const batch of batchesInTickOrder(batches)) {
    if (next.terminal !== null) break;
    for (const event of batch.events) {
      next = applyEvent(next, event, batch.tick, batch.view, role, side);
    }
    next = {
      ...next,
      danger: role !== 'hero' && dangerForSide(batch.view.sides[side]),
    };
    lastBatchTick = batch.tick;
    const terminal = terminalFor(batch.view.status, floor, side);
    if (terminal !== null) next = { ...next, terminal };
  }
  if (lastBatchTick === null || latestView.tick > lastBatchTick) {
    next = {
      ...next,
      danger: role !== 'hero' && dangerForSide(latestView.sides[side]),
    };
  }
  if (next.terminal !== null) return next;
  const terminal = terminalFor(latestView.status, floor, side);
  return terminal === null ? next : { ...next, terminal };
}

export function resolvePortraitState({
  attackUntil,
  danger,
  dangerState = 'panic',
  focusUntil = 0,
  hitUntil,
  smugUntil = 0,
  terminal,
  tick,
}: ResolvePortraitStateInput): PortraitState {
  if (terminal !== null) return terminal;
  if (tick < hitUntil) return 'hit';
  if (tick < attackUntil) return 'attack';
  if (danger) return dangerState;
  if (tick < focusUntil) return 'focus';
  if (tick < smugUntil) return 'smug';
  return 'idle';
}

function usableUrl(url: string | undefined): string | undefined {
  return url === undefined || url === '' ? undefined : url;
}

export function createPortraitPresentation(
  state: PortraitState,
  urls: Partial<Record<PortraitState, string>> | undefined,
  label: string,
): PortraitPresentation {
  const url = usableUrl(urls?.[state]) ?? usableUrl(urls?.idle);
  const presentation = {
    alt: `${label} ${state} portrait`,
    state,
  } satisfies Omit<PortraitPresentation, 'url'>;
  return url === undefined ? presentation : { ...presentation, url };
}
