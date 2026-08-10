import type { ProgressState } from './schema';
import { FINAL_FLOOR, type Floor } from './floors';
import { getDifficultyProgress } from './difficulty';

export type FloorResult = 'WIN' | 'LOSS' | 'DRAW';

export function canSelectFloor(progress: ProgressState, floor: Floor): boolean {
  return floor <= getDifficultyProgress(progress, progress.selectedDifficulty).highestUnlockedFloor;
}

export function applyFloorResult(
  progress: ProgressState,
  floor: Floor,
  result: FloorResult,
): ProgressState {
  if (result !== 'WIN') return progress;

  const active = getDifficultyProgress(progress, progress.selectedDifficulty);
  const unlockedByWin = Math.min(FINAL_FLOOR, floor + 1) as Floor;
  const highestUnlockedFloor = Math.max(
    active.highestUnlockedFloor,
    unlockedByWin,
  ) as ProgressState['difficultyProgress']['easy']['highestUnlockedFloor'];
  return {
    ...progress,
    difficultyProgress: {
      ...progress.difficultyProgress,
      [progress.selectedDifficulty]: {
        highestUnlockedFloor,
        clearedFloors: {
          ...active.clearedFloors,
          [floor]: true,
        },
        owlDefeated: active.owlDefeated,
      },
    },
    settings: { ...progress.settings },
  };
}
