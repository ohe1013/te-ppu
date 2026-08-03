import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROGRESS,
  createLocalProgressRepository,
  type ProgressError,
  type ProgressLoadResult,
  type ProgressRepository,
  type ProgressSaveResult,
  type ProgressState,
} from '../../src/progression/index';

const PROGRESS_KEY = 'te-ppu.progress';
const NOW = 1_700_000_000_000;

class TestStorage {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ readonly key: string; readonly value: string }> = [];
  readError: Error | null = null;
  writeErrorFor: ((key: string) => Error | null) | null = null;

  getItem(key: string): string | null {
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
    const repository: ProgressRepository = createLocalProgressRepository(storage);
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
    const repository = createLocalProgressRepository(storage);
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
    storage.values.set(PROGRESS_KEY, JSON.stringify(saved));

    expect(await createLocalProgressRepository(storage).load()).toEqual({
      ok: true,
      state: saved,
      recoveredFromCorruption: false,
    });
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
    storage.values.set(PROGRESS_KEY, legacyV1Cleared);

    const result = await createLocalProgressRepository(storage).load();

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
      key: PROGRESS_KEY,
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
    storage.values.set(PROGRESS_KEY, legacyV1Uncleared);

    expect(await createLocalProgressRepository(storage).load()).toEqual({
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
    expect(storage.writes[0]?.key).toBe(PROGRESS_KEY);
  });

  it('returns migrated state with WRITE_FAILED when the v2 migration write fails', async () => {
    const legacyV1Cleared = JSON.stringify({
      schemaVersion: 1,
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: true },
      settings: { soundEnabled: false, hapticsEnabled: true },
    });
    const storage = new TestStorage();
    storage.values.set(PROGRESS_KEY, legacyV1Cleared);
    storage.writeErrorFor = (key) => key === PROGRESS_KEY ? new Error('canonical denied') : null;

    expect(await createLocalProgressRepository(storage).load()).toEqual({
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
    expect(storage.values.get(PROGRESS_KEY)).toBe(legacyV1Cleared);
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
    storage.values.set(PROGRESS_KEY, raw);

    expect(await createLocalProgressRepository(storage).load()).toEqual({
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: true,
    });
    expect(storage.writes).toEqual([
      { key: `te-ppu.progress.backup.${NOW}`, value: raw },
      { key: PROGRESS_KEY, value: JSON.stringify(DEFAULT_PROGRESS) },
    ]);
  });

  it('returns READ_FAILED with defaults and never writes after a read exception', async () => {
    const storage = new TestStorage();
    storage.readError = new Error('read denied');

    expect(await createLocalProgressRepository(storage).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('READ_FAILED'),
    });
    expect(storage.writes).toEqual([]);
  });

  it('returns BACKUP_FAILED without overwriting the corrupt canonical value', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    storage.values.set(PROGRESS_KEY, '{broken');
    storage.writeErrorFor = (key) => key.startsWith('te-ppu.progress.backup.')
      ? new Error('backup denied')
      : null;

    expect(await createLocalProgressRepository(storage).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('BACKUP_FAILED'),
    });
    expect(storage.values.get(PROGRESS_KEY)).toBe('{broken');
    expect(storage.writes).toEqual([]);
  });

  it('returns WRITE_FAILED when default recovery cannot replace the canonical value', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const storage = new TestStorage();
    storage.values.set(PROGRESS_KEY, '{broken');
    storage.writeErrorFor = (key) => key === PROGRESS_KEY
      ? new Error('canonical denied')
      : null;

    expect(await createLocalProgressRepository(storage).load()).toEqual({
      ok: false,
      state: DEFAULT_PROGRESS,
      error: error('WRITE_FAILED'),
    });
    expect(storage.values.get(`te-ppu.progress.backup.${NOW}`)).toBe('{broken');
    expect(storage.values.get(PROGRESS_KEY)).toBe('{broken');
  });

  it('saves valid progress exactly and does not throw on a normal write failure', async () => {
    const saved = validProgress({
      highestUnlockedFloor: 3,
      clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    const storage = new TestStorage();
    const repository = createLocalProgressRepository(storage);

    expect(await repository.save(saved)).toEqual({ ok: true });
    expect(storage.values.get(PROGRESS_KEY)).toBe(JSON.stringify(saved));

    storage.writeErrorFor = () => new Error('quota exceeded');
    expect(await repository.save(saved)).toEqual({
      ok: false,
      error: error('WRITE_FAILED'),
    });
  });
});
