import type { ProgressState } from './schema';

export type Floor = 1 | 2 | 3;
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

  const unlockedByWin = Math.min(3, floor + 1) as Floor;
  const highestUnlockedFloor = Math.max(
    progress.highestUnlockedFloor,
    unlockedByWin,
  ) as Floor;
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
