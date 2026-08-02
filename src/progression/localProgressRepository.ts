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

const PROGRESS_KEY = 'te-ppu.progress';
const BACKUP_PREFIX = 'te-ppu.progress.backup.';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

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

function defaults(): ProgressState {
  return cloneProgressState(DEFAULT_PROGRESS);
}

function parseRaw(raw: string): ReturnType<typeof parsePersistedProgress> {
  try {
    return parsePersistedProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function createLocalProgressRepository(
  storage: ProgressStorage,
): ProgressRepository {
  return {
    async load(): Promise<ProgressLoadResult> {
      let raw: string | null;
      try {
        raw = storage.getItem(PROGRESS_KEY);
      } catch {
        return { ok: false, state: defaults(), error: READ_FAILED };
      }

      if (raw === null) {
        return {
          ok: true,
          state: defaults(),
          recoveredFromCorruption: false,
        };
      }

      const parsed = parseRaw(raw);
      if (parsed !== null) {
        if (parsed.migrated) {
          try {
            storage.setItem(PROGRESS_KEY, JSON.stringify(parsed.state));
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

      try {
        storage.setItem(`${BACKUP_PREFIX}${Date.now()}`, raw);
      } catch {
        return { ok: false, state: defaults(), error: BACKUP_FAILED };
      }

      try {
        storage.setItem(PROGRESS_KEY, JSON.stringify(DEFAULT_PROGRESS));
      } catch {
        return { ok: false, state: defaults(), error: WRITE_FAILED };
      }

      return {
        ok: true,
        state: defaults(),
        recoveredFromCorruption: true,
      };
    },

    async save(state: ProgressState): Promise<ProgressSaveResult> {
      try {
        storage.setItem(PROGRESS_KEY, JSON.stringify(state));
        return { ok: true };
      } catch {
        return { ok: false, error: WRITE_FAILED };
      }
    },
  };
}
