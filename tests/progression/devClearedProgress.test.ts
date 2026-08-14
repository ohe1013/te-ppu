import { describe, expect, it } from 'vitest';
import {
  createDevClearedProgress,
  DIFFICULTIES,
  FLOORS,
  parseProgressState,
} from '../../src/progression';

describe('createDevClearedProgress', () => {
  it('creates a valid ADM profile with Hard and every tower challenge cleared', () => {
    const progress = createDevClearedProgress();

    expect(parseProgressState(progress)).toEqual(progress);
    expect(progress.profile).toEqual({
      initials: 'ADM',
      characterId: 'hero-engineer',
    });
    expect(progress.selectedDifficulty).toBe('hard');
    expect(progress.unlockedDifficulties).toEqual({
      easy: true,
      normal: true,
      hard: true,
    });
    for (const difficulty of DIFFICULTIES) {
      expect(progress.difficultyProgress[difficulty]).toEqual({
        highestUnlockedFloor: 5,
        clearedFloors: Object.fromEntries(FLOORS.map((floor) => [floor, true])),
        owlDefeated: true,
      });
    }
  });

  it('does not fabricate local or pending leaderboard scores', () => {
    const progress = createDevClearedProgress();

    expect(progress.localBestScores).toEqual({
      easy: null,
      normal: null,
      hard: null,
    });
    expect(progress.pendingLeaderboardSubmissions).toEqual({});
  });

  it('returns detached state on every call', () => {
    const first = createDevClearedProgress();
    const second = createDevClearedProgress();

    first.difficultyProgress.hard.clearedFloors[1] = false;
    expect(second.difficultyProgress.hard.clearedFloors[1]).toBe(true);
  });
});
