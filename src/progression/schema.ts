import {
  PLAYER_INITIALS_PATTERN,
  isPlayerCharacterId,
  isPlayerProfile,
  type PlayerCharacterId,
  type PlayerProfile,
} from '../player';
import { type ClearedFloors, isFloor, type Floor } from './floors';
import {
  createDifficultyProgressMap,
  DIFFICULTIES,
  isDifficulty,
  type Difficulty,
  type DifficultyProgressMap,
  type DifficultyRunProgress,
} from './difficulty';

export interface ScoreRecord {
  readonly schemaVersion: 1;
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly achievedAt: string;
}

export type LocalBestScores = Record<Difficulty, ScoreRecord | null>;
export type PendingLeaderboardSubmissions = Partial<Record<Difficulty, ScoreRecord>>;

export interface ProgressState {
  schemaVersion: 4;
  profile: PlayerProfile | null;
  localBestScores: LocalBestScores;
  pendingLeaderboardSubmissions: PendingLeaderboardSubmissions;
  selectedDifficulty: Difficulty;
  unlockedDifficulties: Record<Difficulty, boolean>;
  difficultyProgress: DifficultyProgressMap;
  settings: { soundEnabled: boolean; hapticsEnabled: boolean };
}

interface LegacyProgressState {
  readonly schemaVersion: 1;
  readonly highestUnlockedFloor: 1 | 2 | 3;
  readonly clearedFloors: { readonly 1: boolean; readonly 2: boolean; readonly 3: boolean };
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
}

interface Version2ProgressState {
  readonly schemaVersion: 2;
  readonly highestUnlockedFloor: 1 | 2 | 3 | 4 | 5;
  readonly clearedFloors: ClearedFloors;
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
}

interface Version3ProgressState {
  readonly schemaVersion: 3;
  readonly selectedDifficulty: Difficulty;
  readonly unlockedDifficulties: Record<Difficulty, boolean>;
  readonly difficultyProgress: DifficultyProgressMap;
  readonly settings: { readonly soundEnabled: boolean; readonly hapticsEnabled: boolean };
}

export interface ParsedProgress {
  readonly state: ProgressState;
  readonly migrated: boolean;
}

export type ProgressError =
  | { code: 'READ_FAILED'; message: 'Progress could not be read.' }
  | { code: 'BACKUP_FAILED'; message: 'Corrupt progress could not be backed up.' }
  | { code: 'WRITE_FAILED'; message: 'Progress could not be saved.' };

export type ProgressLoadResult =
  | { ok: true; state: ProgressState; recoveredFromCorruption: boolean }
  | { ok: false; state: ProgressState; error: ProgressError };

export type ProgressSaveResult =
  | { ok: true }
  | { ok: false; error: ProgressError };

export interface ProgressRepository {
  load(): Promise<ProgressLoadResult>;
  save(state: ProgressState): Promise<ProgressSaveResult>;
}

function cloneDifficultyRun(run: DifficultyRunProgress): DifficultyRunProgress {
  return {
    highestUnlockedFloor: run.highestUnlockedFloor,
    clearedFloors: { ...run.clearedFloors },
    owlDefeated: run.owlDefeated,
  };
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return { initials: profile.initials, characterId: profile.characterId };
}

function cloneScoreRecord(score: ScoreRecord): ScoreRecord {
  return { ...score };
}

function createEmptyLocalBestScores(): LocalBestScores {
  return { easy: null, normal: null, hard: null };
}

export const DEFAULT_PROGRESS: ProgressState = {
  schemaVersion: 4,
  profile: null,
  localBestScores: createEmptyLocalBestScores(),
  pendingLeaderboardSubmissions: {},
  selectedDifficulty: 'easy',
  unlockedDifficulties: { easy: true, normal: false, hard: false },
  difficultyProgress: createDifficultyProgressMap(),
  settings: { soundEnabled: true, hapticsEnabled: true },
};

