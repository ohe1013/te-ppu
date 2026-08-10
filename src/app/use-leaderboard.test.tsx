// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  LeaderboardEntry,
  LeaderboardReadResult,
  LeaderboardRepository,
  LeaderboardWriteResult,
} from '../leaderboard';
import {
  cloneProgressState,
  DEFAULT_PROGRESS,
  type Difficulty,
  type ProgressState,
  type ScoreRecord,
} from '../progression';
import { useLeaderboard } from './use-leaderboard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function scoreRecord(
  difficulty: Difficulty,
  overrides: Partial<ScoreRecord> = {},
): ScoreRecord {
  return {
    schemaVersion: 1,
    initials: 'RVT',
    characterId: 'hero-engineer',
    difficulty,
    score: 5_000,
    durationTicks: 1_500,
    reachedFloor: 1,
    encountersWon: 3,
    owlDefeated: false,
    achievedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

function leaderboardEntry(
  difficulty: Difficulty,
  userId: string,
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  const { achievedAt: _achievedAt, ...score } = scoreRecord(difficulty, overrides);
  return {
    ...score,
    userId,
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function progressWithPending(...records: readonly ScoreRecord[]): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  for (const record of records) {
    progress.pendingLeaderboardSubmissions[record.difficulty] = { ...record };
  }
  return progress;
}

function repository(
  overrides: Partial<LeaderboardRepository> = {},
): LeaderboardRepository {
  return {
    kind: 'firestore',
    getTop: vi.fn(async (): Promise<LeaderboardReadResult> => ({
      ok: true,
      source: 'firestore',
      currentUserId: 'firebase-user',
      entries: [],
    })),
    submitBest: vi.fn(async (): Promise<LeaderboardWriteResult> => ({
      ok: true,
      source: 'firestore',
    })),
    ...overrides,
  };
}

describe('useLeaderboard reads', () => {
  it('keeps local mode local without reading, submitting, clearing, or surfacing migration pending state', async () => {
    const getTop = vi.fn<LeaderboardRepository['getTop']>();
    const submitBest = vi.fn<LeaderboardRepository['submitBest']>();
    const localRepository: LeaderboardRepository = {
      kind: 'local',
      getTop,
      submitBest,
    };
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const progress = progressWithPending(scoreRecord('easy'));
    const { result } = renderHook(() => useLeaderboard({
      repository: localRepository,
      progress,
      onClearPending,
    }));

    await act(async () => {
      await result.current.load('easy');
      await result.current.retryPending();
    });

    expect(result.current.read).toEqual({
      status: 'local',
      difficulty: 'easy',
      source: 'local',
      currentUserId: null,
      entries: [],
    });
    expect(result.current.pendingDifficulties).toEqual({
      easy: false,
      normal: false,
      hard: false,
    });
    expect(getTop).not.toHaveBeenCalled();
    expect(submitBest).not.toHaveBeenCalled();
    expect(onClearPending).not.toHaveBeenCalled();
  });

  it('lets only the latest difficulty publish success or failure and detaches repository entries', async () => {
    const requests = new Map<Difficulty, ReturnType<typeof deferred<LeaderboardReadResult>>>();
    const getTop = vi.fn((difficulty: Difficulty) => {
      const request = deferred<LeaderboardReadResult>();
      requests.set(difficulty, request);
      return request.promise;
    });
    const remote = repository({ getTop });
    const { result } = renderHook(() => useLeaderboard({
      repository: remote,
      progress: DEFAULT_PROGRESS,
      onClearPending: async () => ({ ok: true }),
    }));

    let easyLoad!: Promise<void>;
    let normalLoad!: Promise<void>;
    act(() => {
      easyLoad = result.current.load('easy');
      normalLoad = result.current.load('normal');
    });
    expect(result.current.read).toMatchObject({ status: 'loading', difficulty: 'normal' });

    await act(async () => {
      requests.get('normal')?.resolve({ ok: false, reason: 'READ_FAILED', entries: [] });
      await normalLoad;
    });
    expect(result.current.read).toMatchObject({ status: 'unavailable', difficulty: 'normal' });

    const staleEasyEntry = leaderboardEntry('easy', 'stale-user', { score: 99_000 });
    await act(async () => {
      requests.get('easy')?.resolve({
        ok: true,
        source: 'firestore',
        currentUserId: 'stale-user',
        entries: [staleEasyEntry],
      });
      await easyLoad;
    });
    expect(result.current.read).toMatchObject({ status: 'unavailable', difficulty: 'normal' });

    let secondEasyLoad!: Promise<void>;
    let hardLoad!: Promise<void>;
    act(() => {
      secondEasyLoad = result.current.load('easy');
      hardLoad = result.current.load('hard');
    });
    const hardEntry = leaderboardEntry('hard', 'hard-user', { score: 88_000 });
    await act(async () => {
      requests.get('hard')?.resolve({
        ok: true,
        source: 'firestore',
        currentUserId: 'hard-user',
        entries: [hardEntry],
      });
      await hardLoad;
    });
    (hardEntry as { score: number }).score = 1;
    expect(result.current.read).toEqual({
      status: 'ready',
      difficulty: 'hard',
      source: 'firestore',
      currentUserId: 'hard-user',
      entries: [leaderboardEntry('hard', 'hard-user', { score: 88_000 })],
    });

    await act(async () => {
      requests.get('easy')?.resolve({ ok: false, reason: 'AUTH_FAILED', entries: [] });
      await secondEasyLoad;
    });
    expect(result.current.read).toMatchObject({
      status: 'ready',
      difficulty: 'hard',
      currentUserId: 'hard-user',
    });
  });

  it.each([
    {
      label: 'success',
      staleResult: {
        ok: true,
        source: 'firestore',
        currentUserId: 'repository-a-user',
        entries: [leaderboardEntry('easy', 'repository-a-user', { score: 91_000 })],
      } satisfies LeaderboardReadResult,
    },
    {
      label: 'failure',
      staleResult: {
        ok: false,
        reason: 'READ_FAILED',
        entries: [],
      } satisfies LeaderboardReadResult,
    },
  ])('invalidates a deferred repository A $label when repository B replaces it', async ({
    staleResult,
  }) => {
    const readA = deferred<LeaderboardReadResult>();
    const readB = deferred<LeaderboardReadResult>();
    const repositoryA = repository({ getTop: vi.fn(() => readA.promise) });
    const repositoryB = repository({ getTop: vi.fn(() => readB.promise) });
    const { result, rerender } = renderHook(
      ({ activeRepository }: { activeRepository: LeaderboardRepository }) => useLeaderboard({
        repository: activeRepository,
        progress: DEFAULT_PROGRESS,
        onClearPending: async () => ({ ok: true }),
      }),
      { initialProps: { activeRepository: repositoryA } },
    );

    let staleLoad!: Promise<void>;
    act(() => {
      staleLoad = result.current.load('easy');
    });
    expect(result.current.read).toMatchObject({ status: 'loading', difficulty: 'easy' });

    rerender({ activeRepository: repositoryB });
    expect(result.current.read).toEqual({
      status: 'idle',
      difficulty: null,
      source: null,
      currentUserId: null,
      entries: [],
    });

    await act(async () => {
      readA.resolve(staleResult);
      await staleLoad;
    });
    expect(result.current.read).toEqual({
      status: 'idle',
      difficulty: null,
      source: null,
      currentUserId: null,
      entries: [],
    });

    const repositoryBEntry = leaderboardEntry('easy', 'repository-b-user', { score: 42_000 });
    let currentLoad!: Promise<void>;
    act(() => {
      currentLoad = result.current.load('easy');
    });
    await act(async () => {
      readB.resolve({
        ok: true,
        source: 'firestore',
        currentUserId: 'repository-b-user',
        entries: [repositoryBEntry],
      });
      await currentLoad;
    });

    expect(result.current.read).toEqual({
      status: 'ready',
      difficulty: 'easy',
      source: 'firestore',
      currentUserId: 'repository-b-user',
      entries: [repositoryBEntry],
    });
    expect(repositoryA.getTop).toHaveBeenCalledTimes(1);
    expect(repositoryB.getTop).toHaveBeenCalledTimes(1);
  });
});

describe('useLeaderboard pending submission queue', () => {
  it('submits detached easy, normal, and hard snapshots in order and clears each exact candidate', async () => {
    const candidates = [
      scoreRecord('easy', { score: 1_000 }),
      scoreRecord('normal', { score: 2_000 }),
      scoreRecord('hard', { score: 3_000 }),
    ] as const;
    const submitted: Array<{ difficulty: Difficulty; score: number }> = [];
    const submitBest = vi.fn(async (record: ScoreRecord): Promise<LeaderboardWriteResult> => {
      submitted.push({ difficulty: record.difficulty, score: record.score });
      (record as { score: number }).score = -1;
      return { ok: true, source: 'firestore' };
    });
    const cleared: Array<{ difficulty: Difficulty; score: number }> = [];
    const onClearPending = vi.fn(async (difficulty: Difficulty, candidate: ScoreRecord) => {
      cleared.push({ difficulty, score: candidate.score });
      (candidate as { score: number }).score = -2;
      return { ok: true as const };
    });
    const progress = progressWithPending(...candidates);
    const remote = repository({ submitBest });
    const { result } = renderHook(() => useLeaderboard({
      repository: remote,
      progress,
      onClearPending,
    }));

    await act(async () => {
      await result.current.retryPending();
    });

    expect(submitted).toEqual([
      { difficulty: 'easy', score: 1_000 },
      { difficulty: 'normal', score: 2_000 },
      { difficulty: 'hard', score: 3_000 },
    ]);
    expect(cleared).toEqual(submitted);
    expect(progress.pendingLeaderboardSubmissions).toEqual({
      easy: candidates[0],
      normal: candidates[1],
      hard: candidates[2],
    });

    await act(async () => {
      await result.current.retryPending();
    });
    expect(submitted).toHaveLength(3);
    expect(cleared).toHaveLength(3);
  });

  it.each(['AUTH_FAILED', 'WRITE_FAILED'] as const)(
    'keeps the candidate pending after %s without clearing it',
    async (reason) => {
      const candidate = scoreRecord('easy');
      const onClearPending = vi.fn(async () => ({ ok: true as const }));
      const remote = repository({
        submitBest: vi.fn(async () => ({ ok: false as const, reason })),
      });
      const { result } = renderHook(() => useLeaderboard({
        repository: remote,
        progress: progressWithPending(candidate),
        onClearPending,
      }));

      await act(async () => {
        await result.current.retryPending();
      });

      expect(onClearPending).not.toHaveBeenCalled();
      expect(result.current.pendingDifficulties.easy).toBe(true);
    },
  );

  it('coalesces duplicate retries while serializing a newer exact candidate behind the in-flight write', async () => {
    const firstWrite = deferred<LeaderboardWriteResult>();
    const oldCandidate = scoreRecord('easy', { score: 5_000 });
    const newerCandidate = scoreRecord('easy', {
      score: 8_000,
      achievedAt: '2026-08-10T00:00:00.000Z',
    });
    const submitBest = vi.fn((record: ScoreRecord) => (
      record.score === oldCandidate.score
        ? firstWrite.promise
        : Promise.resolve({ ok: true as const, source: 'firestore' as const })
    ));
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const initialProgress = progressWithPending(oldCandidate);
    const remote = repository({ submitBest });
    const { result, rerender } = renderHook(
      ({ progress }: { progress: ProgressState }) => useLeaderboard({
        repository: remote,
        progress,
        onClearPending,
      }),
      { initialProps: { progress: initialProgress } },
    );

    let firstRetry!: Promise<void>;
    let duplicateRetry!: Promise<void>;
    act(() => {
      firstRetry = result.current.retryPending();
      duplicateRetry = result.current.retryPending();
    });
    expect(submitBest).toHaveBeenCalledTimes(1);

    const updatedProgress = progressWithPending(newerCandidate);
    rerender({ progress: updatedProgress });
    let newerRetry!: Promise<void>;
    act(() => {
      newerRetry = result.current.retryPending();
    });
    expect(submitBest).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstWrite.resolve({ ok: true, source: 'firestore' });
      await Promise.all([firstRetry, duplicateRetry, newerRetry]);
    });

    expect(vi.mocked(submitBest).mock.calls.map(([candidate]) => candidate.score)).toEqual([
      5_000,
      8_000,
    ]);
    expect(vi.mocked(onClearPending).mock.calls.map(([, candidate]) => candidate.score)).toEqual([
      5_000,
      8_000,
    ]);
  });

  it('does not carry a retained repository A candidate into repository B', async () => {
    const candidate = scoreRecord('easy', { score: 1_000 });
    const submitA = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValue({ ok: false, reason: 'WRITE_FAILED' });
    const submitB = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValue({ ok: true, source: 'firestore' });
    const repositoryA = repository({ submitBest: submitA });
    const repositoryB = repository({ submitBest: submitB });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const { result, rerender } = renderHook(
      ({
        activeRepository,
        progress,
      }: {
        activeRepository: LeaderboardRepository;
        progress: ProgressState;
      }) => useLeaderboard({
        repository: activeRepository,
        progress,
        onClearPending,
      }),
      {
        initialProps: {
          activeRepository: repositoryA,
          progress: progressWithPending(candidate),
        },
      },
    );

    await act(async () => {
      await result.current.retryPending();
    });
    expect(result.current.pendingDifficulties.easy).toBe(true);

    rerender({
      activeRepository: repositoryB,
      progress: cloneProgressState(DEFAULT_PROGRESS),
    });
    await act(async () => {
      await result.current.retryPending();
    });

    expect(vi.mocked(submitA).mock.calls.map(([record]) => record.score)).toEqual([1_000]);
    expect(submitB).not.toHaveBeenCalled();
    expect(onClearPending).not.toHaveBeenCalled();
    expect(result.current.pendingDifficulties.easy).toBe(false);
  });

  it('does not carry queued or in-flight repository A candidates into repository B', async () => {
    const writeA = deferred<LeaderboardWriteResult>();
    const inFlightCandidate = scoreRecord('easy', { score: 1_000 });
    const queuedCandidate = scoreRecord('normal', { score: 1_500 });
    const submitA = vi.fn<LeaderboardRepository['submitBest']>(() => writeA.promise);
    const submitB = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValue({ ok: true, source: 'firestore' });
    const repositoryA = repository({ submitBest: submitA });
    const repositoryB = repository({ submitBest: submitB });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const { result, rerender } = renderHook(
      ({
        activeRepository,
        progress,
      }: {
        activeRepository: LeaderboardRepository;
        progress: ProgressState;
      }) => useLeaderboard({
        repository: activeRepository,
        progress,
        onClearPending,
      }),
      {
        initialProps: {
          activeRepository: repositoryA,
          progress: progressWithPending(inFlightCandidate),
        },
      },
    );

    let inFlightRetry!: Promise<void>;
    let queuedRetry!: Promise<void>;
    act(() => {
      inFlightRetry = result.current.retryPending();
      queuedRetry = result.current.submitPending('normal', queuedCandidate);
    });
    expect(vi.mocked(submitA).mock.calls.map(([record]) => ({
      difficulty: record.difficulty,
      score: record.score,
    }))).toEqual([{ difficulty: 'easy', score: 1_000 }]);

    rerender({
      activeRepository: repositoryB,
      progress: cloneProgressState(DEFAULT_PROGRESS),
    });
    await act(async () => {
      await result.current.retryPending();
    });
    await act(async () => {
      writeA.resolve({ ok: true, source: 'firestore' });
      await Promise.all([inFlightRetry, queuedRetry]);
    });

    expect(vi.mocked(submitA).mock.calls.map(([record]) => ({
      difficulty: record.difficulty,
      score: record.score,
    }))).toEqual([{ difficulty: 'easy', score: 1_000 }]);
    expect(submitB).not.toHaveBeenCalled();
    expect(onClearPending).not.toHaveBeenCalled();
    expect(result.current.pendingDifficulties).toEqual({
      easy: false,
      normal: false,
      hard: false,
    });
  });

  it('isolates repository B queue state from a deferred repository A worker', async () => {
    const writeA = deferred<LeaderboardWriteResult>();
    const writeB = deferred<LeaderboardWriteResult>();
    const oldCandidate = scoreRecord('easy', { score: 1_000 });
    const newerCandidate = scoreRecord('easy', {
      score: 2_000,
      achievedAt: '2026-08-10T00:00:00.000Z',
    });
    const submitA = vi.fn<LeaderboardRepository['submitBest']>(() => writeA.promise);
    const submitB = vi.fn<LeaderboardRepository['submitBest']>(() => writeB.promise);
    const repositoryA = repository({ submitBest: submitA });
    const repositoryB = repository({ submitBest: submitB });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const { result, rerender } = renderHook(
      ({
        activeRepository,
        progress,
      }: {
        activeRepository: LeaderboardRepository;
        progress: ProgressState;
      }) => useLeaderboard({
        repository: activeRepository,
        progress,
        onClearPending,
      }),
      {
        initialProps: {
          activeRepository: repositoryA,
          progress: progressWithPending(oldCandidate),
        },
      },
    );

    let oldRetry!: Promise<void>;
    act(() => {
      oldRetry = result.current.retryPending();
    });
    expect(vi.mocked(submitA).mock.calls.map(([candidate]) => candidate.score)).toEqual([1_000]);

    rerender({
      activeRepository: repositoryB,
      progress: progressWithPending(newerCandidate),
    });
    let newerRetry!: Promise<void>;
    act(() => {
      newerRetry = result.current.retryPending();
    });

    expect(vi.mocked(submitB).mock.calls.map(([candidate]) => candidate.score)).toEqual([2_000]);
    expect(result.current.pendingDifficulties.easy).toBe(true);

    await act(async () => {
      writeA.resolve({ ok: true, source: 'firestore' });
      await oldRetry;
    });

    expect(vi.mocked(submitA).mock.calls.map(([candidate]) => candidate.score)).toEqual([1_000]);
    expect(vi.mocked(submitB).mock.calls.map(([candidate]) => candidate.score)).toEqual([2_000]);
    expect(onClearPending).not.toHaveBeenCalled();
    expect(result.current.pendingDifficulties.easy).toBe(true);

    await act(async () => {
      writeB.resolve({ ok: true, source: 'firestore' });
      await newerRetry;
    });

    expect(vi.mocked(submitB).mock.calls.map(([candidate]) => candidate.score)).toEqual([2_000]);
    expect(vi.mocked(onClearPending).mock.calls.map(([, candidate]) => candidate.score)).toEqual([
      2_000,
    ]);
    expect(result.current.pendingDifficulties.easy).toBe(false);

    await act(async () => {
      await result.current.retryPending();
    });
    expect(vi.mocked(submitB).mock.calls.map(([candidate]) => candidate.score)).toEqual([2_000]);
  });

  it('discards a failed 1000 retry after a newer 2000 candidate synchronizes', async () => {
    const olderCandidate = scoreRecord('easy', { score: 1_000 });
    const newerCandidate = scoreRecord('easy', {
      score: 2_000,
      achievedAt: '2026-08-10T00:00:00.000Z',
    });
    const submitBest = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValueOnce({ ok: false, reason: 'WRITE_FAILED' })
      .mockResolvedValue({ ok: true, source: 'firestore' });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const remote = repository({ submitBest });
    const { result, rerender } = renderHook(
      ({ progress }: { progress: ProgressState }) => useLeaderboard({
        repository: remote,
        progress,
        onClearPending,
      }),
      { initialProps: { progress: progressWithPending(olderCandidate) } },
    );

    await act(async () => {
      await result.current.retryPending();
    });
    expect(result.current.pendingDifficulties.easy).toBe(true);

    await act(async () => {
      await result.current.submitPending('easy', newerCandidate);
    });
    rerender({ progress: cloneProgressState(DEFAULT_PROGRESS) });
    await act(async () => {
      await result.current.retryPending();
    });

    expect(vi.mocked(submitBest).mock.calls.map(([candidate]) => candidate.score)).toEqual([
      1_000,
      2_000,
    ]);
    expect(vi.mocked(onClearPending).mock.calls.map(([, candidate]) => candidate.score)).toEqual([
      2_000,
    ]);
    expect(result.current.pendingDifficulties.easy).toBe(false);
  });

  it('discards a failed 1000 retry after the same user changes profile and syncs 2000', async () => {
    const olderCandidate = scoreRecord('easy', {
      initials: 'RVT',
      characterId: 'hero-engineer',
      score: 1_000,
    });
    const newerCandidate = scoreRecord('easy', {
      initials: 'NEW',
      characterId: 'cloud-courier',
      score: 2_000,
      achievedAt: '2026-08-10T00:00:00.000Z',
    });
    const submitBest = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValueOnce({ ok: false, reason: 'WRITE_FAILED' })
      .mockResolvedValue({ ok: true, source: 'firestore' });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const remote = repository({ submitBest });
    const { result, rerender } = renderHook(
      ({ progress }: { progress: ProgressState }) => useLeaderboard({
        repository: remote,
        progress,
        onClearPending,
      }),
      { initialProps: { progress: progressWithPending(olderCandidate) } },
    );

    await act(async () => {
      await result.current.retryPending();
      await result.current.submitPending('easy', newerCandidate);
    });
    rerender({ progress: cloneProgressState(DEFAULT_PROGRESS) });
    await act(async () => {
      await result.current.retryPending();
    });

    expect(vi.mocked(submitBest).mock.calls.map(([candidate]) => ({
      score: candidate.score,
      initials: candidate.initials,
      characterId: candidate.characterId,
    }))).toEqual([
      { score: 1_000, initials: 'RVT', characterId: 'hero-engineer' },
      { score: 2_000, initials: 'NEW', characterId: 'cloud-courier' },
    ]);
    expect(vi.mocked(onClearPending).mock.calls.map(([, candidate]) => ({
      score: candidate.score,
      initials: candidate.initials,
      characterId: candidate.characterId,
    }))).toEqual([
      { score: 2_000, initials: 'NEW', characterId: 'cloud-courier' },
    ]);
    expect(result.current.pendingDifficulties.easy).toBe(false);
  });

  it('keeps a failed 2000 retry when an older 1000 candidate synchronizes', async () => {
    const newerCandidate = scoreRecord('easy', { score: 2_000 });
    const olderCandidate = scoreRecord('easy', {
      score: 1_000,
      achievedAt: '2026-08-10T00:00:00.000Z',
    });
    const submitBest = vi.fn<LeaderboardRepository['submitBest']>()
      .mockResolvedValueOnce({ ok: false, reason: 'WRITE_FAILED' })
      .mockResolvedValue({ ok: true, source: 'firestore' });
    const onClearPending = vi.fn(async (
      _difficulty: Difficulty,
      _candidate: ScoreRecord,
    ) => ({ ok: true as const }));
    const remote = repository({ submitBest });
    const { result } = renderHook(() => useLeaderboard({
      repository: remote,
      progress: progressWithPending(newerCandidate),
      onClearPending,
    }));

    await act(async () => {
      await result.current.retryPending();
      await result.current.submitPending('easy', olderCandidate);
    });
    expect(result.current.pendingDifficulties.easy).toBe(true);

    await act(async () => {
      await result.current.retryPending();
    });

    expect(vi.mocked(submitBest).mock.calls.map(([candidate]) => candidate.score)).toEqual([
      2_000,
      1_000,
      2_000,
    ]);
    expect(vi.mocked(onClearPending).mock.calls.map(([, candidate]) => candidate.score)).toEqual([
      1_000,
      2_000,
    ]);
    expect(result.current.pendingDifficulties.easy).toBe(false);
  });

  it('retains a remotely written candidate until its local clear saves successfully', async () => {
    const candidate = scoreRecord('easy');
    const submitBest = vi.fn(async () => ({ ok: true as const, source: 'firestore' as const }));
    const onClearPending = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const initialProgress = progressWithPending(candidate);
    const remote = repository({ submitBest });
    const { result, rerender } = renderHook(
      ({ progress }: { progress: ProgressState }) => useLeaderboard({
        repository: remote,
        progress,
        onClearPending,
      }),
      { initialProps: { progress: initialProgress } },
    );

    await act(async () => {
      await result.current.retryPending();
    });
    expect(result.current.pendingDifficulties.easy).toBe(true);

    rerender({ progress: cloneProgressState(DEFAULT_PROGRESS) });
    expect(result.current.pendingDifficulties.easy).toBe(true);

    await act(async () => {
      await result.current.retryPending();
    });

    expect(submitBest).toHaveBeenCalledTimes(2);
    expect(onClearPending).toHaveBeenCalledTimes(2);
    expect(result.current.pendingDifficulties.easy).toBe(false);
  });
});
