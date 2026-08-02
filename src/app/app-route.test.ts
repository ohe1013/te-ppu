import { describe, expect, it } from 'vitest';
import { reduceRoute, type AppRoute } from './app-route';

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

  it('ignores events that are invalid for the current route', () => {
    const route: AppRoute = { name: 'tower' };
    expect(reduceRoute(route, { type: 'continue' })).toBe(route);
  });
});
