import { describe, expect, it } from 'vitest';
import { TowerController } from '../../src/app/towerController';
import { createMatch } from '../../src/core/index';
import {
  DEFAULT_PROGRESS,
  type ProgressLoadResult,
  type ProgressRepository,
  type ProgressSaveResult,
  type ProgressState,
} from '../../src/progression/index';

class RecordingRepository implements ProgressRepository {
  readonly saved: ProgressState[] = [];
  readonly results: ProgressSaveResult[];

  constructor(results: readonly ProgressSaveResult[] = []) {
    this.results = [...results];
  }

  async load(): Promise<ProgressLoadResult> {
    return {
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    };
  }

  async save(state: ProgressState): Promise<ProgressSaveResult> {
    this.saved.push(structuredClone(state));
    return this.results.shift() ?? { ok: true };
  }
}

class DeferredRepository implements ProgressRepository {
  readonly saved: ProgressState[] = [];
  readonly pending: Array<(result: ProgressSaveResult) => void> = [];

  async load(): Promise<ProgressLoadResult> {
    return {
      ok: true,
      state: DEFAULT_PROGRESS,
      recoveredFromCorruption: false,
    };
  }

  save(state: ProgressState): Promise<ProgressSaveResult> {
    this.saved.push(structuredClone(state));
    return new Promise((resolve) => {
      this.pending.push(resolve);
    });
  }

  resolveSave(index: number, result: ProgressSaveResult): void {
    const resolve = this.pending[index];
    if (!resolve) throw new Error(`save ${index} is not pending`);
    resolve(result);
  }
}

async function flushSaveQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function progressUnlockedThrough(floor: ProgressState['highestUnlockedFloor']): ProgressState {
  return {
    ...DEFAULT_PROGRESS,
    highestUnlockedFloor: floor,
    clearedFloors: {
      1: floor > 1,
      2: floor > 2,
      3: floor > 3,
      4: floor > 4,
      5: false,
    },
  };
}

