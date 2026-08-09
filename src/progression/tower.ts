import type { ProgressState } from './schema';
import { FINAL_FLOOR, type Floor } from './floors';

export type FloorResult = 'WIN' | 'LOSS' | 'DRAW';

export function canSelectFloor(progress: ProgressState, floor: Floor): boolean {
  return floor <= progress.highestUnlockedFloor;
}

export function applyFloorResult(
  progress: ProgressState,
  floor: Floor,
  result: FloorResult,
): ProgressState {
  if (result !== 'WIN') return progress;

  const unlockedByWin = Math.min(FINAL_FLOOR, floor + 1) as ProgressState['highestUnlockedFloor'];
  const highestUnlockedFloor = Math.max(
    progress.highestUnlockedFloor,
    unlockedByWin,
  ) as ProgressState['highestUnlockedFloor'];
  return {
    ...progress,
    highestUnlockedFloor,
    clearedFloors: {
      ...progress.clearedFloors,
      [floor]: true,
    },
    settings: { ...progress.settings },
  };
}
