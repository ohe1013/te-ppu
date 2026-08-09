import type { ProgressState } from './schema';
import type { ClearedFloors, Floor } from './floors';

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export interface DifficultyRunProgress {
  highestUnlockedFloor: Floor;
  clearedFloors: ClearedFloors;
  owlDefeated: boolean;
}

export type DifficultyProgressMap = Record<Difficulty, DifficultyRunProgress>;

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string'
    && DIFFICULTIES.includes(value as Difficulty);
}

export function createDifficultyRunProgress(): DifficultyRunProgress {
  return {
    highestUnlockedFloor: 1,
    clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
    owlDefeated: false,
  };
}

export function createDifficultyProgressMap(): DifficultyProgressMap {
  return {
    easy: createDifficultyRunProgress(),
    normal: createDifficultyRunProgress(),
    hard: createDifficultyRunProgress(),
  };
}

export function getDifficultyProgress(
  progress: ProgressState,
  difficulty: Difficulty,
): DifficultyRunProgress {
  return progress.difficultyProgress[difficulty];
}

export function nextDifficulty(difficulty: Difficulty): Difficulty | null {
  const index = DIFFICULTIES.indexOf(difficulty);
  return DIFFICULTIES[index + 1] ?? null;
}

export function canSelectDifficulty(
  progress: ProgressState,
  difficulty: Difficulty,
): boolean {
  return progress.unlockedDifficulties[difficulty];
}