export function cloneProgressState(state: ProgressState): ProgressState {
  return {
    schemaVersion: 4,
    profile: state.profile === null ? null : cloneProfile(state.profile),
    localBestScores: {
      easy: state.localBestScores.easy === null ? null : cloneScoreRecord(state.localBestScores.easy),
      normal: state.localBestScores.normal === null ? null : cloneScoreRecord(state.localBestScores.normal),
      hard: state.localBestScores.hard === null ? null : cloneScoreRecord(state.localBestScores.hard),
    },
    pendingLeaderboardSubmissions: Object.fromEntries(
      Object.entries(state.pendingLeaderboardSubmissions)
        .map(([difficulty, score]) => [difficulty, cloneScoreRecord(score)]),
    ) as PendingLeaderboardSubmissions,
    selectedDifficulty: state.selectedDifficulty,
    unlockedDifficulties: { ...state.unlockedDifficulties },
    difficultyProgress: {
      easy: cloneDifficultyRun(state.difficultyProgress.easy),
      normal: cloneDifficultyRun(state.difficultyProgress.normal),
      hard: cloneDifficultyRun(state.difficultyProgress.hard),
    },
    settings: { ...state.settings },
  };
}

function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isSettings(value: unknown): value is ProgressState['settings'] {
  return exactObject(value, ['soundEnabled', 'hapticsEnabled'])
    && typeof value.soundEnabled === 'boolean'
    && typeof value.hapticsEnabled === 'boolean';
}

function isClearedFloors(value: unknown): value is ClearedFloors {
  return exactObject(value, ['1', '2', '3', '4', '5'])
    && typeof value[1] === 'boolean'
    && typeof value[2] === 'boolean'
    && typeof value[3] === 'boolean'
    && typeof value[4] === 'boolean'
    && typeof value[5] === 'boolean';
}

function parseLegacyProgress(value: unknown): LegacyProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'highestUnlockedFloor',
    'clearedFloors',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 1) return null;
  if (
    value.highestUnlockedFloor !== 1
    && value.highestUnlockedFloor !== 2
    && value.highestUnlockedFloor !== 3
  ) return null;
  if (!exactObject(value.clearedFloors, ['1', '2', '3'])) return null;
  if (
    typeof value.clearedFloors[1] !== 'boolean'
    || typeof value.clearedFloors[2] !== 'boolean'
    || typeof value.clearedFloors[3] !== 'boolean'
  ) return null;
  if (!isSettings(value.settings)) return null;

  return {
    schemaVersion: 1,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: {
      1: value.clearedFloors[1],
      2: value.clearedFloors[2],
      3: value.clearedFloors[3],
    },
    settings: { ...value.settings },
  };
}

function parseVersion2Progress(value: unknown): Version2ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'highestUnlockedFloor',
    'clearedFloors',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 2 || !isFloor(value.highestUnlockedFloor)) return null;
  if (!isClearedFloors(value.clearedFloors) || !isSettings(value.settings)) return null;

  return {
    schemaVersion: 2,
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: { ...value.clearedFloors },
    settings: { ...value.settings },
  };
}

function parseDifficultyRun(value: unknown): DifficultyRunProgress | null {
  if (!exactObject(value, ['highestUnlockedFloor', 'clearedFloors', 'owlDefeated'])) {
    return null;
  }
  if (!isFloor(value.highestUnlockedFloor)) return null;
  if (!isClearedFloors(value.clearedFloors)) return null;
  if (typeof value.owlDefeated !== 'boolean') return null;
  return {
    highestUnlockedFloor: value.highestUnlockedFloor,
    clearedFloors: { ...value.clearedFloors },
    owlDefeated: value.owlDefeated,
  };
}

function parseDifficultyProgress(value: unknown): DifficultyProgressMap | null {
  if (!exactObject(value, DIFFICULTIES)) return null;
  const parsed = DIFFICULTIES.map((difficulty) => [
    difficulty,
    parseDifficultyRun(value[difficulty]),
  ] as const);
  if (parsed.some(([, run]) => run === null)) return null;
  return Object.fromEntries(parsed) as DifficultyProgressMap;
}

