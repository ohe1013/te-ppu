export interface ProgressState {
  schemaVersion: 1;
  highestUnlockedFloor: 1 | 2 | 3;
  clearedFloors: { 1: boolean; 2: boolean; 3: boolean };
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
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

export const DEFAULT_PROGRESS: ProgressState = {
  schemaVersion: 1,
  highestUnlockedFloor: 1,
  clearedFloors: { 1: false, 2: false, 3: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

export function cloneProgressState(state: ProgressState): ProgressState {
  return {
    schemaVersion: state.schemaVersion,
    highestUnlockedFloor: state.highestUnlockedFloor,
    clearedFloors: { ...state.clearedFloors },
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

export function parseProgressState(value: unknown): ProgressState | null {
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
  if (!exactObject(value.settings, ['soundEnabled', 'hapticsEnabled'])) return null;
  if (
    typeof value.settings.soundEnabled !== 'boolean'
    || typeof value.settings.hapticsEnabled !== 'boolean'
  ) return null;

  return {
    schemaVersion: 1,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: {
      1: value.clearedFloors[1],
      2: value.clearedFloors[2],
      3: value.clearedFloors[3],
    },
    settings: {
      soundEnabled: value.settings.soundEnabled,
      hapticsEnabled: value.settings.hapticsEnabled,
    },
  };
}
