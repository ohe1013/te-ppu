import { DIFFICULTIES } from './difficulty';
import { FLOORS } from './floors';
import { cloneProgressState, DEFAULT_PROGRESS, type ProgressState } from './schema';

export function createDevClearedProgress(): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.profile = { initials: 'ADM', characterId: 'hero-engineer' };
  progress.selectedDifficulty = 'hard';
  progress.unlockedDifficulties = { easy: true, normal: true, hard: true };
  for (const difficulty of DIFFICULTIES) {
    progress.difficultyProgress[difficulty] = {
      highestUnlockedFloor: 5,
      clearedFloors: Object.fromEntries(
        FLOORS.map((floor) => [floor, true]),
      ) as ProgressState['difficultyProgress']['easy']['clearedFloors'],
      owlDefeated: true,
    };
  }
  return progress;
}
