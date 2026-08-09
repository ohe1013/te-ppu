import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROGRESS,
  createLocalProgressRepository,
  type ProgressError,
  type ProgressLoadResult,
  type LocalProgressRepositoryOptions,
  type ProgressRepository,
  type ProgressSaveResult,
  type ProgressState,
} from '../../src/progression/index';

const SCOPED_KEY = 'te-ppu.progress.identity.local.local-browser';
const BACKUP_PREFIX = 'te-ppu.progress.backup.identity.local.local-browser.';
const LEGACY_KEY = 'te-ppu.progress';
const NOW = 1_700_000_000_000;
const options = {
  progressKey: SCOPED_KEY,
  backupPrefix: BACKUP_PREFIX,
  legacyReadKey: LEGACY_KEY,
} satisfies LocalProgressRepositoryOptions;
const noLegacyOptions = {
  progressKey: SCOPED_KEY,
  backupPrefix: BACKUP_PREFIX,
} satisfies LocalProgressRepositoryOptions;

class TestStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: Array<{ readonly key: string; readonly value: string }> = [];
  readError: Error | null = null;
  writeErrorFor: ((key: string) => Error | null) | null = null;

  getItem(key: string): string | null {
    this.reads.push(key);
    if (this.readError !== null) throw this.readError;
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const error = this.writeErrorFor?.(key);
    if (error !== null && error !== undefined) throw error;
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
}

function validProgress(patch: Partial<ProgressState> = {}): ProgressState {
  return {
    schemaVersion: 2,
    highestUnlockedFloor: 2,
    clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false },
    settings: { soundEnabled: false, hapticsEnabled: true },
    ...patch,
  };
}

