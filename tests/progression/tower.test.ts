import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGRESS,
  applyFloorResult,
  canSelectFloor,
  type ProgressState,
} from '../../src/progression/index';

function unlockedProgress(): ProgressState {
  return {
    ...DEFAULT_PROGRESS,
    highestUnlockedFloor: 3,
    clearedFloors: { 1: true, 2: true, 3: false },
    settings: { soundEnabled: false, hapticsEnabled: true },
  };
}

describe('tower progression transitions', () => {
  it('unlocks floors 1 to 2 to 3 without relocking cleared or unlocked floors', () => {
    const afterFloor1 = applyFloorResult(DEFAULT_PROGRESS, 1, 'WIN');
    const afterFloor2 = applyFloorResult(afterFloor1, 2, 'WIN');
    const replayedFloor1 = applyFloorResult(afterFloor2, 1, 'WIN');

    expect(afterFloor1).toEqual({
      ...DEFAULT_PROGRESS,
      highestUnlockedFloor: 2,
      clearedFloors: { 1: true, 2: false, 3: false },
    });
    expect(afterFloor2).toEqual({
      ...DEFAULT_PROGRESS,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false },
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

  it('marks floor 3 cleared without exceeding the highest floor and preserves settings', () => {
    const progress = unlockedProgress();

    expect(applyFloorResult(progress, 3, 'WIN')).toEqual({
      ...progress,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    });
  });

  it('allows only floors at or below the highest unlocked floor', () => {
    expect(canSelectFloor(DEFAULT_PROGRESS, 1)).toBe(true);
    expect(canSelectFloor(DEFAULT_PROGRESS, 2)).toBe(false);
    expect(canSelectFloor(DEFAULT_PROGRESS, 3)).toBe(false);
  });
});
