import type { UserIdentity } from '../platform/platform-port';
import { createLocalProgressRepository } from './localProgressRepository';
import type { ProgressRepository } from './schema';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

const LEGACY_PROGRESS_KEY = 'te-ppu.progress';
const IDENTITY_PREFIX = 'te-ppu.progress.identity.';
const BACKUP_IDENTITY_PREFIX = 'te-ppu.progress.backup.identity.';

export interface ProgressRepositoryFactory {
  forIdentity(identity: UserIdentity): ProgressRepository;
}

export function progressStorageKeyForIdentity(identity: UserIdentity): string {
  if (identity.kind === 'local') {
    return `${IDENTITY_PREFIX}local.local-browser`;
  }
  if (identity.key.trim().length === 0) {
    throw new RangeError('Apps-in-Toss identity key must be nonblank.');
  }
  return `${IDENTITY_PREFIX}apps-in-toss.${encodeURIComponent(identity.key)}`;
}

function progressBackupPrefixForIdentity(identity: UserIdentity): string {
  if (identity.kind === 'local') {
    return `${BACKUP_IDENTITY_PREFIX}local.local-browser.`;
  }
  return `${BACKUP_IDENTITY_PREFIX}apps-in-toss.${encodeURIComponent(identity.key)}.`;
}

export function createLocalProgressRepositoryFactory(storage: ProgressStorage): ProgressRepositoryFactory {
  const repositories = new Map<string, ProgressRepository>();

  return {
    forIdentity(identity: UserIdentity): ProgressRepository {
      const progressKey = progressStorageKeyForIdentity(identity);
      const cached = repositories.get(progressKey);
      if (cached !== undefined) {
        return cached;
      }

      const repository = createLocalProgressRepository(storage, {
        progressKey,
        backupPrefix: progressBackupPrefixForIdentity(identity),
        legacyReadKey: identity.kind === 'local' ? LEGACY_PROGRESS_KEY : undefined,
      });
      repositories.set(progressKey, repository);
      return repository;
    },
  };
}
