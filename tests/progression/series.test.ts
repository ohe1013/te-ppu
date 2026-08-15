import { describe, expect, it } from 'vitest';
import { resolveEncounter, startFloorSeries } from '../../src/progression/series';

describe('three-encounter series', () => {
  it('requires three wins before resolving a floor win', () => {
    const first = startFloorSeries(2);
    const second = resolveEncounter(first, 'WIN');
    const third = second.kind === 'next-encounter'
      ? resolveEncounter(second.series, 'WIN')
      : second;
    const final = third.kind === 'next-encounter'
      ? resolveEncounter(third.series, 'WIN')
      : third;

    expect(second).toMatchObject({
      kind: 'next-encounter',
      series: { wins: 1, encounterIndex: 1 },
    });
    expect(third).toMatchObject({
      kind: 'next-encounter',
      series: { wins: 2, encounterIndex: 2 },
    });
    expect(final).toEqual({ kind: 'floor-win', floor: 2 });
  });

  it.each(['LOSS', 'DRAW'] as const)('resets the series on %s', (result) => {
    expect(resolveEncounter({ floor: 2, encounterIndex: 1, wins: 1 }, result))
      .toEqual({ kind: 'series-loss', floor: 2 });
  });

  it('rejects a corrupted series instead of silently unlocking', () => {
    expect(() => resolveEncounter({ floor: 2, encounterIndex: 0, wins: 1 }, 'WIN'))
      .toThrowError(new RangeError('Invalid floor series.'));
  });
});
