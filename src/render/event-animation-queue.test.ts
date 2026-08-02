import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core/index';
import {
  EventAnimationQueue,
  effectsForEvents,
  type AnimationEffect,
} from './event-animation-queue';

const lineClear: GameEvent = {
  amount: 1,
  side: 'player',
  type: 'lines-cleared',
};

function effect(
  id: string,
  priority: AnimationEffect['priority'],
  event: GameEvent = lineClear,
): AnimationEffect {
  return { event, id, priority };
}

describe('EventAnimationQueue', () => {
  it('drops excess decorative effects before ordered gameplay effects', () => {
    const queue = new EventAnimationQueue({ maxDecorative: 2 });

    queue.enqueue([
      effect('spark-1', 'decorative'),
      effect('clear-1', 'critical'),
      effect('spark-2', 'decorative'),
      effect('spark-3', 'decorative'),
      effect('attack-1', 'critical', {
        amount: 2,
        side: 'player',
        type: 'attack-sent',
      }),
      effect('garbage-1', 'critical', {
        amount: 1,
        side: 'opponent',
        type: 'garbage-landed',
      }),
    ]);

    expect(queue.decorativeIds()).toEqual(['spark-1', 'spark-2']);
    expect(queue.orderedIds()).toEqual(['clear-1', 'attack-1', 'garbage-1']);
    expect(queue.takeDecorative().map(({ id }) => id)).toEqual(['spark-1', 'spark-2']);
    expect(queue.decorativeIds()).toEqual([]);
  });

  it('dequeues critical effects in their original order', () => {
    const queue = new EventAnimationQueue({ maxDecorative: 0 });
    queue.enqueue([
      effect('clear-1', 'critical'),
      effect('attack-1', 'critical'),
      effect('garbage-1', 'critical'),
    ]);

    expect(queue.shiftCritical()?.id).toBe('clear-1');
    expect(queue.shiftCritical()?.id).toBe('attack-1');
    expect(queue.shiftCritical()?.id).toBe('garbage-1');
    expect(queue.shiftCritical()).toBeNull();
  });

  it('creates one ordered critical cue per core event plus optional decoration', () => {
    const events: readonly GameEvent[] = [
      lineClear,
      { amount: 2, side: 'player', type: 'attack-sent' },
      { amount: 1, side: 'opponent', type: 'garbage-landed' },
    ];

    const effects = effectsForEvents(events, 'tick-42');

    expect(
      effects.filter(({ priority }) => priority === 'critical').map(({ id }) => id),
    ).toEqual([
      'tick-42:0:lines-cleared',
      'tick-42:1:attack-sent',
      'tick-42:2:garbage-landed',
    ]);
    expect(
      effects.filter(({ priority }) => priority === 'decorative').map(({ id }) => id),
    ).toEqual(['tick-42:0:lines-cleared:particles']);
  });
});
