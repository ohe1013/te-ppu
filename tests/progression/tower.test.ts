import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGRESS,
  FINAL_FLOOR,
  FLOORS,
  applyFloorResult,
  canSelectFloor,
  isFinalFloor,
  isFloor,
  type ProgressState,
} from '../../src/progression/index';

function unlockedProgress(): ProgressState {
  return {
    ...DEFAULT_PROGRESS,
    highestUnlockedFloor: 3,
    clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    settings: { soundEnabled: false, hapticsEnabled: true },
  };
}

function progressUnlockedThrough(floor: ProgressState['highestUnlockedFloor']): ProgressState {
  return {
    ...DEFAULT_PROGRESS,
    highestUnlockedFloor: floor,
    clearedFloors: {
      1: floor > 1,
      2: floor > 2,
      3: floor > 3,
      4: floor > 4,
      5: false,
    },
  };
}

describe('tower progression transitions', () => {
  it('owns the exact five-floor domain in one contract', () => {
    expect(FLOORS).toEqual([1, 2, 3, 4, 5]);
    expect(FINAL_FLOOR).toBe(5);
    expect([0, 6, '5', null].map(isFloor)).toEqual([false, false, false, false]);
    expect(FLOORS.map(isFloor)).toEqual([true, true, true, true, true]);
    expect(FLOORS.map(isFinalFloor)).toEqual([false, false, false, false, true]);
  });

  it('unlocks floors 1 to 2 to 3 without relocking cleared or unlocked floors', () => {
    const afterFloor1 = applyFloorResult(DEFAULT_PROGRESS, 1, 'WIN');
    const afterFloor2 = applyFloorResult(afterFloor1, 2, 'WIN');
    const replayedFloor1 = applyFloorResult(afterFloor2, 1, 'WIN');

    expect(afterFloor1).toEqual({
      ...DEFAULT_PROGRESS,
      highestUnlockedFloor: 2,
      clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false },
    });
    expect(afterFloor2).toEqual({
      ...DEFAULT_PROGRESS,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    expect(replayedFloor1).toEqual(afterFloor2);
    expect(canSelectFloor(afterFloor2, 1)).toBe(true);
    expect(canSelectFloor(afterFloor2, 2)).toBe(true);
    expect(canSelectFloor(afterFloor2, 3)).toBe(true);
  });

  it('leaves progress unchanged by reference for losses and draws', () => {
    const progress = unlockedProgress();

    expect(applyFloorResult(progress, 2, 'LOSS')).toBe(progress);
    expect(applyFloorResult(progress, 2, 'DRAW')).toBe(progress);
  });

  it.each([
    [1, 2], [2, 3], [3, 4], [4, 5], [5, 5],
  ] as const)('winning floor %i unlocks through %i', (floor, unlocked) => {
    const next = applyFloorResult(progressUnlockedThrough(floor), floor, 'WIN');

    expect(next.highestUnlockedFloor).toBe(unlocked);
    expect(next.clearedFloors[floor]).toBe(true);
  });

  it('allows only floors at or below the highest unlocked floor', () => {
    expect(canSelectFloor(DEFAULT_PROGRESS, 1)).toBe(true);
    expect(canSelectFloor(DEFAULT_PROGRESS, 2)).toBe(false);
    expect(canSelectFloor(DEFAULT_PROGRESS, 3)).toBe(false);
  });
});
