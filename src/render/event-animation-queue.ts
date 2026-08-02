import type { GameEvent } from '../core/index';

export type AnimationPriority = 'critical' | 'decorative';

export interface AnimationEffect {
  readonly id: string;
  readonly priority: AnimationPriority;
  readonly event: GameEvent;
}

export interface EventAnimationQueueOptions {
  readonly maxDecorative: number;
}

export function effectsForEvents(
  events: readonly GameEvent[],
  batchId: string,
): readonly AnimationEffect[] {
  return events.flatMap((event, index) => {
    const id = `${batchId}:${index}:${event.type}`;
    const critical: AnimationEffect = { event, id, priority: 'critical' };
    if (event.type !== 'lines-cleared') return [critical];
    return [
      critical,
      { event, id: `${id}:particles`, priority: 'decorative' },
    ];
  });
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
      (count, effect) => count + Number(effect.priority === 'decorative'),
      0,
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
    return this.#effects
      .filter(({ priority }) => priority === 'decorative')
      .map(({ id }) => id);
  }

  orderedIds(): readonly string[] {
    return this.#effects
      .filter(({ priority }) => priority === 'critical')
      .map(({ id }) => id);
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
