import type { CommandFeedback } from '../app/use-match-loop';
import type { GameEvent, PublicMatchView, SideId } from '../core/index';
import {
  BATTLE_EFFECT_LIFETIMES,
  type BattleAnimationGroup,
  battleAnimationDurationMs,
} from './battle-animation-registry';

export type AnimationPriority = 'critical' | 'decorative';

export interface AnimationEffect {
  readonly id: string;
  readonly priority: AnimationPriority;
  readonly group?: BattleAnimationGroup;
  readonly side?: SideId;
  readonly event?: GameEvent;
  readonly command?: CommandFeedback;
  readonly presentationProgress?: number;
  readonly tick: number;
  readonly view: PublicMatchView;
}

export interface EventAnimationQueueOptions {
  readonly maxDecorative: number;
}

function groupForEvent(event: GameEvent): BattleAnimationGroup | null {
  if (event.type === 'piece-locked') return 'land-impact';
  if (event.type === 'lines-cleared') return 'line-clear';
  if (event.type === 'garbage-raised') return 'garbage-land';
  if (event.type === 'item-acquired') return 'item-acquire';
  return null;
}

export function animationEffectGroup(effect: AnimationEffect): BattleAnimationGroup | null {
  return effect.group ?? (effect.event === undefined ? null : groupForEvent(effect.event));
}

export function animationEffectSide(effect: AnimationEffect): SideId | null {
  return effect.side ?? effect.event?.side ?? effect.command?.side ?? null;
}

export function garbageRiseOffsetRows(
  effect: AnimationEffect,
  side: SideId,
  fallbackProgress: number,
): number {
  if (animationEffectSide(effect) !== side
    || animationEffectGroup(effect) !== 'garbage-land'
    || effect.event?.type !== 'garbage-raised') return 0;
  const amount = Math.min(20, Math.max(0, Math.trunc(effect.event.amount ?? 0)));
  const progress = Math.min(1, Math.max(
    0,
    effect.presentationProgress ?? fallbackProgress,
  ));
  return amount * (1 - progress);
}

export function effectLifetimeMs(effect: AnimationEffect): number | null {
  const group = animationEffectGroup(effect);
  if (group === null) return null;
  const lifetime = BATTLE_EFFECT_LIFETIMES[group];
  if (lifetime.kind === 'state') return null;
  return lifetime.kind === 'fixed' ? lifetime.durationMs : battleAnimationDurationMs(group);
}

export function effectsForEvents(
  events: readonly GameEvent[],
  tick: number,
  view: PublicMatchView,
): readonly AnimationEffect[] {
  const effects: AnimationEffect[] = events.flatMap((event, index) => {
    const group = groupForEvent(event);
    if (group === null) return [];
    const id = `tick-${tick}:${index}:${group}`;
    const effect: AnimationEffect = {
      event, group, id, priority: 'critical', side: event.side, tick, view,
    };
    if (event.type !== 'lines-cleared' || view.sides[event.side].combo < 2) return [effect];
    return [effect, {
      event,
      group: 'combo-pop',
      id: `${id}:combo`,
      priority: 'decorative',
      side: event.side,
      tick,
      view,
    }];
  });
  if (!effects.some(({ group }) => group === 'garbage-land')) return effects;
  return [
    ...effects.filter(({ group }) => group === 'garbage-land'),
    ...effects.filter(({ group }) => group !== 'garbage-land'),
  ];
}

export function effectsForCommandFeedback(
  feedback: readonly CommandFeedback[],
  view: PublicMatchView,
): readonly AnimationEffect[] {
  return feedback.flatMap((command) => {
    const group = command.command.type === 'move'
      ? 'move-dust'
      : command.command.type === 'rotate-clockwise' ? 'rotate-spark' : null;
    if (group === null) return [];
    return [{
      command,
      group,
      id: `command-${command.sequence}:${group}`,
      priority: 'decorative',
      side: command.side,
      tick: command.tick,
      view,
    }];
  });
}

export function stateEffectsForView(view: PublicMatchView): readonly AnimationEffect[] {
  return (['player', 'opponent'] as const).flatMap((side) => (
    view.sides[side].freezeTicks > 0 ? [{
      group: 'freeze-overlay' as const,
      id: `freeze:${side}`,
      priority: 'critical' as const,
      side,
      tick: view.tick,
      view,
    }] : []
  ));
}

export class EventAnimationQueue {
  readonly #effects: AnimationEffect[] = [];
  readonly #maxDecorative: number;

  constructor({ maxDecorative }: EventAnimationQueueOptions) {
    this.#maxDecorative = Number.isFinite(maxDecorative)
      ? Math.max(0, Math.floor(maxDecorative))
      : 0;
  }

  enqueue(effects: readonly AnimationEffect[]): void {
    let decorativeCount = this.#effects.reduce(
      (count, effect) => count + Number(effect.priority === 'decorative'), 0,
    );
    for (const effect of effects) {
      if (effect.priority === 'decorative') {
        if (decorativeCount >= this.#maxDecorative) continue;
        decorativeCount += 1;
      }
      this.#effects.push(effect);
    }
  }

  decorativeIds(): readonly string[] {
    return this.#effects.filter(({ priority }) => priority === 'decorative').map(({ id }) => id);
  }

  orderedIds(): readonly string[] {
    return this.#effects.filter(({ priority }) => priority === 'critical').map(({ id }) => id);
  }

  takeDecorative(): readonly AnimationEffect[] {
    const decorative: AnimationEffect[] = [];
    for (let index = this.#effects.length - 1; index >= 0; index -= 1) {
      const effect = this.#effects[index];
      if (effect?.priority !== 'decorative') continue;
      decorative.unshift(effect);
      this.#effects.splice(index, 1);
    }
    return decorative;
  }

  shiftCritical(): AnimationEffect | null {
    const index = this.#effects.findIndex(({ priority }) => priority === 'critical');
    if (index < 0) return null;
    return this.#effects.splice(index, 1)[0] ?? null;
  }
}
