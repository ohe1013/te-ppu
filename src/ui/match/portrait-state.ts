import type { OwlPortraitState, PortraitState } from '../../assets/index';
import type { GameEventBatch } from '../../app/use-match-loop';
import {
  BOARD_WIDTH,
  type PublicMatchView,
  type PublicSideView,
  type SideId,
} from '../../core/index';
import type { Floor } from '../../progression/index';
import type { AttackFeedbackPresentation } from './attack-feedback';

const HIT_TICKS = 25;
const ATTACK_TICKS = 18;
const FOCUS_TICKS = 18;
const SMUG_TICKS = 21;
const DANGER_ROWS = 4;

export type PortraitRole = 'hero' | 'lieutenant' | 'demon-king' | 'owl';

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
  role: PortraitRole,
  side: SideId,
): PortraitState | null {
  if (status === 'player-won') return side === 'player' ? 'win' : 'defeat';
  if (status === 'opponent-won') {
    if (side === 'player') return 'loss';
    return role === 'demon-king' || role === 'owl' ? 'idle' : 'smug';
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

  if (event.type === 'freeze-applied') {
    return {
      ...memory,
      hitUntil: Math.max(memory.hitUntil, tick + HIT_TICKS),
    };
  }
  if (event.type === 'attack-sent') {
    if (role !== 'lieutenant') return memory;
    return {
      ...memory,
      smugUntil: Math.max(memory.smugUntil, tick + ATTACK_TICKS + SMUG_TICKS),
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
    const terminal = terminalFor(batch.view.status, role, side);
    if (terminal !== null) next = { ...next, terminal };
  }
  if (lastBatchTick === null || latestView.tick > lastBatchTick) {
    next = {
      ...next,
      danger: role !== 'hero' && dangerForSide(latestView.sides[side]),
    };
  }
  if (next.terminal !== null) return next;
  const terminal = terminalFor(latestView.status, role, side);
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

export function portraitStateWithAttackFeedback(
  base: PortraitState,
  side: SideId,
  terminal: boolean,
  feedback: AttackFeedbackPresentation | null,
): PortraitState {
  if (terminal || feedback === null) return base;
  if (feedback.phase === 'launch' && feedback.source === side) return 'attack';
  if (
    (feedback.phase === 'impact' || feedback.phase === 'settle')
    && feedback.target === side
  ) return 'hit';
  return base;
}

function usableUrl(url: string | undefined): string | undefined {
  return url === undefined || url === '' ? undefined : url;
}

const OWL_PORTRAIT_SOURCE_STATE = {
  attack: 'cheer',
  cheer: 'cheer',
  defeat: 'worry',
  hit: 'worry',
  idle: 'idle',
  rage: 'worry',
  worry: 'worry',
} as const satisfies Partial<Record<PortraitState, OwlPortraitState>>;

export function mapOwlPortraitUrls(
  urls: Partial<Record<PortraitState, string>> | undefined,
): Partial<Record<PortraitState, string>> {
  const mapped = { ...urls };
  for (const [state, sourceState] of Object.entries(OWL_PORTRAIT_SOURCE_STATE) as
    [PortraitState, OwlPortraitState][]) {
    const directUrl = usableUrl(mapped[state]);
    if (directUrl !== undefined) {
      mapped[state] = directUrl;
      continue;
    }
    const sourceUrl = usableUrl(urls?.[sourceState]);
    if (sourceUrl === undefined) delete mapped[state];
    else mapped[state] = sourceUrl;
  }
  return mapped;
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