describe('tower controller', () => {
  it('rejects locked floors and starts unlocked floors with the selected AI profile', () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    expect(controller.startFloor(2, 9)).toEqual({ ok: false, reason: 'LOCKED_FLOOR' });
    expect(controller.match).toBeNull();
    expect(controller.selectedFloor).toBeNull();

    const started = controller.startFloor(1, 10);
    expect(started).toEqual({ ok: true, match: controller.match });
    expect(controller.match).toMatchObject({ matchSeed: 10 });
    expect(controller.ai?.side).toBe('opponent');
    expect(controller.selectedFloor).toBe(1);
    expect(controller.route).toBe('MATCH');
  });

  it('restarts with a fresh match and resets all battle-owned state', () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    const first = controller.startFloor(1, 10);
    if (!first.ok) throw new Error('floor 1 should start');
    const firstAi = controller.ai;
    const restarted = controller.restartFloor(11);
    if (!restarted.ok) throw new Error('selected floor should restart');

    expect(restarted.match).not.toBe(first.match);
    expect(restarted.match.matchSeed).toBe(11);
    expect(restarted.match).toEqual(createMatch({ matchSeed: 11 }));
    expect(controller.ai).not.toBe(firstAi);
    for (const side of ['player', 'opponent'] as const) {
      expect(restarted.match.sides[side]).toMatchObject({
        combo: 0,
        incoming: 0,
        garbageDrawIndex: 0,
        inventory: { rowClear: 0, freeze: 0, queueSwap: 0 },
      });
      expect(restarted.match.sides[side].appeared)
        .not.toBe(first.match.sides[side].appeared);
      expect(restarted.match.sides[side].board.cells.every((cell) => cell === null)).toBe(true);
    }
  });

  it('requires a selected floor before restart', () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());

    expect(controller.restartFloor(11)).toEqual({
      ok: false,
      reason: 'NO_SELECTED_FLOOR',
    });
  });

  it.each([
    { result: 'WIN' as const, route: 'RESULT_WIN' as const },
    { result: 'LOSS' as const, route: 'RESULT_LOSS' as const },
    { result: 'DRAW' as const, route: 'RESULT_DRAW' as const },
  ])('routes floor 1 $result and persists progress without battle state', async ({ result, route }) => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    controller.startFloor(1, 10);

    expect(await controller.completeFloor(result)).toEqual({ ok: true, route });
    expect(controller.route).toBe(route);
    expect(controller.match).toBeNull();
    expect(controller.ai).toBeNull();
    expect(repository.saved).toHaveLength(1);
    expect(Object.keys(repository.saved[0]!)).toEqual([
      'schemaVersion',
      'highestUnlockedFloor',
      'clearedFloors',
      'settings',
    ]);
    expect(JSON.stringify(repository.saved[0])).not.toMatch(/matchSeed|sides|board|inventory|combo/);
    expect(controller.progress.highestUnlockedFloor).toBe(result === 'WIN' ? 2 : 1);
  });

  it.each([3, 4] as const)('routes a floor %i win to the result and unlocks its successor', async (floor) => {
    const controller = new TowerController(progressUnlockedThrough(floor), new RecordingRepository());
    const started = controller.startFloor(floor, 30);
    if (!started.ok) throw new Error(`floor ${floor} should start`);

    expect(await controller.completeFloor('WIN')).toEqual({ ok: true, route: 'RESULT_WIN' });
    expect(controller.progress.highestUnlockedFloor).toBe(floor + 1);
    expect(controller.progress.clearedFloors[floor]).toBe(true);
  });

  it('routes a floor 5 win to the ending without unlocking beyond floor 5', async () => {
    const controller = new TowerController(progressUnlockedThrough(5), new RecordingRepository());
    const started = controller.startFloor(5, 50);
    if (!started.ok) throw new Error('floor 5 should start');

    expect(await controller.completeFloor('WIN')).toEqual({ ok: true, route: 'ENDING' });
    expect(controller.progress.highestUnlockedFloor).toBe(5);
  });

  it.each(['LOSS', 'DRAW'] as const)('does not unlock floor 4 after a floor 3 %s', async (result) => {
    const controller = new TowerController(progressUnlockedThrough(3), new RecordingRepository());
    const started = controller.startFloor(3, 30);
    if (!started.ok) throw new Error('floor 3 should start');

    await controller.completeFloor(result);

    expect(controller.progress.highestUnlockedFloor).toBe(3);
    expect(controller.progress.clearedFloors[3]).toBe(false);
  });

  it('returns a detached progress snapshot that cannot mutate controller state', () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    const snapshot = controller.progress;

    snapshot.highestUnlockedFloor = 3;
    snapshot.clearedFloors[1] = true;
    snapshot.settings.soundEnabled = false;

    expect(controller.progress).toEqual(DEFAULT_PROGRESS);
    expect(controller.startFloor(2, 20)).toEqual({ ok: false, reason: 'LOCKED_FLOOR' });
  });

  it('abandons only live battle state and returns to the selected floor intro', () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    controller.startFloor(1, 10);

    controller.abandonMatch();

    expect(controller.route).toBe('FLOOR_INTRO');
    expect(controller.selectedFloor).toBe(1);
    expect(controller.match).toBeNull();
    expect(controller.ai).toBeNull();
    expect(repository.saved).toEqual([]);
  });

  it('rejects completion after abandon or an already completed match', async () => {
    const abandonedRepository = new RecordingRepository();
    const abandoned = new TowerController(DEFAULT_PROGRESS, abandonedRepository);
    abandoned.startFloor(1, 10);
    abandoned.abandonMatch();

    expect(await abandoned.completeFloor('WIN')).toEqual({
      ok: false,
      reason: 'NO_ACTIVE_MATCH',
      route: 'FLOOR_INTRO',
    });
    expect(abandoned.progress).toEqual(DEFAULT_PROGRESS);
    expect(abandonedRepository.saved).toEqual([]);

    const completedRepository = new RecordingRepository();
    const completed = new TowerController(DEFAULT_PROGRESS, completedRepository);
    completed.startFloor(1, 10);
    expect(await completed.completeFloor('WIN')).toEqual({ ok: true, route: 'RESULT_WIN' });

    expect(await completed.completeFloor('WIN')).toEqual({
      ok: false,
      reason: 'NO_ACTIVE_MATCH',
      route: 'RESULT_WIN',
    });
    expect(completedRepository.saved).toHaveLength(1);
  });

  it('keeps unlocks playable in memory after save failure and retries the exact pending state', async () => {
    const repository = new RecordingRepository([
      { ok: false, error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' } },
      { ok: true },
    ]);
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    controller.startFloor(1, 10);

    expect(await controller.completeFloor('WIN')).toEqual({
      ok: false,
      reason: 'SAVE_FAILED',
      route: 'RESULT_WIN',
    });
    expect(controller.progress.highestUnlockedFloor).toBe(2);
    expect(controller.saveError).toBe('SAVE_FAILED');
    expect(controller.route).toBe('RESULT_WIN');
    expect(controller.startFloor(2, 20).ok).toBe(true);

    expect(await controller.retrySave()).toEqual({ ok: true, route: 'MATCH' });
    expect(controller.saveError).toBeNull();
    expect(controller.route).toBe('MATCH');
    expect(repository.saved[1]).toEqual(repository.saved[0]);
  });

  it('updates settings in memory before save and preserves them through failure and retry', async () => {
    const repository = new RecordingRepository([
      { ok: false, error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' } },
      { ok: true },
    ]);
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    expect(await controller.updateSettings({ soundEnabled: false })).toEqual({
      ok: false,
      reason: 'SAVE_FAILED',
      route: 'TOWER',
    });
    expect(controller.progress.settings).toEqual({
      soundEnabled: false,
      hapticsEnabled: true,
    });
    expect(await controller.retrySave()).toEqual({ ok: true, route: 'TOWER' });
    expect(repository.saved[1]).toEqual(repository.saved[0]);
  });

  it.each([
    { soundEnabled: undefined },
    { hapticsEnabled: 'yes' },
  ])('rejects invalid runtime settings without mutating or persisting them: %j', async (settings) => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    expect(await controller.updateSettings(settings as never)).toEqual({
      ok: false,
      reason: 'INVALID_SETTINGS',
      route: 'TOWER',
    });
    expect(controller.progress).toEqual(DEFAULT_PROGRESS);
    expect(repository.saved).toEqual([]);
  });

  it('serializes overlapping saves so a later success clears an earlier failure safely', async () => {
    const repository = new DeferredRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    const first = controller.updateSettings({ soundEnabled: false });
    const second = controller.updateSettings({ hapticsEnabled: false });
    await flushSaveQueue();

    expect(repository.saved).toHaveLength(1);
    repository.resolveSave(0, {
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    });
    expect(await first).toEqual({ ok: false, reason: 'SAVE_FAILED', route: 'TOWER' });
    await flushSaveQueue();

    expect(controller.saveError).toBe('SAVE_FAILED');
    expect(repository.saved).toHaveLength(2);
    expect(repository.saved[1]?.settings).toEqual({
      soundEnabled: false,
      hapticsEnabled: false,
    });

    repository.resolveSave(1, { ok: true });
    expect(await second).toEqual({ ok: true, route: 'TOWER' });
    expect(controller.saveError).toBeNull();
    expect(await controller.retrySave()).toEqual({
      ok: false,
      reason: 'NO_PENDING_SAVE',
      route: 'TOWER',
    });
  });

  it('retries the latest snapshot after the latest overlapping save fails', async () => {
    const repository = new DeferredRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    const first = controller.updateSettings({ soundEnabled: false });
    const second = controller.updateSettings({ hapticsEnabled: false });
    await flushSaveQueue();

    expect(repository.saved).toHaveLength(1);
    repository.resolveSave(0, { ok: true });
    expect(await first).toEqual({ ok: true, route: 'TOWER' });
    await flushSaveQueue();

    expect(repository.saved).toHaveLength(2);
    repository.resolveSave(1, {
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    });
    expect(await second).toEqual({ ok: false, reason: 'SAVE_FAILED', route: 'TOWER' });
    expect(controller.saveError).toBe('SAVE_FAILED');

    const retry = controller.retrySave();
    await flushSaveQueue();
    expect(repository.saved).toHaveLength(3);
    expect(repository.saved[2]).toEqual(repository.saved[1]);

    repository.resolveSave(2, { ok: true });
    expect(await retry).toEqual({ ok: true, route: 'TOWER' });
    expect(controller.saveError).toBeNull();
  });

  it('reports retry when no save is pending without writing', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    expect(await controller.retrySave()).toEqual({
      ok: false,
      reason: 'NO_PENDING_SAVE',
      route: 'TOWER',
    });
    expect(repository.saved).toEqual([]);
  });
});