function isUnlockedDifficulties(
  value: unknown,
): value is Record<Difficulty, boolean> {
  return exactObject(value, DIFFICULTIES)
    && DIFFICULTIES.every((difficulty) => typeof value[difficulty] === 'boolean');
}

function isBoundedSafeInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= maximum;
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function parseScoreRecord(value: unknown): ScoreRecord | null {
  if (!exactObject(value, [
    'schemaVersion',
    'initials',
    'characterId',
    'difficulty',
    'score',
    'durationTicks',
    'reachedFloor',
    'encountersWon',
    'owlDefeated',
    'achievedAt',
  ])) return null;
  if (value.schemaVersion !== 1) return null;
  if (
    typeof value.initials !== 'string'
    || !PLAYER_INITIALS_PATTERN.test(value.initials)
    || !isPlayerCharacterId(value.characterId)
  ) return null;
  if (!isDifficulty(value.difficulty) || !isFloor(value.reachedFloor)) return null;
  if (
    !isBoundedSafeInteger(value.score, 10_000_000)
    || !isBoundedSafeInteger(value.durationTicks, 100_000_000)
    || !isBoundedSafeInteger(value.encountersWon, 16)
    || typeof value.owlDefeated !== 'boolean'
    || !isCanonicalIsoTimestamp(value.achievedAt)
  ) return null;
  if (value.owlDefeated && (value.reachedFloor !== 5 || value.encountersWon !== 16)) return null;

  return {
    schemaVersion: 1,
    initials: value.initials,
    characterId: value.characterId,
    difficulty: value.difficulty,
    score: value.score,
    durationTicks: value.durationTicks,
    reachedFloor: value.reachedFloor,
    encountersWon: value.encountersWon,
    owlDefeated: value.owlDefeated,
    achievedAt: value.achievedAt,
  };
}

function parseLocalBestScores(value: unknown): LocalBestScores | null {
  if (!exactObject(value, DIFFICULTIES)) return null;
  const parsed = DIFFICULTIES.map((difficulty) => {
    const score = value[difficulty] === null ? null : parseScoreRecord(value[difficulty]);
    return [difficulty, score] as const;
  });
  if (parsed.some(([difficulty, score]) => (
    score === null ? value[difficulty] !== null : score.difficulty !== difficulty
  ))) return null;
  return Object.fromEntries(parsed) as LocalBestScores;
}

function parsePendingLeaderboardSubmissions(value: unknown): PendingLeaderboardSubmissions | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([difficulty]) => !isDifficulty(difficulty))) return null;
  const parsed = entries.map(([difficulty, score]) => [difficulty, parseScoreRecord(score)] as const);
  if (parsed.some(([difficulty, score]) => score === null || score.difficulty !== difficulty)) {
    return null;
  }
  return Object.fromEntries(parsed) as PendingLeaderboardSubmissions;
}

function parseVersion3Progress(value: unknown): Version3ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'selectedDifficulty',
    'unlockedDifficulties',
    'difficultyProgress',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 3 || !isDifficulty(value.selectedDifficulty)) return null;
  if (!isUnlockedDifficulties(value.unlockedDifficulties)) return null;
  if (!value.unlockedDifficulties[value.selectedDifficulty]) return null;
  const difficultyProgress = parseDifficultyProgress(value.difficultyProgress);
  if (difficultyProgress === null || !isSettings(value.settings)) return null;
  if (!value.unlockedDifficulties.easy) return null;
  return {
    schemaVersion: 3,
    selectedDifficulty: value.selectedDifficulty,
    unlockedDifficulties: { ...value.unlockedDifficulties },
    difficultyProgress,
    settings: { ...value.settings },
  };
}

