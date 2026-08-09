import { describe, expect, it } from 'vitest';
import { FLOORS, getFloorEncounter, getFloorEncounters } from '../../src/progression';

describe('floor encounter catalog', () => {
  it('contains three ordered encounters for every floor', () => {
    for (const floor of FLOORS) {
      const encounters = getFloorEncounters(floor);

      expect(encounters).toHaveLength(3);
      expect(encounters.map(({ index }) => index)).toEqual([0, 1, 2]);
      expect(new Set(encounters.map(({ characterId }) => characterId)).size).toBe(3);
      expect(encounters.every(({ floor: entryFloor }) => entryFloor === floor)).toBe(true);
    }
  });

  it('puts the demon king at the third encounter of the final floor', () => {
    expect(getFloorEncounter(5, 2)).toMatchObject({
      characterId: 'demon-king',
      displayName: '탑의 마왕 녹스',
    });
  });

  it('returns a stable encounter object with story copy', () => {
    const encounter = getFloorEncounter(1, 0);

    expect(encounter).toMatchObject({
      floor: 1,
      index: 0,
      characterId: 'quartermaster',
      displayName: '기어 창고장',
    });
    expect(encounter.title).toBeTruthy();
    expect(encounter.intro).toBeTruthy();
    expect(encounter.winLine).toBeTruthy();
    expect(encounter.lossLine).toBeTruthy();
  });

  it('rejects an encounter index outside the three slots', () => {
    expect(() => getFloorEncounter(1, 3 as never)).toThrowError(
      new RangeError('Invalid floor encounter.'),
    );
  });
});
