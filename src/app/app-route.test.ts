import { describe, expect, it } from 'vitest';
import {
  reduceRoute,
  type AppRoute,
  type AppRouteEvent,
} from './app-route';

const invalidEventCases: ReadonlyArray<readonly [
  string,
  AppRoute,
  readonly AppRouteEvent[],
]> = [
  ['boot', { name: 'boot' }, [
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['tower', { name: 'tower' }, [
    { type: 'boot-ready' },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['floor intro', { name: 'floor-intro', floor: 2 }, [
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
  ]],
  ['match', { name: 'match', floor: 2, seed: 3 }, [
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
  ]],
  ['result', { name: 'result', floor: 2, result: 'loss' }, [
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
  ]],
  ['ending', { name: 'ending' }, [
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
  ]],
];

describe('reduceRoute', () => {
  it('moves through boot, floor selection, match start, and result', () => {
    const tower = reduceRoute({ name: 'boot' }, { type: 'boot-ready' });
    const intro = reduceRoute(tower, { type: 'select-floor', floor: 2 });
    const match = reduceRoute(intro, { type: 'start-match', seed: 73 });
    const result = reduceRoute(match, { type: 'match-finished', result: 'loss' });

    expect(tower).toEqual({ name: 'tower' });
    expect(intro).toEqual({ name: 'floor-intro', floor: 2 });
    expect(match).toEqual({ name: 'match', floor: 2, seed: 73 });
    expect(result).toEqual({ name: 'result', floor: 2, result: 'loss' });
  });

  it('retries the same floor with a fresh seed', () => {
    expect(reduceRoute(
      { name: 'result', floor: 2, result: 'loss' },
      { type: 'retry', seed: 91 },
    )).toEqual({ name: 'match', floor: 2, seed: 91 });
  });

  it.each(['loss', 'draw'] as const)('returns to the tower after a floor-two %s', (result) => {
    expect(reduceRoute(
      { name: 'result', floor: 2, result },
      { type: 'continue' },
    )).toEqual({ name: 'tower' });
  });

  it('ends only after continuing from a floor-three victory', () => {
    expect(reduceRoute(
      { name: 'result', floor: 3, result: 'win' },
      { type: 'continue' },
    )).toEqual({ name: 'ending' });
    expect(reduceRoute(
      { name: 'result', floor: 2, result: 'win' },
      { type: 'continue' },
    )).toEqual({ name: 'tower' });
  });

  it('returns to the tower from non-boot routes', () => {
    expect(reduceRoute(
      { name: 'ending' },
      { type: 'return-to-tower' },
    )).toEqual({ name: 'tower' });
  });

  it.each(invalidEventCases)(
    'keeps the %s route referentially stable for every invalid event',
    (_name, route, events) => {
      for (const event of events) expect(reduceRoute(route, event)).toBe(route);
    },
  );
});