function error(code: ProgressError['code']): ProgressError {
  if (code === 'READ_FAILED') {
    return { code, message: 'Progress could not be read.' };
  }
  if (code === 'BACKUP_FAILED') {
    return { code, message: 'Corrupt progress could not be backed up.' };
  }
  return { code, message: 'Progress could not be saved.' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('local progress repository', () => {
  it('exports the exact default and public repository contracts', async () => {
    const storage = new TestStorage();
    const repository: ProgressRepository = createLocalProgressRepository(storage, options);
    const load: ProgressLoadResult = await repository.load();
    const save: ProgressSaveResult = await repository.save(validProgress());

    expect(DEFAULT_PROGRESS).toEqual({
      schemaVersion: 2,
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      settings: { soundEnabled: true, hapticsEnabled: true },
    });
    expect(load).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    });
    expect(save).toEqual({ ok: true });
  });

  it('returns detached defaults for an empty key without writing storage', async () => {
    const storage = new TestStorage();
    const repository = createLocalProgressRepository(storage, noLegacyOptions);
    const first = await repository.load();
    const second = await repository.load();

    expect(first).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    });
    expect(second).toEqual(first);
    expect(first.ok && second.ok && first.state).not.toBe(second.state);
    expect(storage.writes).toEqual([]);
  });

  it('loads an exact valid version-2 value without rewriting it', async () => {
    const storage = new TestStorage();
    const saved = validProgress();
    storage.values.set(SCOPED_KEY, JSON.stringify(saved));

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: true,
      state: saved,
      recoveredFromCorruption: false,
    });
    expect(storage.writes).toEqual([]);
  });

  it('prefers a present scoped value and never reads or rewrites legacy', async () => {
    const scopedProgress = validProgress();
    const differentLegacyProgress = validProgress({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, JSON.stringify(scopedProgress));
    storage.values.set(LEGACY_KEY, JSON.stringify(differentLegacyProgress));

    expect(await createLocalProgressRepository(storage, options).load()).toMatchObject({
      ok: true,
      state: scopedProgress,
    });
    expect(storage.reads).toEqual([SCOPED_KEY]);
    expect(storage.writes).toEqual([]);
  });

  it('does not read a legacy key when the repository has no legacy policy', async () => {
    const storage = new TestStorage();
    storage.values.set(LEGACY_KEY, JSON.stringify(validProgress()));

    expect(await createLocalProgressRepository(storage, noLegacyOptions).load()).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    });
    expect(storage.reads).toEqual([SCOPED_KEY]);
    expect(storage.writes).toEqual([]);
  });

  it('returns defaults without writing when both scoped and browser legacy progress are absent', async () => {
    const storage = new TestStorage();

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    });
    expect(storage.reads).toEqual([SCOPED_KEY, LEGACY_KEY]);
    expect(storage.writes).toEqual([]);
  });

  it('copies valid legacy progress into an absent scoped key without deleting legacy', async () => {
    const legacyV1Progress = {
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    };
    const migratedV2Progress: ProgressState = {
      schemaVersion: 2,
      highestUnlockedFloor: 4,
      clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
      settings: { soundEnabled: false, hapticsEnabled: true },
    };
    const raw = JSON.stringify(legacyV1Progress);
    const storage = new TestStorage();
    storage.values.set(LEGACY_KEY, raw);

    const result = await createLocalProgressRepository(storage, options).load();

    expect(result).toMatchObject({ ok: true, state: migratedV2Progress });
    expect(storage.values.get(SCOPED_KEY)).toBe(JSON.stringify(migratedV2Progress));
    expect(storage.values.get(LEGACY_KEY)).toBe(raw);
  });

  it('copies raw unkeyed schema-v2 five-floor progress semantically exactly', async () => {
    const legacyV2FiveFloor = {
      schemaVersion: 2,
      highestUnlockedFloor: 5,
      clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: true },
      settings: { soundEnabled: false, hapticsEnabled: false },
    } satisfies ProgressState;
    const raw = JSON.stringify(legacyV2FiveFloor);
    const storage = new TestStorage();
    storage.values.set(LEGACY_KEY, raw);

    const result = await createLocalProgressRepository(storage, options).load();

    expect(result).toMatchObject({ ok: true, state: legacyV2FiveFloor });
    expect(JSON.parse(storage.values.get(SCOPED_KEY)!)).toEqual(legacyV2FiveFloor);
    expect(storage.values.get(LEGACY_KEY)).toBe(raw);
  });

  it('backs up corrupt legacy under the scoped prefix before writing scoped defaults', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const raw = '{broken';
    const storage = new TestStorage();
    storage.values.set(LEGACY_KEY, raw);

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: true,
    });
    expect(storage.writes).toEqual([
      { key: `${BACKUP_PREFIX}${NOW}`, value: raw },
      { key: SCOPED_KEY, value: JSON.stringify(DEFAULT_PROGRESS) },
    ]);
    expect(storage.values.get(LEGACY_KEY)).toBe(raw);
  });

  it('returns migrated legacy state with WRITE_FAILED when the scoped copy cannot be written', async () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    });
    const storage = new TestStorage();
    storage.values.set(LEGACY_KEY, raw);
    storage.writeErrorFor = (key) => key === SCOPED_KEY ? new Error('scoped denied') : null;

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: {
        schemaVersion: 2,
        highestUnlockedFloor: 4,
        clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
        settings: { soundEnabled: false, hapticsEnabled: true },
      },
      error: error('WRITE_FAILED'),
    });
    expect(storage.values.get(LEGACY_KEY)).toBe(raw);
  });

  it('does not probe legacy after a scoped read failure', async () => {
    const storage = new TestStorage();
    storage.readError = new Error('read denied');

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('READ_FAILED'),
    });
    expect(storage.reads).toEqual([SCOPED_KEY]);
  });

  it.each([
    ['blank progress key', { ...options, progressKey: '' }],
    ['blank backup prefix', { ...options, backupPrefix: '   ' }],
    ['blank legacy read key', { ...options, legacyReadKey: ' ' }],
    ['legacy key equal to scoped key', { ...options, legacyReadKey: SCOPED_KEY }],
  ] as const)('rejects a $label before reading storage', (_label, invalidOptions) => {
    const storage = new TestStorage();

    expect(() => createLocalProgressRepository(storage, invalidOptions)).toThrow();
    expect(storage.reads).toEqual([]);
    expect(storage.writes).toEqual([]);
  });

  it('migrates a cleared legacy third floor and immediately persists v2', async () => {
    const legacyV1Cleared = JSON.stringify({
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    });
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, legacyV1Cleared);

    const result = await createLocalProgressRepository(storage, options).load();

    expect(result).toEqual({
      ok: true,
      recoveredFromCorruption: false,
      state: {
        schemaVersion: 2,
        highestUnlockedFloor: 4,
        clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
        settings: { soundEnabled: false, hapticsEnabled: true },
      },
    });
    expect(storage.writes).toEqual([{
      key: SCOPED_KEY,
      value: JSON.stringify(result.ok ? result.state : undefined),
    }]);
  });

  it('migrates an uncleared legacy third floor without changing its highest unlocked floor', async () => {
    const legacyV1Uncleared = JSON.stringify({
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false },
      settings: { soundEnabled: true, hapticsEnabled: false },
    });
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, legacyV1Uncleared);

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: true,
      recoveredFromCorruption: false,
      state: {
        schemaVersion: 2,
        highestUnlockedFloor: 3,
        clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
        settings: { soundEnabled: true, hapticsEnabled: false },
      },
    });
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.key).toBe(SCOPED_KEY);
  });

  it('returns migrated state with WRITE_FAILED when the v2 migration write fails', async () => {
    const legacyV1Cleared = JSON.stringify({
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    });
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, legacyV1Cleared);
    storage.writeErrorFor = (key) => key === SCOPED_KEY ? new Error('canonical denied') : null;

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: {
        schemaVersion: 2,
        highestUnlockedFloor: 4,
        clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
        settings: { soundEnabled: false, hapticsEnabled: true },
      },
      error: error('WRITE_FAILED'),
    });
    expect(storage.writes).toEqual([]);
    expect(storage.values.get(SCOPED_KEY)).toBe(legacyV1Cleared);
  });

  it.each([
    { label: 'malformed JSON', raw: '{broken' },
    { label: 'unknown version', raw: JSON.stringify({ ...validProgress(), schemaVersion: 3 }) },
    { label: 'missing field', raw: JSON.stringify({ ...validProgress(), settings: undefined }) },
    { label: 'invalid nested field', raw: JSON.stringify({
      ...validProgress(),
      clearedFloors: { 1: true, 2: 0, 3: false, 4: false, 5: false },
    }) },
    { label: 'extra field', raw: JSON.stringify({ ...validProgress(), legacyScore: 99 }) },
    { label: 'missing v2 floor key', raw: JSON.stringify({
      ...validProgress(),
      clearedFloors: { 1: true, 2: false, 3: false, 4: false },
    }) },
    { label: 'extra v2 floor key', raw: JSON.stringify({
      ...validProgress(),
      clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false, 6: false },
    }) },
    { label: 'floor 6 highest unlock', raw: JSON.stringify({ ...validProgress(), highestUnlockedFloor: 6 }) },
    { label: 'malformed settings', raw: JSON.stringify({
      ...validProgress(),
      settings: { soundEnabled: 'yes', hapticsEnabled: true },
    }) },
  ])('backs up exact $label input before replacing it with defaults', async ({ raw }) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, raw);

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: true,
    });
    expect(storage.writes).toEqual([
      { key: `${BACKUP_PREFIX}${NOW}`, value: raw },
      { key: SCOPED_KEY, value: JSON.stringify(DEFAULT_PROGRESS) },
    ]);
  });

  it('returns READ_FAILED with defaults and never writes after a read exception', async () => {
    const storage = new TestStorage();
    storage.readError = new Error('read denied');

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('READ_FAILED'),
    });
    expect(storage.writes).toEqual([]);
  });

  it('returns BACKUP_FAILED without overwriting the corrupt canonical value', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, '{broken');
    storage.writeErrorFor = (key) => key.startsWith(BACKUP_PREFIX)
      ? new Error('backup denied')
      : null;

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('BACKUP_FAILED'),
    });
    expect(storage.values.get(SCOPED_KEY)).toBe('{broken');
    expect(storage.writes).toEqual([]);
  });

  it('returns WRITE_FAILED when default recovery cannot replace the canonical value', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    storage.values.set(SCOPED_KEY, '{broken');
    storage.writeErrorFor = (key) => key === SCOPED_KEY
      ? new Error('canonical denied')
      : null;

    expect(await createLocalProgressRepository(storage, options).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('WRITE_FAILED'),
    });
    expect(storage.values.get(`${BACKUP_PREFIX}${NOW}`)).toBe('{broken');
    expect(storage.values.get(SCOPED_KEY)).toBe('{broken');
  });

  it('saves valid progress exactly and does not throw on a normal write failure', async () => {
    const saved = validProgress({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    const storage = new TestStorage();
    const repository = createLocalProgressRepository(storage, options);

    expect(await repository.save(saved)).toEqual({ ok: true });
    expect(storage.values.get(SCOPED_KEY)).toBe(JSON.stringify(saved));
    expect(storage.writes).toEqual([{ key: SCOPED_KEY, value: JSON.stringify(saved) }]);

    storage.writeErrorFor = () => new Error('quota exceeded');
    expect(await repository.save(saved)).toEqual({
      ok: false,
      error: error('WRITE_FAILED'),
    });
  });
});
