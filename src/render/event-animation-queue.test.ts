import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type GameEvent,
} from '../core/index';
import {
  EventAnimationQueue,
  effectsForCommandFeedback,
  effectsForEvents,
  garbageRiseOffsetRows,
  type AnimationEffect,
} from './event-animation-queue';

const lineClear: GameEvent = {
  amount: 1,
  side: 'player',
  type: 'lines-cleared',
};

const queueView = createPublicMatchView(createMatch({ matchSeed: 13 }));
const garbageEvent: GameEvent = {
  amount: 3,
  holeColumns: [3, 2, 4],
  side: 'player',
  type: 'garbage-raised',
};

function effect(
  id: string,
  priority: AnimationEffect['priority'],
  event: GameEvent = lineClear,
): AnimationEffect {
  return { event, id, priority, tick: 0, view: queueView };
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
        holeColumns: [6],
        side: 'opponent',
        type: 'garbage-raised',
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
      { amount: 1, holeColumns: [6], side: 'opponent', type: 'garbage-raised' },
    ];

    const view = createPublicMatchView(createMatch({ matchSeed: 42 }));
    const effects = effectsForEvents(events, 42, view);

    expect(
      effects.filter(({ priority }) => priority === 'critical').map(({ id }) => id),
    ).toEqual([
      'tick-42:0:line-clear',
      'tick-42:1:attack-shot',
      'tick-42:2:garbage-land',
    ]);
    expect(
      effects.filter(({ priority }) => priority === 'decorative').map(({ id }) => id),
    ).toEqual([]);
    expect(effects.every((effect) => effect.tick === 42 && effect.view === view)).toBe(true);
  });

  it('maps one garbage batch to one ordered landing effect', () => {
    expect(effectsForEvents([garbageEvent], 9, queueView).map(({ group }) => group))
      .toEqual(['garbage-land']);
  });

  it.each([
    { offset: 3, progress: 0 },
    { offset: 1.5, progress: 0.5 },
    { offset: 0, progress: 1 },
  ])('moves one three-row batch together at $progress', ({ progress, offset }) => {
    expect(garbageRiseOffsetRows({
      event: garbageEvent,
      group: 'garbage-land',
      id: 'garbage-9',
      presentationProgress: progress,
      priority: 'critical',
      side: 'player',
      tick: 9,
      view: queueView,
    }, 'player', 0)).toBe(offset);
  });

  it('maps command cues and combo snapshots without inventing effects for unrelated commands', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 42 }));
    const comboView = {
      ...view,
      sides: { ...view.sides, player: { ...view.sides.player, combo: 2 } },
    };
    expect(effectsForCommandFeedback([
      { command: { type: 'move', dx: -1 }, sequence: 3, side: 'player', tick: 12 },
      { command: { type: 'rotate-clockwise' }, sequence: 4, side: 'opponent', tick: 12 },
      { command: { type: 'hard-drop' }, sequence: 5, side: 'player', tick: 12 },
    ], view).map(({ group, tick }) => ({ group, tick }))).toEqual([
      { group: 'move-dust', tick: 12 },
      { group: 'rotate-spark', tick: 12 },
    ]);
    expect(effectsForEvents([
      { amount: 2, rows: [18, 19], side: 'player', type: 'lines-cleared' },
    ], 7, comboView).map(({ group, view: snapshot }) => ({ group, snapshot }))).toEqual([
      { group: 'line-clear', snapshot: comboView },
      { group: 'combo-pop', snapshot: comboView },
    ]);
  });
});
