import { type ClearedFloors, isFloor } from './floors';
import {
  createDifficultyProgressMap,
  DIFFICULTIES,
  isDifficulty,
  type Difficulty,
  type DifficultyProgressMap,
  type DifficultyRunProgress,
} from './difficulty';

export interface ProgressState {
  schemaVersion: 3;
  selectedDifficulty: Difficulty;
  unlockedDifficulties: Record<Difficulty, boolean>;
  difficultyProgress: DifficultyProgressMap;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}

interface LegacyProgressState {
  readonly schemaVersion: 1;
  readonly highestUnlockedFloor: 1 | 2 | 3;
  readonly clearedFloors: { readonly 1: boolean; readonly 2: boolean; readonly 3: boolean };
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
}

interface Version2ProgressState {
  readonly schemaVersion: 2;
  readonly highestUnlockedFloor: 1 | 2 | 3 | 4 | 5;
  readonly clearedFloors: ClearedFloors;
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
}

export interface ParsedProgress {
  readonly state: ProgressState;
  readonly migrated: boolean;
}

export type ProgressError =
  | { code: 'READ_FAILED'; message: 'Progress could not be read.' }
  | { code: 'BACKUP_FAILED'; message: 'Corrupt progress could not be backed up.' }
  | { code: 'WRITE_FAILED'; message: 'Progress could not be saved.' };

export type ProgressLoadResult =
  | { ok: true; state: ProgressState; recoveredFromCorruption: boolean }
  | { ok: false; state: ProgressState; error: ProgressError };

export type ProgressSaveResult =
  | { ok: true }
  | { ok: false; error: ProgressError };

export interface ProgressRepository {
  load(): Promise<ProgressLoadResult>;
  save(state: ProgressState): Promise<ProgressSaveResult>;
}

function cloneDifficultyRun(run: DifficultyRunProgress): DifficultyRunProgress {
  return {
    highestUnlockedFloor: run.highestUnlockedFloor,
    clearedFloors: { ...run.clearedFloors },
    owlDefeated: run.owlDefeated,
  };
}

export const DEFAULT_PROGRESS: ProgressState = {
  schemaVersion: 3,
  selectedDifficulty: 'easy',
  unlockedDifficulties: { easy: true, normal: false, hard: false },
  difficultyProgress: createDifficultyProgressMap(),
  settings: { soundEnabled: true, hapticsEnabled: true },
};

export function cloneProgressState(state: ProgressState): ProgressState {
  return {
    schemaVersion: 3,
    selectedDifficulty: state.selectedDifficulty,
    unlockedDifficulties: { ...state.unlockedDifficulties },
    difficultyProgress: {
      easy: cloneDifficultyRun(state.difficultyProgress.easy),
      normal: cloneDifficultyRun(state.difficultyProgress.normal),
      hard: cloneDifficultyRun(state.difficultyProgress.hard),
    },
    settings: { ...state.settings },
  };
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isSettings(value: unknown): value is ProgressState['settings'] {
  return exactObject(value, ['soundEnabled', 'hapticsEnabled'])
    && typeof value.soundEnabled === 'boolean'
    && typeof value.hapticsEnabled === 'boolean';
}

function isClearedFloors(value: unknown): value is ClearedFloors {
  return exactObject(value, ['1', '2', '3', '4', '5'])
    && typeof value[1] === 'boolean'
    && typeof value[2] === 'boolean'
    && typeof value[3] === 'boolean'
    && typeof value[4] === 'boolean'
    && typeof value[5] === 'boolean';
}

function parseLegacyProgress(value: unknown): LegacyProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'highestUnlockedFloor',
    'clearedFloors',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 1) return null;
  if (
    value.highestUnlockedFloor !== 1
    && value.highestUnlockedFloor !== 2
    && value.highestUnlockedFloor !== 3
  ) return null;
  if (!exactObject(value.clearedFloors, ['1', '2', '3'])) return null;
  if (
    typeof value.clearedFloors[1] !== 'boolean'
    || typeof value.clearedFloors[2] !== 'boolean'
    || typeof value.clearedFloors[3] !== 'boolean'
  ) return null;
  if (!isSettings(value.settings)) return null;

  return {
    schemaVersion: 1,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: {
      1: value.clearedFloors[1],
      2: value.clearedFloors[2],
      3: value.clearedFloors[3],
    },
    settings: { ...value.settings },
  };
}

