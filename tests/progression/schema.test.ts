import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGRESS,
  cloneProgressState,
  parsePersistedProgress,
  type ProgressState,
} from '../../src/progression/schema';
import {
  applyFloorResult,
  getDifficultyProgress,
} from '../../src/progression/index';

const legacyV2 = {
  schemaVersion: 2,
  highestUnlockedFloor: 4,
  clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
  settings: { soundEnabled: false, hapticsEnabled: true },
};

const currentState = {
  schemaVersion: 3,
  selectedDifficulty: 'easy',
  unlockedDifficulties: { easy: true, normal: false, hard: false },
  difficultyProgress: {
    easy: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
    normal: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
    hard: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
  },
  settings: { soundEnabled: true, hapticsEnabled: true },
} satisfies ProgressState;

describe('difficulty progress schema', () => {
  it('starts a new save on Easy with only Easy unlocked', () => {
    expect(DEFAULT_PROGRESS).toEqual(currentState);
  });

  it('migrates the existing five-floor v2 state into Easy', () => {
    expect(parsePersistedProgress(legacyV2)).toEqual({
      migrated: true,
      state: {
        ...currentState,
        settings: legacyV2.settings,
        difficultyProgress: {
          ...currentState.difficultyProgress,
          easy: {
            highestUnlockedFloor: 4,
            clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
            owlDefeated: false,
          },
        },
      },
    });
  });

  it('updates only the selected difficulty run', () => {
    const normal = {
      ...currentState,
      selectedDifficulty: 'normal' as const,
      unlockedDifficulties: { easy: true, normal: true, hard: false },
    };
    const next = applyFloorResult(normal, 1, 'WIN');

    expect(getDifficultyProgress(next, 'normal').clearedFloors[1]).toBe(true);
    expect(getDifficultyProgress(next, 'easy').clearedFloors[1]).toBe(false);
  });

  it('deep-clones nested difficulty progress', () => {
    const copy = cloneProgressState(currentState);
    copy.difficultyProgress.easy.clearedFloors[1] = true;
    copy.settings.soundEnabled = false;

    expect(currentState.difficultyProgress.easy.clearedFloors[1]).toBe(false);
    expect(currentState.settings.soundEnabled).toBe(true);
  });
});
