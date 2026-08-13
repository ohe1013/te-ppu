import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloneProgressState,
  DEFAULT_PROGRESS,
  createLocalProgressRepositoryFactory,
  progressStorageKeyForIdentity,
  type ProgressState,
  type ClearedFloors,
  type Floor,
} from '../../src/progression';

const LEGACY_PROGRESS_KEY = 'te-ppu.progress';
const LOCAL_PROGRESS_KEY = 'te-ppu.progress.identity.local.local-browser';
const LOCAL_BACKUP_PREFIX = 'te-ppu.progress.backup.identity.local.local-browser.';
const NOW = 1_700_000_000_000;

class TestStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: Array<{ readonly key: string; readonly value: string }> = [];

  getItem(key: string): string | null {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

interface ProgressPatch {
  readonly highestUnlockedFloor?: Floor;
  readonly clearedFloors?: ClearedFloors;
  readonly settings?: ProgressState['settings'];
}

function validProgress(patch: ProgressPatch = {}): ProgressState {
  const state = cloneProgressState(DEFAULT_PROGRESS);
  state.difficultyProgress.easy = {
    highestUnlockedFloor: patch.highestUnlockedFloor ?? 2,
    clearedFloors: {
      1: true, 2: false, 3: false, 4: false, 5: false,
      ...patch.clearedFloors,
    },
    owlDefeated: false,
  };
  state.settings = patch.settings ?? {
    soundEnabled: false,
    bgmVolume: 70,
    sfxVolume: 100,
    hapticsEnabled: true,
  };
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('local progress repository factory', () => {
  it('maps local and Apps-in-Toss identities to exact canonical keys', () => {
    const hash = 'HASH/a%?한글';

    expect(progressStorageKeyForIdentity({ kind: 'local', key: 'local-browser' }))
      .toBe(LOCAL_PROGRESS_KEY);
    expect(progressStorageKeyForIdentity({ kind: 'apps-in-toss', key: hash }))
      .toBe(`te-ppu.progress.identity.apps-in-toss.${encodeURIComponent(hash)}`);
  });

  it('keeps two Apps-in-Toss users isolated and caches each identity repository', async () => {
    const storage = new TestStorage();
    const factory = createLocalProgressRepositoryFactory(storage);
    const userA = { kind: 'apps-in-toss', key: 'user-a' } as const;
    const userB = { kind: 'apps-in-toss', key: 'user-b' } as const;
    const progressA = validProgress();
    const progressB = validProgress({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
      settings: { soundEnabled: true, bgmVolume: 70, sfxVolume: 100, hapticsEnabled: false },
    });

    const repositoryA = factory.forIdentity(userA);
    const repositoryB = factory.forIdentity(userB);
    expect(factory.forIdentity(userA)).toBe(repositoryA);
    expect(repositoryB).not.toBe(repositoryA);

    await repositoryA.save(progressA);
    await repositoryB.save(progressB);

    const keyA = progressStorageKeyForIdentity(userA);
    const keyB = progressStorageKeyForIdentity(userB);
    expect(storage.values.get(keyA)).toBe(JSON.stringify(progressA));
    expect(storage.values.get(keyB)).toBe(JSON.stringify(progressB));
    await expect(repositoryA.load()).resolves.toMatchObject({ ok: true, state: progressA });
    await expect(repositoryB.load()).resolves.toMatchObject({ ok: true, state: progressB });
  });

  it('uses one-to-one encoding and rejects blank Apps-in-Toss identities before storage access', () => {
    const storage = new TestStorage();
    const factory = createLocalProgressRepositoryFactory(storage);

    expect(progressStorageKeyForIdentity({ kind: 'apps-in-toss', key: 'a/b' }))
      .not.toBe(progressStorageKeyForIdentity({ kind: 'apps-in-toss', key: 'a%2Fb' }));
    expect(() => factory.forIdentity({ kind: 'apps-in-toss', key: '' })).toThrow(RangeError);
    expect(() => factory.forIdentity({ kind: 'apps-in-toss', key: '   ' })).toThrow(RangeError);
    expect(storage.reads).toEqual([]);
    expect(storage.writes).toEqual([]);
  });

  it('backs up corrupt local and Apps-in-Toss canonical values in disjoint namespaces', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    const factory = createLocalProgressRepositoryFactory(storage);
    const appsIdentity = { kind: 'apps-in-toss', key: 'user/a%' } as const;
    const appsKey = progressStorageKeyForIdentity(appsIdentity);
    const appsBackupPrefix = `te-ppu.progress.backup.identity.apps-in-toss.${encodeURIComponent(appsIdentity.key)}.`;
    storage.values.set(LOCAL_PROGRESS_KEY, '{local-broken');
    storage.values.set(appsKey, '{apps-broken');

    await factory.forIdentity({ kind: 'local', key: 'local-browser' }).load();
    await factory.forIdentity(appsIdentity).load();

    const backupWrites = storage.writes.filter(({ key }) => key.endsWith(`.${NOW}`));
    expect(backupWrites).toEqual([
      { key: `${LOCAL_BACKUP_PREFIX}${NOW}`, value: '{local-broken' },
      { key: `${appsBackupPrefix}${NOW}`, value: '{apps-broken' },
    ]);
    expect(backupWrites.every(({ key }) => !key.startsWith(LOCAL_PROGRESS_KEY))).toBe(true);
    expect(backupWrites.every(({ key }) => !key.startsWith(appsKey))).toBe(true);
  });

  it('does not let an A corruption backup overwrite another valid HASH canonical key', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    const factory = createLocalProgressRepositoryFactory(storage);
    const userA = { kind: 'apps-in-toss', key: 'user-a' } as const;
    const userB = { kind: 'apps-in-toss', key: `user-a.backup.${NOW}` } as const;
    const progressB = validProgress({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    const repositoryB = factory.forIdentity(userB);

    await repositoryB.save(progressB);
    const userBKey = progressStorageKeyForIdentity(userB);
    const userBRaw = storage.values.get(userBKey);
    storage.values.set(progressStorageKeyForIdentity(userA), '{user-a-broken');

    await expect(factory.forIdentity(userA).load()).resolves.toMatchObject({
      ok: true,
      recoveredFromCorruption: true,
    });
    expect(storage.values.get(`te-ppu.progress.backup.identity.apps-in-toss.user-a.${NOW}`))
      .toBe('{user-a-broken');
    expect(storage.values.get(userBKey)).toBe(userBRaw);
    await expect(repositoryB.load()).resolves.toMatchObject({ ok: true, state: progressB });
  });

  it('does not let Apps-in-Toss adopt unkeyed legacy progress but keeps browser legacy copy', async () => {
    const legacy = validProgress();
    const legacyRaw = JSON.stringify(legacy);
    const storage = new TestStorage();
    storage.values.set(LEGACY_PROGRESS_KEY, legacyRaw);
    const factory = createLocalProgressRepositoryFactory(storage);
    const appsIdentity = { kind: 'apps-in-toss', key: 'user-a' } as const;
    const appsKey = progressStorageKeyForIdentity(appsIdentity);

    await expect(factory.forIdentity(appsIdentity).load()).resolves.toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    });
    expect(storage.values.has(appsKey)).toBe(false);
    expect(storage.reads).toEqual([appsKey]);
    expect(storage.values.get(LEGACY_PROGRESS_KEY)).toBe(legacyRaw);

    await expect(factory.forIdentity({ kind: 'local', key: 'local-browser' }).load())
      .resolves.toMatchObject({ ok: true, state: legacy });
    expect(storage.values.get(LOCAL_PROGRESS_KEY)).toBe(legacyRaw);
    expect(storage.values.get(LEGACY_PROGRESS_KEY)).toBe(legacyRaw);
  });
});
