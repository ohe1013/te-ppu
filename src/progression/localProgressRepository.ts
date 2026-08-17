import {
  DEFAULT_PROGRESS,
  cloneProgressState,
  parsePersistedProgress,
  type ProgressError,
  type ProgressLoadResult,
  type ProgressRepository,
  type ProgressSaveResult,
  type ProgressState,
} from './schema';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface LocalProgressRepositoryOptions {
  readonly progressKey: string;
  readonly backupPrefix: string;
  readonly legacyReadKey?: string;
  readonly initialState?: ProgressState;
  readonly persistInitialStateWhenMissing?: boolean;
}

const READ_FAILED: ProgressError = {
  code: 'READ_FAILED',
  message: 'Progress could not be read.',
};
const BACKUP_FAILED: ProgressError = {
  code: 'BACKUP_FAILED',
  message: 'Corrupt progress could not be backed up.',
};
const WRITE_FAILED: ProgressError = {
  code: 'WRITE_FAILED',
  message: 'Progress could not be saved.',
};

function parseRaw(raw: string): ReturnType<typeof parsePersistedProgress> {
  try {
    return parsePersistedProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function createLocalProgressRepository(
  storage: ProgressStorage,
  options: LocalProgressRepositoryOptions,
): ProgressRepository {
  const { progressKey, backupPrefix, legacyReadKey } = options;
  const initialState = cloneProgressState(options.initialState ?? DEFAULT_PROGRESS);
  function defaults(): ProgressState {
    return cloneProgressState(initialState);
  }
  if (progressKey.trim().length === 0) {
    throw new Error('Local progress repository requires a nonblank progress key.');
  }
  if (backupPrefix.trim().length === 0) {
    throw new Error('Local progress repository requires a nonblank backup prefix.');
  }
  if (legacyReadKey !== undefined && legacyReadKey.trim().length === 0) {
    throw new Error('Local progress repository legacy read key must be nonblank.');
  }
  if (legacyReadKey === progressKey) {
    throw new Error('Local progress repository legacy read key must differ from the progress key.');
  }

  function loadInitialState(): ProgressLoadResult {
    const state = defaults();
    if (!options.persistInitialStateWhenMissing) {
      return { ok: true, state, recoveredFromCorruption: false };
    }
    try {
      storage.setItem(progressKey, JSON.stringify(initialState));
    } catch {
      return { ok: false, state, error: WRITE_FAILED };
    }
    return { ok: true, state, recoveredFromCorruption: false };
  }

  function recoverCorruptRaw(raw: string): ProgressLoadResult {
    try {
      storage.setItem(`${backupPrefix}${Date.now()}`, raw);
    } catch {
      return { ok: false, state: defaults(), error: BACKUP_FAILED };
    }

    try {
      storage.setItem(progressKey, JSON.stringify(initialState));
    } catch {
      return { ok: false, state: defaults(), error: WRITE_FAILED };
    }

    return {
      ok: true,
      state: defaults(),
      recoveredFromCorruption: true,
    };
  }

  function loadRaw(raw: string, mustWrite: boolean): ProgressLoadResult {
    const parsed = parseRaw(raw);
    if (parsed === null) {
      return recoverCorruptRaw(raw);
    }

    if (mustWrite || parsed.migrated) {
      try {
        storage.setItem(progressKey, JSON.stringify(parsed.state));
      } catch {
        return { ok: false, state: parsed.state, error: WRITE_FAILED };
      }
    }
    return {
      ok: true,
      state: parsed.state,
      recoveredFromCorruption: false,
    };
  }

  return {
    async load(): Promise<ProgressLoadResult> {
      let raw: string | null;
      try {
        raw = storage.getItem(progressKey);
      } catch {
        return { ok: false, state: defaults(), error: READ_FAILED };
      }

      if (raw !== null) {
        return loadRaw(raw, false);
      }

      if (legacyReadKey === undefined) {
        return loadInitialState();
      }

      try {
        raw = storage.getItem(legacyReadKey);
      } catch {
        return { ok: false, state: defaults(), error: READ_FAILED };
      }

      if (raw === null) {
        return loadInitialState();
      }

      return loadRaw(raw, true);
    },

    async save(state: ProgressState): Promise<ProgressSaveResult> {
      try {
        storage.setItem(progressKey, JSON.stringify(state));
        return { ok: true };
      } catch {
        return { ok: false, error: WRITE_FAILED };
      }
    },
  };
}
