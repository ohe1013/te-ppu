import type { UserIdentity } from '../platform/platform-port';
import { createDevClearedProgress } from './devClearedProgress';
import { createLocalProgressRepository } from './localProgressRepository';
import type { ProgressRepositoryFactory } from './progressRepositoryFactory';

type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

const IDENTITY_PREFIX = 'te-ppu.progress.dev-cleared.identity.';
const BACKUP_PREFIX = 'te-ppu.progress.backup.dev-cleared.identity.';

function identitySuffix(identity: UserIdentity): string {
  if (identity.kind === 'local') return 'local.local-browser';
  if (identity.key.trim().length === 0) {
    throw new RangeError('Apps-in-Toss identity key must be nonblank.');
  }
  return `apps-in-toss.${encodeURIComponent(identity.key)}`;
}

export function devClearedProgressStorageKeyForIdentity(identity: UserIdentity): string {
  return `${IDENTITY_PREFIX}${identitySuffix(identity)}`;
}

export function createDevClearedProgressRepositoryFactory(
  storage: ProgressStorage,
): ProgressRepositoryFactory {
  const repositories = new Map<string, ReturnType<typeof createLocalProgressRepository>>();
  return {
    forIdentity(identity) {
      const suffix = identitySuffix(identity);
      const progressKey = `${IDENTITY_PREFIX}${suffix}`;
      const cached = repositories.get(progressKey);
      if (cached !== undefined) return cached;
      const repository = createLocalProgressRepository(storage, {
        progressKey,
        backupPrefix: `${BACKUP_PREFIX}${suffix}.`,
        initialState: createDevClearedProgress(),
        persistInitialStateWhenMissing: true,
      });
      repositories.set(progressKey, repository);
      return repository;
    },
  };
}
