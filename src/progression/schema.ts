import { type ClearedFloors, type Floor, isFloor } from './floors';

export interface ProgressState {
  schemaVersion: 2;
  highestUnlockedFloor: Floor;
  clearedFloors: ClearedFloors;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}

export interface ParsedProgress {
  readonly state: ProgressState;
  readonly migrated: boolean;
}

interface LegacyProgressState {
  readonly schemaVersion: 1;
  readonly highestUnlockedFloor: 1 | 2 | 3;
  readonly clearedFloors: { readonly 1: boolean; readonly 2: boolean; readonly 3: boolean };
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
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
  schemaVersion: 2,
  highestUnlockedFloor: 1,
  clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
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

function isSettings(value: unknown): value is ProgressState['settings'] {
  return exactObject(value, ['soundEnabled', 'hapticsEnabled'])
    && typeof value.soundEnabled === 'boolean'
    && typeof value.hapticsEnabled === 'boolean';
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
    settings: {
      soundEnabled: value.settings.soundEnabled,
      hapticsEnabled: value.settings.hapticsEnabled,
    },
  };
}

function parseVersion2Progress(value: unknown): ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'highestUnlockedFloor',
    'clearedFloors',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 2 || !isFloor(value.highestUnlockedFloor)) return null;
  if (!exactObject(value.clearedFloors, ['1', '2', '3', '4', '5'])) return null;
  if (
    typeof value.clearedFloors[1] !== 'boolean'
    || typeof value.clearedFloors[2] !== 'boolean'
    || typeof value.clearedFloors[3] !== 'boolean'
    || typeof value.clearedFloors[4] !== 'boolean'
    || typeof value.clearedFloors[5] !== 'boolean'
  ) return null;
  if (!isSettings(value.settings)) return null;

  return {
    schemaVersion: 2,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: {
      1: value.clearedFloors[1],
      2: value.clearedFloors[2],
      3: value.clearedFloors[3],
      4: value.clearedFloors[4],
      5: value.clearedFloors[5],
    },
    settings: {
      soundEnabled: value.settings.soundEnabled,
      hapticsEnabled: value.settings.hapticsEnabled,
    },
  };
}

export function parsePersistedProgress(value: unknown): ParsedProgress | null {
  const version2 = parseVersion2Progress(value);
  if (version2 !== null) return { state: version2, migrated: false };

  const legacy = parseLegacyProgress(value);
  if (legacy === null) return null;

  return {
    migrated: true,
    state: {
      schemaVersion: 2,
      highestUnlockedFloor: legacy.clearedFloors[3] ? 4 : legacy.highestUnlockedFloor,
      clearedFloors: {
        1: legacy.clearedFloors[1],
        2: legacy.clearedFloors[2],
        3: legacy.clearedFloors[3],
        4: false,
        5: false,
      },
      settings: { ...legacy.settings },
    },
  };
}

export function parseProgressState(value: unknown): ProgressState | null {
  return parsePersistedProgress(value)?.state ?? null;
}
