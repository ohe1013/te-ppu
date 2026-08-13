import { describe, expect, it } from 'vitest';
import { TowerController } from '../../src/app/towerController';
import { createAiObservation, createMatch } from '../../src/core/index';
import type { PlayerProfile } from '../../src/player';
import {
  cloneProgressState,
  DEFAULT_PROGRESS,
  getDifficultyProgress,
  type ProgressLoadResult,
  type ProgressRepository,
  type ProgressSaveResult,
  type ProgressState,
  type ScoreRecord,
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

function progressUnlockedThrough(floor: 1 | 2 | 3 | 4 | 5): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.difficultyProgress.easy = {
    highestUnlockedFloor: floor,
    clearedFloors: {
      1: floor > 1,
      2: floor > 2,
      3: floor > 3,
      4: floor > 4,
      5: false,
    },
    owlDefeated: false,
  };
  return progress;
}

function activeProgress(progress: ProgressState) {
  return getDifficultyProgress(progress, 'easy');
}

function scoreRecord(overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    schemaVersion: 1,
    initials: 'RVT',
    characterId: 'hero-engineer',
    difficulty: 'easy',
    score: 5_000,
    durationTicks: 1_500,
    reachedFloor: 1,
    encountersWon: 3,
    owlDefeated: false,
    achievedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('tower controller', () => {
  it('stores only a better local record and queues a detached candidate by difficulty', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    const candidate = scoreRecord();

    await controller.recordScore(candidate, true);
    (candidate as { score: number }).score = 99_999;

    expect(controller.progress.localBestScores.easy).toEqual(scoreRecord());
    expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(scoreRecord());
    expect(repository.saved).toHaveLength(1);

    const exposed = controller.progress;
    (exposed.localBestScores.easy as { score: number }).score = 1;
    (exposed.pendingLeaderboardSubmissions.easy as { score: number }).score = 2;
    expect(controller.progress.localBestScores.easy?.score).toBe(5_000);
    expect(controller.progress.pendingLeaderboardSubmissions.easy?.score).toBe(5_000);

    await controller.recordScore(scoreRecord({ score: 4_999, durationTicks: 1 }), true);
    await controller.recordScore(scoreRecord(), true);
    expect(repository.saved).toHaveLength(1);
    expect(controller.progress.localBestScores.easy).toEqual(scoreRecord());
  });

  it('uses shorter duration as the local-best tie break without disturbing pending when offline', async () => {
    const initial = cloneProgressState(DEFAULT_PROGRESS);
    initial.localBestScores.easy = scoreRecord({ durationTicks: 1_600 });
    initial.pendingLeaderboardSubmissions.easy = scoreRecord({
      score: 6_000,
      durationTicks: 2_000,
      achievedAt: '2026-08-09T01:00:00.000Z',
    });
    const repository = new RecordingRepository();
    const controller = new TowerController(initial, repository);
    const faster = scoreRecord({ durationTicks: 1_500 });

    await controller.recordScore(faster, false);

    expect(controller.progress.localBestScores.easy).toEqual(faster);
    expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(
      initial.pendingLeaderboardSubmissions.easy,
    );
    expect(repository.saved).toHaveLength(1);
  });

  it('keeps a better pending candidate when an accepted local score is stale for online sync', async () => {
    const initial = cloneProgressState(DEFAULT_PROGRESS);
    initial.localBestScores.easy = scoreRecord({ score: 4_000 });
    initial.pendingLeaderboardSubmissions.easy = scoreRecord({
      score: 7_000,
      achievedAt: '2026-08-09T02:00:00.000Z',
    });
    const repository = new RecordingRepository();
    const controller = new TowerController(initial, repository);

    await controller.recordScore(scoreRecord({ score: 6_000 }), true);

    expect(controller.progress.localBestScores.easy?.score).toBe(6_000);
    expect(controller.progress.pendingLeaderboardSubmissions.easy?.score).toBe(7_000);
    expect(repository.saved[0]?.pendingLeaderboardSubmissions.easy?.score).toBe(7_000);
  });

  it('clears only the exact current pending submission and treats stale responses as no-ops', async () => {
    const current = scoreRecord();
    const initial = cloneProgressState(DEFAULT_PROGRESS);
    initial.localBestScores.easy = current;
    initial.pendingLeaderboardSubmissions.easy = current;
    const repository = new RecordingRepository();
    const controller = new TowerController(initial, repository);

    await controller.clearPendingSubmission('easy', scoreRecord({ score: 4_999 }));
    expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(current);
    expect(repository.saved).toHaveLength(0);

    const expected = scoreRecord();
    const clearing = controller.clearPendingSubmission('easy', expected);
    (expected as { score: number }).score = 1;
    await clearing;

    expect(controller.progress.pendingLeaderboardSubmissions.easy).toBeUndefined();
    expect(controller.progress.localBestScores.easy).toEqual(current);
    expect(repository.saved).toHaveLength(1);
  });

  it('does not let an overlapping stale clear erase a newer pending score', async () => {
    const initial = cloneProgressState(DEFAULT_PROGRESS);
    const firstScore = scoreRecord();
    initial.localBestScores.easy = firstScore;
    initial.pendingLeaderboardSubmissions.easy = firstScore;
    const repository = new DeferredRepository();
    const controller = new TowerController(initial, repository);

    const clear = controller.clearPendingSubmission('easy', firstScore);
    const newer = scoreRecord({
      score: 8_000,
      achievedAt: '2026-08-09T03:00:00.000Z',
    });
    const update = controller.recordScore(newer, true);
    await flushSaveQueue();
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.pendingLeaderboardSubmissions.easy).toBeUndefined();

    repository.resolveSave(0, { ok: true });
    await clear;
    await flushSaveQueue();
    expect(repository.saved).toHaveLength(2);
    expect(repository.saved[1]?.pendingLeaderboardSubmissions.easy).toEqual(newer);
    expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(newer);

    repository.resolveSave(1, { ok: true });
    await update;
    expect(controller.progress.pendingLeaderboardSubmissions.easy).toEqual(newer);
  });

  it('retries the exact detached score snapshot after persistence fails', async () => {
    const repository = new RecordingRepository([
      { ok: false, error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' } },
      { ok: true },
    ]);
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    const candidate = scoreRecord();

    expect(await controller.recordScore(candidate, true)).toEqual({
      ok: false,
      reason: 'SAVE_FAILED',
      route: 'TOWER',
    });
    (candidate as { initials: string }).initials = 'BAD';
    expect(await controller.retrySave()).toEqual({ ok: true, route: 'TOWER' });

    expect(repository.saved).toHaveLength(2);
    expect(repository.saved[1]).toEqual(repository.saved[0]);
    expect(repository.saved[1]?.localBestScores.easy).toEqual(scoreRecord());
    expect(repository.saved[1]?.pendingLeaderboardSubmissions.easy).toEqual(scoreRecord());
  });

  it('updates a profile through a cloned persisted snapshot', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    const profile: PlayerProfile = {
      initials: 'RVT',
      characterId: 'hero-engineer',
    };

    const save = controller.updateProfile(profile);
    (profile as { initials: string }).initials = 'BAD';

    expect(await save).toEqual({ ok: true, route: 'TOWER' });
    expect(controller.progress.profile).toEqual({
      initials: 'RVT',
      characterId: 'hero-engineer',
    });
    expect(repository.saved[0]?.profile).toEqual({
      initials: 'RVT',
      characterId: 'hero-engineer',
    });

    const detached = controller.progress;
    if (detached.profile === null) throw new Error('profile should be present');
    (detached.profile as { initials: string }).initials = 'LUM';
    expect(controller.progress.profile?.initials).toBe('RVT');
  });

  it('serializes overlapping profile updates and retains the latest failed snapshot for retry', async () => {
    const repository = new DeferredRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    const first = controller.updateProfile({
      initials: 'RVT',
      characterId: 'hero-engineer',
    });
    const second = controller.updateProfile({
      initials: 'LUM',
      characterId: 'cloud-courier',
    });
    await flushSaveQueue();

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.profile?.initials).toBe('RVT');
    repository.resolveSave(0, { ok: true });
    expect(await first).toEqual({ ok: true, route: 'TOWER' });
    await flushSaveQueue();

    expect(repository.saved).toHaveLength(2);
    expect(repository.saved[1]?.profile).toEqual({
      initials: 'LUM',
      characterId: 'cloud-courier',
    });
    repository.resolveSave(1, {
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    });
    expect(await second).toEqual({ ok: false, reason: 'SAVE_FAILED', route: 'TOWER' });

    const retry = controller.retrySave();
    await flushSaveQueue();
    expect(repository.saved[2]).toEqual(repository.saved[1]);
    repository.resolveSave(2, { ok: true });
    expect(await retry).toEqual({ ok: true, route: 'TOWER' });
  });

  it('requires three encounter wins and preserves the in-memory series between matches', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    const started = controller.startFloor(1, 10);
    expect(started).toMatchObject({
      ok: true,
      encounter: { index: 0, characterId: 'quartermaster' },
      series: { floor: 1, encounterIndex: 0, wins: 0 },
    });

    const first = await controller.completeEncounter('WIN');
    expect(first).toMatchObject({
      ok: true,
      route: 'FLOOR_INTRO',
      floorCompleted: false,
      series: { encounterIndex: 1, wins: 1 },
      encounter: { characterId: 'clock-moth' },
    });
    expect(repository.saved).toHaveLength(0);

    const secondMatch = controller.startEncounter(11);
    expect(secondMatch).toMatchObject({
      ok: true,
      match: { matchSeed: 11 },
      series: { encounterIndex: 1, wins: 1 },
      encounter: { index: 1, characterId: 'clock-moth' },
    });

    await controller.completeEncounter('WIN');
    expect(repository.saved).toHaveLength(0);
    const thirdMatch = controller.startEncounter(12);
    expect(thirdMatch).toMatchObject({
      ok: true,
      series: { encounterIndex: 2, wins: 2 },
      encounter: { index: 2, characterId: 'moss-golem' },
    });

    const final = await controller.completeEncounter('WIN');
    expect(final).toMatchObject({ ok: true, route: 'RESULT_WIN', floorCompleted: true });
    expect(repository.saved).toHaveLength(1);
    expect(controller.currentSeries).toBeNull();
    expect(controller.match).toBeNull();
    expect(controller.ai).toBeNull();
    expect(activeProgress(controller.progress).highestUnlockedFloor).toBe(2);
  });

  it('persists a selected unlocked difficulty and rejects locked choices', async () => {
    const locked = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    expect(await locked.selectDifficulty('normal')).toEqual({
      ok: false,
      reason: 'LOCKED_DIFFICULTY',
      route: 'TOWER',
    });

    const progress = cloneProgressState(DEFAULT_PROGRESS);
    progress.unlockedDifficulties.normal = true;
    const repository = new RecordingRepository();
    const controller = new TowerController(progress, repository);

    expect(await controller.selectDifficulty('normal')).toEqual({
      ok: true,
      route: 'TOWER',
    });
    expect(controller.progress.selectedDifficulty).toBe('normal');
    expect(repository.saved[0]?.selectedDifficulty).toBe('normal');
  });

  it('clears an intermediate series on loss without persisting unchanged progress', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    controller.startFloor(1, 10);
    await controller.completeEncounter('WIN');
    controller.startEncounter(11);

    const result = await controller.completeEncounter('LOSS');
    expect(result).toMatchObject({
      ok: true,
      route: 'RESULT_LOSS',
      floorCompleted: false,
      series: null,
    });
    expect(controller.currentSeries).toBeNull();
    expect(repository.saved).toHaveLength(0);
  });

  it('rejects locked floors and starts unlocked floors with the selected AI profile', () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);

    expect(controller.startFloor(2, 9)).toEqual({ ok: false, reason: 'LOCKED_FLOOR' });
    expect(controller.match).toBeNull();
    expect(controller.selectedFloor).toBeNull();

    const started = controller.startFloor(1, 10);
    expect(started).toMatchObject({ ok: true, match: controller.match });
    expect(controller.match).toMatchObject({ matchSeed: 10 });
    expect(controller.ai?.side).toBe('opponent');
    expect(controller.selectedFloor).toBe(1);
    expect(controller.route).toBe('MATCH');
  });

  it('rejects duplicate floor starts without replacing the live match', () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    const started = controller.startFloor(1, 10);
    if (!started.ok) throw new Error('floor 1 should start');
    const liveMatch = controller.match;
    const liveAi = controller.ai;

    expect(controller.startFloor(1, 11)).toEqual({
      ok: false,
      reason: 'MATCH_ALREADY_ACTIVE',
    });
    expect(controller.startEncounter(12)).toEqual({
      ok: false,
      reason: 'MATCH_ALREADY_ACTIVE',
    });
    expect(controller.match).toBe(liveMatch);
    expect(controller.ai).toBe(liveAi);
    expect(controller.match?.matchSeed).toBe(10);
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
      'profile',
      'localBestScores',
      'pendingLeaderboardSubmissions',
      'selectedDifficulty',
      'unlockedDifficulties',
      'difficultyProgress',
      'settings',
    ]);
    expect(repository.saved[0]).not.toHaveProperty('matchSeed');
    expect(repository.saved[0]).not.toHaveProperty('sides');
    expect(repository.saved[0]).not.toHaveProperty('board');
    expect(repository.saved[0]).not.toHaveProperty('inventory');
    expect(repository.saved[0]).not.toHaveProperty('combo');
    expect(activeProgress(controller.progress).highestUnlockedFloor)
      .toBe(result === 'WIN' ? 2 : 1);
  });

  it.each([3, 4] as const)('routes a floor %i win to the result and unlocks its successor', async (floor) => {
    const controller = new TowerController(progressUnlockedThrough(floor), new RecordingRepository());
    const started = controller.startFloor(floor, 30);
    if (!started.ok) throw new Error(`floor ${floor} should start`);

    expect(await controller.completeFloor('WIN')).toEqual({ ok: true, route: 'RESULT_WIN' });
    expect(activeProgress(controller.progress).highestUnlockedFloor).toBe(floor + 1);
    expect(activeProgress(controller.progress).clearedFloors[floor]).toBe(true);
  });

  it.each([
    { floor: 4 as const, reactionTicks: 19 },
    { floor: 5 as const, reactionTicks: 12 },
  ])('runs a real floor $floor AI update at its reaction boundary', ({ floor, reactionTicks }) => {
    const controller = new TowerController(progressUnlockedThrough(floor), new RecordingRepository());
    const started = controller.startFloor(floor, 40);
    if (!started.ok) throw new Error(`floor ${floor} should start`);
    const ai = controller.ai;
    if (ai === null) throw new Error(`floor ${floor} should create an AI controller`);
    const observation = createAiObservation(started.match, 'opponent');
    const output = Array.from(
      { length: reactionTicks },
      (_, index) => ai.update(observation, index + 1),
    );

    expect(output.slice(0, -1).flat()).toEqual([]);
    expect(output.at(-1)).toEqual(expect.any(Array));
    expect(output.at(-1)?.every(({ side, command }) => (
      side === 'opponent'
      && ['move', 'rotate-clockwise', 'hard-drop', 'use-row-clear', 'use-freeze', 'use-queue-swap']
        .includes(command.type)
    ))).toBe(true);
  });

  it('routes a floor 5 win to the ending without unlocking beyond floor 5', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(progressUnlockedThrough(5), repository);
    const started = controller.startFloor(5, 50);
    if (!started.ok) throw new Error('floor 5 should start');

    expect(await controller.completeFloor('WIN')).toEqual({ ok: true, route: 'ENDING' });
    expect(activeProgress(controller.progress)).toMatchObject({
      highestUnlockedFloor: 5,
      clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: true },
    });
    expect(repository.saved).toEqual([controller.progress]);
  });

  it('reveals and starts the hidden owl match after the floor-five boss', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(progressUnlockedThrough(5), repository);
    const started = controller.startFloor(5, 50);
    if (!started.ok) throw new Error('floor 5 should start');

    for (let index = 0; index < 3; index += 1) {
      if (index > 0) {
        const next = controller.startEncounter(50 + index);
        if (!next.ok) throw new Error('next floor encounter should start');
      }
      await controller.completeEncounter('WIN');
    }

    expect(controller.route).toBe('OWL_REVEAL');
    const owlMatch = controller.startOwlMatch(77);
    expect(owlMatch).toMatchObject({ ok: true, match: { matchSeed: 77 } });
    expect(await controller.completeOwlMatch('LOSS')).toEqual({
      ok: true,
      route: 'OWL_RESULT',
    });
    expect(controller.progress.difficultyProgress.easy.owlDefeated).toBe(false);

    expect(controller.startOwlMatch(78)).toMatchObject({ ok: true });
    expect(await controller.completeOwlMatch('WIN')).toEqual({
      ok: true,
      route: 'ENDING',
    });
    expect(controller.progress.difficultyProgress.easy.owlDefeated).toBe(true);
    expect(controller.progress.unlockedDifficulties.normal).toBe(true);
  });

  it.each([
    { floor: 3 as const, result: 'LOSS' as const, route: 'RESULT_LOSS' as const },
    { floor: 3 as const, result: 'DRAW' as const, route: 'RESULT_DRAW' as const },
    { floor: 4 as const, result: 'LOSS' as const, route: 'RESULT_LOSS' as const },
    { floor: 4 as const, result: 'DRAW' as const, route: 'RESULT_DRAW' as const },
    { floor: 5 as const, result: 'LOSS' as const, route: 'RESULT_LOSS' as const },
    { floor: 5 as const, result: 'DRAW' as const, route: 'RESULT_DRAW' as const },
  ])('does not unlock or clear floor $floor after $result', async ({ floor, result, route }) => {
    const repository = new RecordingRepository();
    const controller = new TowerController(progressUnlockedThrough(floor), repository);
    const started = controller.startFloor(floor, 30);
    if (!started.ok) throw new Error(`floor ${floor} should start`);

    expect(await controller.completeFloor(result)).toEqual({ ok: true, route });

    expect(activeProgress(controller.progress).highestUnlockedFloor).toBe(floor);
    expect(activeProgress(controller.progress).clearedFloors[floor]).toBe(false);
    expect(repository.saved).toEqual([controller.progress]);
  });

  it('returns a detached progress snapshot that cannot mutate controller state', () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    const snapshot = controller.progress;

    snapshot.difficultyProgress.easy.highestUnlockedFloor = 3;
    snapshot.difficultyProgress.easy.clearedFloors[1] = true;
    snapshot.settings.soundEnabled = false;

    expect(controller.progress).toEqual(DEFAULT_PROGRESS);
    expect(controller.startFloor(2, 20)).toEqual({ ok: false, reason: 'LOCKED_FLOOR' });
  });

  it('suspends the current opponent at the tower without saving', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(DEFAULT_PROGRESS, repository);
    controller.startFloor(1, 10);
    await controller.completeEncounter('WIN');
    controller.startEncounter(11);

    expect(controller.abandonMatch()).toEqual({
      kind: 'floor',
      series: { floor: 1, encounterIndex: 1, wins: 1 },
    });

    expect(controller.route).toBe('TOWER');
    expect(controller.selectedFloor).toBe(1);
    expect(controller.currentSeries).toEqual({ floor: 1, encounterIndex: 1, wins: 1 });
    expect(controller.suspendedBattle).toEqual({
      kind: 'floor',
      series: { floor: 1, encounterIndex: 1, wins: 1 },
    });
    expect(controller.match).toBeNull();
    expect(controller.ai).toBeNull();
    expect(repository.saved).toEqual([]);
  });

  it('returns detached suspension snapshots and consumes one on a fresh restart', async () => {
    const controller = new TowerController(DEFAULT_PROGRESS, new RecordingRepository());
    controller.startFloor(1, 10);
    await controller.completeEncounter('WIN');
    controller.startEncounter(11);
    controller.abandonMatch();

    const leaked = controller.suspendedBattle;
    if (leaked?.kind !== 'floor') throw new Error('floor battle should be suspended');
    (leaked.series as { encounterIndex: number }).encounterIndex = 2;

    expect(controller.suspendedBattle).toEqual({
      kind: 'floor',
      series: { floor: 1, encounterIndex: 1, wins: 1 },
    });
    const restarted = controller.startEncounter(12);
    expect(restarted).toMatchObject({
      ok: true,
      match: { matchSeed: 12 },
      series: { floor: 1, encounterIndex: 1, wins: 1 },
    });
    expect(controller.suspendedBattle).toBeNull();
  });

  it('suspends and freshly restarts the hidden owl battle', async () => {
    const repository = new RecordingRepository();
    const controller = new TowerController(progressUnlockedThrough(5), repository);
    controller.startFloor(5, 50);
    for (let index = 0; index < 3; index += 1) {
      if (index > 0) controller.startEncounter(50 + index);
      await controller.completeEncounter('WIN');
    }
    controller.startOwlMatch(77);
    const savedBeforeAbandon = repository.saved.length;

    expect(controller.abandonMatch()).toEqual({ kind: 'owl' });
    expect(controller.route).toBe('TOWER');
    expect(controller.suspendedBattle).toEqual({ kind: 'owl' });
    expect(controller.match).toBeNull();
    expect(controller.ai).toBeNull();
    expect(repository.saved).toHaveLength(savedBeforeAbandon);

    expect(controller.startOwlMatch(78)).toMatchObject({
      ok: true,
      match: { matchSeed: 78 },
    });
    expect(controller.suspendedBattle).toBeNull();
  });

  it('rejects completion after abandon or an already completed match', async () => {
    const abandonedRepository = new RecordingRepository();
    const abandoned = new TowerController(DEFAULT_PROGRESS, abandonedRepository);
    abandoned.startFloor(1, 10);
    abandoned.abandonMatch();

    expect(await abandoned.completeFloor('WIN')).toEqual({
      ok: false,
      reason: 'NO_ACTIVE_MATCH',
      route: 'TOWER',
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
    expect(activeProgress(controller.progress).highestUnlockedFloor).toBe(2);
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

    expect(await controller.updateSettings({ soundEnabled: false, bgmVolume: 40, sfxVolume: 80 })).toEqual({
      ok: false,
      reason: 'SAVE_FAILED',
      route: 'TOWER',
    });
    expect(controller.progress.settings).toEqual({
      soundEnabled: false,
      bgmVolume: 40,
      sfxVolume: 80,
      hapticsEnabled: true,
    });
    expect(repository.saved[0]?.settings).toEqual({
      soundEnabled: false,
      bgmVolume: 40,
      sfxVolume: 80,
      hapticsEnabled: true,
    });
    expect(await controller.retrySave()).toEqual({ ok: true, route: 'TOWER' });
    expect(repository.saved[1]).toEqual(repository.saved[0]);
  });

  it.each([
    { soundEnabled: undefined },
    { hapticsEnabled: 'yes' },
    { bgmVolume: -1 },
    { bgmVolume: 101 },
    { sfxVolume: 1.5 },
    { sfxVolume: Number.NaN },
    { unknown: true },
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
      bgmVolume: 70,
      sfxVolume: 100,
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
