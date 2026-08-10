import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGRESS,
  cloneProgressState,
  parsePersistedProgress,
  type ProgressState,
} from '../../src/progression/schema';
import {
  applyFloorResult,
  getDifficultyProgress,
} from '../../src/progression/index';

const legacyV2 = {
  schemaVersion: 2,
  highestUnlockedFloor: 4,
  clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
  settings: { soundEnabled: false, hapticsEnabled: true },
};

const version3Progress = {
  schemaVersion: 3,
  selectedDifficulty: 'easy',
  unlockedDifficulties: { easy: true, normal: false, hard: false },
  difficultyProgress: {
    easy: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
    normal: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
    hard: {
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
      owlDefeated: false,
    },
  },
  settings: { soundEnabled: true, hapticsEnabled: true },
} as const;

const currentState = {
  ...version3Progress,
  schemaVersion: 4,
  profile: null,
  localBestScores: { easy: null, normal: null, hard: null },
  pendingLeaderboardSubmissions: {},
} satisfies ProgressState;

const scoreRecord = {
  schemaVersion: 1,
  initials: 'RVT',
  characterId: 'hero-engineer',
  difficulty: 'easy',
  score: 1200,
  durationTicks: 345,
  reachedFloor: 3,
  encountersWon: 2,
  owlDefeated: false,
  achievedAt: '2026-08-09T12:00:00.000Z',
} as const;

const scoreContainers = [
  {
    name: 'local best',
    withRecord: (record: Record<string, unknown>) => ({
      ...currentState,
      localBestScores: { easy: record, normal: null, hard: null },
    }),
  },
  {
    name: 'pending leaderboard submission',
    withRecord: (record: Record<string, unknown>) => ({
      ...currentState,
      pendingLeaderboardSubmissions: { easy: record },
    }),
  },
] as const;

const invalidScoreRecords = [
  ['a negative score', { score: -1 }],
  ['a score above the maximum', { score: 10_000_001 }],
  ['a fractional score', { score: 1.5 }],
  ['a non-finite score', { score: Number.POSITIVE_INFINITY }],
  ['a negative duration', { durationTicks: -1 }],
  ['a duration above the maximum', { durationTicks: 100_000_001 }],
  ['a fractional duration', { durationTicks: 1.5 }],
  ['a non-finite duration', { durationTicks: Number.NaN }],
  ['negative encounters won', { encountersWon: -1 }],
  ['too many encounters won', { encountersWon: 17 }],
  ['fractional encounters won', { encountersWon: 1.5 }],
  ['an invalid timestamp', { achievedAt: 'not-a-date' }],
  ['a normalized impossible timestamp', { achievedAt: '2026-02-30T12:00:00.000Z' }],
  ['a non-canonical timestamp', { achievedAt: '2026-08-09T12:00:00Z' }],
  ['an owl clear below floor 5', { owlDefeated: true, reachedFloor: 4, encountersWon: 16 }],
  ['an owl clear below 16 wins', { owlDefeated: true, reachedFloor: 5, encountersWon: 15 }],
] as const;

