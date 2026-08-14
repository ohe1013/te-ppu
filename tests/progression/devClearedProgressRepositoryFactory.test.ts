import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDevClearedProgress,
  createDevClearedProgressRepositoryFactory,
  devClearedProgressStorageKeyForIdentity,
  progressStorageKeyForIdentity,
} from '../../src/progression';

const identity = { kind: 'local', key: 'local-browser' } as const;

class TestStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('dev cleared progress repository factory', () => {
  it('uses a key disjoint from normal browser progress and seeds it once', async () => {
    const storage = new TestStorage();
    const key = devClearedProgressStorageKeyForIdentity(identity);
    const repository = createDevClearedProgressRepositoryFactory(storage).forIdentity(identity);

    expect(key).not.toBe(progressStorageKeyForIdentity(identity));
    await expect(repository.load()).resolves.toEqual({
      ok: true,
      state: createDevClearedProgress(),
      recoveredFromCorruption: false,
    });
    expect(storage.values.get(key)).toBe(JSON.stringify(createDevClearedProgress()));
    expect(storage.values.has(progressStorageKeyForIdentity(identity))).toBe(false);
  });

  it('reloads profile and setting changes from only the cleared namespace', async () => {
    const storage = new TestStorage();
    const factory = createDevClearedProgressRepositoryFactory(storage);
    const repository = factory.forIdentity(identity);
    const changed = createDevClearedProgress();
    changed.profile = { initials: 'TST', characterId: 'star-alchemist' };
    changed.settings.bgmVolume = 25;

    await repository.save(changed);

    await expect(repository.load()).resolves.toMatchObject({ ok: true, state: changed });
    expect(factory.forIdentity(identity)).toBe(repository);
  });

  it('backs up corrupt cleared data only under the cleared backup prefix', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const storage = new TestStorage();
    const key = devClearedProgressStorageKeyForIdentity(identity);
    storage.values.set(key, '{broken');

    const result = await createDevClearedProgressRepositoryFactory(storage)
      .forIdentity(identity)
      .load();

    expect(result).toMatchObject({
      ok: true,
      state: createDevClearedProgress(),
      recoveredFromCorruption: true,
    });
    expect(storage.values.get(
      'te-ppu.progress.backup.dev-cleared.identity.local.local-browser.1700000000000',
    )).toBe('{broken');
  });
});