function parseVersion4Progress(value: unknown): ProgressState | null {
  if (!exactObject(value, [
    'schemaVersion',
    'profile',
    'localBestScores',
    'pendingLeaderboardSubmissions',
    'selectedDifficulty',
    'unlockedDifficulties',
    'difficultyProgress',
    'settings',
  ])) return null;
  if (value.schemaVersion !== 4 || !isDifficulty(value.selectedDifficulty)) return null;
  if (value.profile !== null && !isPlayerProfile(value.profile)) return null;
  const localBestScores = parseLocalBestScores(value.localBestScores);
  const pendingLeaderboardSubmissions = parsePendingLeaderboardSubmissions(
    value.pendingLeaderboardSubmissions,
  );
  if (localBestScores === null || pendingLeaderboardSubmissions === null) return null;
  if (!isUnlockedDifficulties(value.unlockedDifficulties)) return null;
  if (!value.unlockedDifficulties[value.selectedDifficulty]) return null;
  const difficultyProgress = parseDifficultyProgress(value.difficultyProgress);
  if (difficultyProgress === null || !isSettings(value.settings)) return null;
  if (!value.unlockedDifficulties.easy) return null;

  return {
    schemaVersion: 4,
    profile: value.profile === null ? null : cloneProfile(value.profile),
    localBestScores,
    pendingLeaderboardSubmissions,
    selectedDifficulty: value.selectedDifficulty,
    unlockedDifficulties: { ...value.unlockedDifficulties },
    difficultyProgress,
    settings: { ...value.settings },
  };
}

function migrateVersion3(state: Version3ProgressState): ProgressState {
  return {
    schemaVersion: 4,
    profile: null,
    localBestScores: createEmptyLocalBestScores(),
    pendingLeaderboardSubmissions: {},
    selectedDifficulty: state.selectedDifficulty,
    unlockedDifficulties: { ...state.unlockedDifficulties },
    difficultyProgress: {
      easy: cloneDifficultyRun(state.difficultyProgress.easy),
      normal: cloneDifficultyRun(state.difficultyProgress.normal),
      hard: cloneDifficultyRun(state.difficultyProgress.hard),
    },
    settings: { ...state.settings },
  };
}

function migrateVersion2(state: Version2ProgressState): Version3ProgressState {
  const difficultyProgress = createDifficultyProgressMap();
  difficultyProgress.easy = {
    highestUnlockedFloor: state.highestUnlockedFloor,
    clearedFloors: { ...state.clearedFloors },
    owlDefeated: false,
  };
  return {
    schemaVersion: 3,
    selectedDifficulty: 'easy',
    unlockedDifficulties: { easy: true, normal: false, hard: false },
    difficultyProgress,
    settings: { ...state.settings },
  };
}

function migrateLegacy(state: LegacyProgressState): Version2ProgressState {
  return {
    schemaVersion: 2,
    highestUnlockedFloor: state.clearedFloors[3] ? 4 : state.highestUnlockedFloor,
    clearedFloors: {
      1: state.clearedFloors[1],
      2: state.clearedFloors[2],
      3: state.clearedFloors[3],
      4: false,
      5: false,
    },
    settings: { ...state.settings },
  };
}

export function parsePersistedProgress(value: unknown): ParsedProgress | null {
  const version4 = parseVersion4Progress(value);
  if (version4 !== null) return { state: version4, migrated: false };

  const version3 = parseVersion3Progress(value);
  if (version3 !== null) return { state: migrateVersion3(version3), migrated: true };

  const version2 = parseVersion2Progress(value);
  if (version2 !== null) return { state: migrateVersion3(migrateVersion2(version2)), migrated: true };

  const legacy = parseLegacyProgress(value);
  if (legacy === null) return null;
  return { state: migrateVersion3(migrateVersion2(migrateLegacy(legacy))), migrated: true };
}

export function parseProgressState(value: unknown): ProgressState | null {
  return parsePersistedProgress(value)?.state ?? null;
}