describe('difficulty progress schema', () => {
  it('starts a new save on Easy with only Easy unlocked', () => {
    expect(DEFAULT_PROGRESS).toEqual(currentState);
  });

  it('migrates the existing five-floor v2 state into Easy', () => {
    expect(parsePersistedProgress(legacyV2)).toEqual({
      migrated: true,
      state: {
        ...currentState,
        settings: legacyV2.settings,
        difficultyProgress: {
          ...currentState.difficultyProgress,
          easy: {
            highestUnlockedFloor: 4,
            clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
            owlDefeated: false,
          },
        },
      },
    });
  });

  it('migrates schema 3 to schema 4 without changing tower progress or settings', () => {
    const parsed = parsePersistedProgress(version3Progress);

    expect(parsed?.migrated).toBe(true);
    expect(parsed?.state).toMatchObject({
      schemaVersion: 4,
      profile: null,
      localBestScores: { easy: null, normal: null, hard: null },
      pendingLeaderboardSubmissions: {},
      difficultyProgress: version3Progress.difficultyProgress,
      settings: version3Progress.settings,
    });
  });

  it('updates only the selected difficulty run', () => {
    const normal = {
      ...currentState,
      selectedDifficulty: 'normal' as const,
      unlockedDifficulties: { easy: true, normal: true, hard: false },
    };
    const next = applyFloorResult(normal, 1, 'WIN');

    expect(getDifficultyProgress(next, 'normal').clearedFloors[1]).toBe(true);
    expect(getDifficultyProgress(next, 'easy').clearedFloors[1]).toBe(false);
  });

  it('deep-clones nested difficulty progress', () => {
    const copy = cloneProgressState(currentState);
    copy.difficultyProgress.easy.clearedFloors[1] = true;
    copy.settings.soundEnabled = false;

    expect(currentState.difficultyProgress.easy.clearedFloors[1]).toBe(false);
    expect(currentState.settings.soundEnabled).toBe(true);
  });

  it('accepts exact v4 score keys and rejects extra persisted profile or score keys', () => {
    const completeState = {
      ...currentState,
      profile: { initials: 'RVT', characterId: 'hero-engineer' },
      localBestScores: { easy: scoreRecord, normal: null, hard: null },
      pendingLeaderboardSubmissions: { normal: { ...scoreRecord, difficulty: 'normal' } },
    };

    expect(parsePersistedProgress(completeState)).toMatchObject({
      migrated: false,
      state: completeState,
    });
    expect(parsePersistedProgress({
      ...completeState,
      profile: { ...completeState.profile, nickname: 'Rivet' },
    })).toBeNull();
    expect(parsePersistedProgress({
      ...completeState,
      localBestScores: {
        ...completeState.localBestScores,
        easy: { ...scoreRecord, source: 'local' },
      },
    })).toBeNull();
  });

  it('rejects a score record whose initials do not satisfy the player profile contract', () => {
    expect(parsePersistedProgress({
      ...currentState,
      localBestScores: {
        easy: { ...scoreRecord, initials: 'rvT' },
        normal: null,
        hard: null,
      },
    })).toBeNull();
  });

  it('rejects a local best score whose difficulty differs from its key', () => {
    expect(parsePersistedProgress({
      ...currentState,
      localBestScores: {
        easy: { ...scoreRecord, difficulty: 'hard' },
        normal: null,
        hard: null,
      },
    })).toBeNull();
  });

  it('rejects a pending leaderboard score whose difficulty differs from its key', () => {
    expect(parsePersistedProgress({
      ...currentState,
      pendingLeaderboardSubmissions: { normal: scoreRecord },
    })).toBeNull();
  });

  it.each(scoreContainers.flatMap((container) => (
    invalidScoreRecords.map(([name, overrides]) => (
      [container.name, name, container.withRecord, overrides] as const
    ))
  )))('rejects %s with %s', (_containerName, _invalidName, withRecord, overrides) => {
    const persisted = withRecord({ ...scoreRecord, ...overrides });

    expect(parsePersistedProgress(persisted)).toBeNull();
  });

  it.each(scoreContainers)('accepts Firestore score boundaries in $name records', ({ withRecord }) => {
    const boundaryRecords = [
      { ...scoreRecord, score: 0 },
      { ...scoreRecord, score: 10_000_000 },
      { ...scoreRecord, durationTicks: 0 },
      { ...scoreRecord, durationTicks: 100_000_000 },
      { ...scoreRecord, encountersWon: 0 },
      { ...scoreRecord, encountersWon: 16 },
      { ...scoreRecord, reachedFloor: 5, encountersWon: 16, owlDefeated: true },
    ];

    for (const record of boundaryRecords) {
      expect(parsePersistedProgress(withRecord(record))).not.toBeNull();
    }
  });

  it('deep-clones profile, score records, and pending leaderboard submissions', () => {
    const persisted = {
      ...currentState,
      profile: { initials: 'RVT', characterId: 'hero-engineer' },
      localBestScores: { easy: scoreRecord, normal: null, hard: null },
      pendingLeaderboardSubmissions: { hard: { ...scoreRecord, difficulty: 'hard' } },
    };
    const parsed = parsePersistedProgress(persisted);

    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(parsed.state).not.toBe(persisted);
    expect(parsed.state.profile).not.toBe(persisted.profile);
    expect(parsed.state.localBestScores.easy).not.toBe(persisted.localBestScores.easy);
    expect(parsed.state.pendingLeaderboardSubmissions.hard)
      .not.toBe(persisted.pendingLeaderboardSubmissions.hard);
  });
});