function parseVersion2Progress(value: unknown): Version2ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'highestUnlockedFloor',
    'clearedFloors',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 2 || !isFloor(value.highestUnlockedFloor)) return null;
  if (!isClearedFloors(value.clearedFloors) || !isSettings(value.settings)) return null;

  return {
    schemaVersion: 2,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: { ...value.clearedFloors },
    settings: { ...value.settings },
  };
}

function parseDifficultyRun(value: unknown): DifficultyRunProgress | null {
  if (!exactObject(value, ['highestUnlockedFloor', 'clearedFloors', 'owlDefeated'])) {
    return null;
  }
  if (!isFloor(value.highestUnlockedFloor)) return null;
  if (!isClearedFloors(value.clearedFloors)) return null;
  if (typeof value.owlDefeated !== 'boolean') return null;
  return {
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: { ...value.clearedFloors },
    owlDefeated: value.owlDefeated,
  };
}

function parseDifficultyProgress(value: unknown): DifficultyProgressMap | null {
  if (!exactObject(value, DIFFICULTIES)) return null;
  const parsed = DIFFICULTIES.map((difficulty) => [
    difficulty,
    parseDifficultyRun(value[difficulty]),
  ] as const);
  if (parsed.some(([, run]) => run === null)) return null;
  return Object.fromEntries(parsed) as DifficultyProgressMap;
}

function isUnlockedDifficulties(
  value: unknown,
): value is Record<Difficulty, boolean> {
  return exactObject(value, DIFFICULTIES)
    && DIFFICULTIES.every((difficulty) => typeof value[difficulty] === 'boolean');
}

function parseVersion3Progress(value: unknown): ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'selectedDifficulty',
    'unlockedDifficulties',
    'difficultyProgress',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 3 || !isDifficulty(value.selectedDifficulty)) return null;
  if (!isUnlockedDifficulties(value.unlockedDifficulties)) return null;
  if (!value.unlockedDifficulties[value.selectedDifficulty]) return null;
  const difficultyProgress = parseDifficultyProgress(value.difficultyProgress);
  if (difficultyProgress === null || !isSettings(value.settings)) return null;
  if (!value.unlockedDifficulties.easy) return null;
  return {
    schemaVersion: 3,
    selectedDifficulty: value.selectedDifficulty,
    unlockedDifficulties: { ...value.unlockedDifficulties },
    difficultyProgress,
    settings: { ...value.settings },
  };
}

function migrateVersion2(state: Version2ProgressState): ProgressState {
  const difficultyProgress = createDifficultyProgressMap();
  difficultyProgress.easy = {
    highestUnlockedFloor: state.highestUnlockedFloor,
    clearedFloors: { ...state.clearedFloors },
    owlDefeated: false,
  };
  return {
    schemaVersion: 3,
    selectedDifficulty: 'easy',
    unlockedDifficulties: { easy: true, normal: false, hard: false },
    difficultyProgress,
    settings: { ...state.settings },
  };
}

function migrateLegacy(state: LegacyProgressState): ProgressState {
  const version2: Version2ProgressState = {
    schemaVersion: 2,
    highestUnlockedFloor: state.clearedFloors[3] ? 4 : state.highestUnlockedFloor,
    clearedFloors: {
      1: state.clearedFloors[1],
      2: state.clearedFloors[2],
      3: state.clearedFloors[3],
      4: false,
      5: false,
    },
    settings: { ...state.settings },
  };
  return migrateVersion2(version2);
}

export function parsePersistedProgress(value: unknown): ParsedProgress | null {
  const version3 = parseVersion3Progress(value);
  if (version3 !== null) return { state: version3, migrated: false };

  const version2 = parseVersion2Progress(value);
  if (version2 !== null) return { state: migrateVersion2(version2), migrated: true };

  const legacy = parseLegacyProgress(value);
  if (legacy === null) return null;
  return { state: migrateLegacy(legacy), migrated: true };
}

export function parseProgressState(value: unknown): ProgressState | null {
  return parsePersistedProgress(value)?.state ?? null;
}
