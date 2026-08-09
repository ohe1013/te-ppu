import { describe, expect, it } from 'vitest';
import {
  cloneProgressState,
  DEFAULT_PROGRESS,
  FINAL_FLOOR,
  FLOORS,
  applyFloorResult,
  canSelectFloor,
  getDifficultyProgress,
  isFinalFloor,
  isFloor,
  type ProgressState,
} from '../../src/progression/index';

function progressUnlockedThrough(floor: 1 | 2 | 3 | 4 | 5): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.difficultyProgress.easy = {
    highestUnlockedFloor: floor,
    clearedFloors: {
      1: floor > 1,
      2: floor > 2,
      3: floor > 3,
      4: floor > 4,
      5: false,
    },
    owlDefeated: false,
  };
  return progress;
}

function unlockedProgress(): ProgressState {
  const progress = progressUnlockedThrough(3);
  progress.settings = { soundEnabled: false, hapticsEnabled: true };
  return progress;
}

function active(progress: ProgressState) {
  return getDifficultyProgress(progress, 'easy');
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

    expect(active(afterFloor1)).toEqual({
      highestUnlockedFloor: 2,
      clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    });
    expect(active(afterFloor2)).toEqual({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
      owlDefeated: false,
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
    [1, 2], [2, 3], [3, 4],
  ] as const)('winning floor %i unlocks through %i', (floor, unlocked) => {
    const next = applyFloorResult(progressUnlockedThrough(floor), floor, 'WIN');

    expect(active(next).highestUnlockedFloor).toBe(unlocked);
    expect(active(next).clearedFloors[floor]).toBe(true);
  });

  it('unlocks floor 5 from floor 4 while preserving every prior clear and setting', () => {
    const beforeFloorFour = progressUnlockedThrough(4);
    beforeFloorFour.settings = { soundEnabled: false, hapticsEnabled: true };

    expect(canSelectFloor(beforeFloorFour, 4)).toBe(true);
    expect(canSelectFloor(beforeFloorFour, 5)).toBe(false);

    const afterFloorFour = applyFloorResult(beforeFloorFour, 4, 'WIN');

    expect(active(afterFloorFour)).toEqual({
      highestUnlockedFloor: 5,
      clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
      owlDefeated: false,
    });
    expect(afterFloorFour.settings).toEqual({ soundEnabled: false, hapticsEnabled: true });
    expect(canSelectFloor(afterFloorFour, 4)).toBe(true);
    expect(canSelectFloor(afterFloorFour, 5)).toBe(true);
  });

  it.each([
    { floor: 4 as const, result: 'LOSS' as const },
    { floor: 4 as const, result: 'DRAW' as const },
    { floor: 5 as const, result: 'LOSS' as const },
    { floor: 5 as const, result: 'DRAW' as const },
  ])('keeps late-floor progress locked and uncleared after floor $floor $result', ({ floor, result }) => {
    const progress = progressUnlockedThrough(floor);

    const next = applyFloorResult(progress, floor, result);

    expect(next).toBe(progress);
    expect(active(next).highestUnlockedFloor).toBe(floor);
    expect(active(next).clearedFloors[floor]).toBe(false);
  });

  it('clears floor 5 without advancing beyond the tower cap', () => {
    const beforeFloorFive = progressUnlockedThrough(5);
    beforeFloorFive.settings = { soundEnabled: true, hapticsEnabled: false };

    const next = applyFloorResult(beforeFloorFive, 5, 'WIN');

    expect(active(next)).toEqual({
      highestUnlockedFloor: 5,
      clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: true },
      owlDefeated: false,
    });
  });

  it('allows only floors at or below the highest unlocked floor, including floors 4 and 5', () => {
    expect(canSelectFloor(DEFAULT_PROGRESS, 1)).toBe(true);
    expect(canSelectFloor(DEFAULT_PROGRESS, 2)).toBe(false);
    expect(canSelectFloor(DEFAULT_PROGRESS, 3)).toBe(false);

    const floorFourUnlocked = progressUnlockedThrough(4);
    expect(canSelectFloor(floorFourUnlocked, 4)).toBe(true);
    expect(canSelectFloor(floorFourUnlocked, 5)).toBe(false);

    const floorFiveUnlocked = progressUnlockedThrough(5);
    expect(canSelectFloor(floorFiveUnlocked, 4)).toBe(true);
    expect(canSelectFloor(floorFiveUnlocked, 5)).toBe(true);
  });
});
