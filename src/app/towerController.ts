import { createAiController, getAiFloorProfile, type AiController } from '../ai/index';
import {
  RandomStream,
  counterU32,
  createMatch,
  type MatchState,
} from '../core/index';
import {
  applyFloorResult,
  canSelectDifficulty,
  canSelectFloor,
  cloneProgressState,
  getFloorEncounter,
  isFinalFloor,
  isDifficulty,
  nextDifficulty,
  resolveEncounter,
  startFloorSeries,
  type Floor,
  type FloorEncounter,
  type FloorResult,
  type FloorSeriesState,
  type ProgressRepository,
  type ProgressState,
  type ScoreRecord,
} from '../progression/index';
import type { PlayerProfile } from '../player';
import { isBetterScore } from '../scoring';

export type TowerRoute =
  | 'TOWER'
  | 'FLOOR_INTRO'
  | 'MATCH'
  | 'RESULT_WIN'
  | 'RESULT_LOSS'
  | 'RESULT_DRAW'
  | 'OWL_REVEAL'
  | 'OWL_MATCH'
  | 'OWL_RESULT'
  | 'ENDING';

export type SuspendedBattle =
  | { readonly kind: 'floor'; readonly series: FloorSeriesState }
  | { readonly kind: 'owl' };

export type StartFloorResult =
  | {
      readonly ok: true;
      readonly match: MatchState;
      readonly encounter: FloorEncounter;
      readonly series: FloorSeriesState;
    }
  | { readonly ok: false; readonly reason: 'LOCKED_FLOOR' | 'NO_SELECTED_FLOOR' };

export type StartEncounterResult =
  | {
      readonly ok: true;
      readonly match: MatchState;
      readonly encounter: FloorEncounter;
      readonly series: FloorSeriesState;
    }
  | {
      readonly ok: false;
      readonly reason: 'NO_SELECTED_FLOOR' | 'NO_ACTIVE_SERIES';
  };

export type StartOwlMatchResult =
  | { readonly ok: true; readonly match: MatchState }
  | { readonly ok: false; readonly reason: 'NO_OWL_REVEAL' };

export type TowerSaveResult =
  | { readonly ok: true; readonly route: TowerRoute }
  | {
      readonly ok: false;
      readonly reason:
        | 'SAVE_FAILED'
        | 'NO_PENDING_SAVE'
        | 'NO_SELECTED_FLOOR'
        | 'NO_ACTIVE_MATCH'
        | 'LOCKED_DIFFICULTY'
        | 'INVALID_SETTINGS';
      readonly route: TowerRoute;
    };

function cloneProgress(state: ProgressState): ProgressState {
  return cloneProgressState(state);
}

function sameScoreRecord(left: ScoreRecord, right: ScoreRecord): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.initials === right.initials
    && left.characterId === right.characterId
    && left.difficulty === right.difficulty
    && left.score === right.score
    && left.durationTicks === right.durationTicks
    && left.reachedFloor === right.reachedFloor
    && left.encountersWon === right.encountersWon
    && left.owlDefeated === right.owlDefeated
    && left.achievedAt === right.achievedAt;
}

export type CompleteEncounterResult =
  | ({
      readonly ok: true;
      readonly encounter: FloorEncounter;
      readonly series: FloorSeriesState | null;
      readonly floorCompleted: boolean;
    } & Extract<TowerSaveResult, { readonly ok: true }>)
  | ({
      readonly ok: false;
      readonly encounter: FloorEncounter | null;
      readonly series: FloorSeriesState | null;
      readonly floorCompleted: boolean;
    } & Extract<TowerSaveResult, { readonly ok: false }>);

function routeFor(floor: Floor, result: FloorResult): TowerRoute {
  if (result === 'LOSS') return 'RESULT_LOSS';
  if (result === 'DRAW') return 'RESULT_DRAW';
  return isFinalFloor(floor) ? 'ENDING' : 'RESULT_WIN';
}

function deriveAiSeed(matchSeed: number): number {
  return counterU32(matchSeed, RandomStream.AI_MISTAKE, 1);
}

function isSettingsUpdate(
  settings: Partial<ProgressState['settings']>,
): boolean {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    return false;
  }

  return Object.entries(settings).every(([key, value]) => (
    ((key === 'soundEnabled' || key === 'hapticsEnabled') && typeof value === 'boolean')
    || ((key === 'bgmVolume' || key === 'sfxVolume') && isVolume(value))
  ));
}

function isVolume(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100;
}

export class TowerController {
  private currentProgress: ProgressState;
  private currentSelectedFloor: Floor | null = null;
  private currentSeriesState: FloorSeriesState | null = null;
  private currentMatch: MatchState | null = null;
  private currentAi: AiController | null = null;
  private currentSuspendedBattle: SuspendedBattle | null = null;
  private currentRoute: TowerRoute = 'TOWER';
  private currentSaveError: 'SAVE_FAILED' | null = null;
  private pendingSave: ProgressState | null = null;
  private saveTail: Promise<void> = Promise.resolve();

  constructor(
    progress: ProgressState,
    private readonly repository: ProgressRepository,
  ) {
    this.currentProgress = cloneProgress(progress);
  }

  get progress(): ProgressState {
    return cloneProgress(this.currentProgress);
  }

  get selectedFloor(): Floor | null {
    return this.currentSelectedFloor;
  }

  get match(): MatchState | null {
    return this.currentMatch;
  }

  get currentSeries(): FloorSeriesState | null {
    return this.currentSeriesState === null ? null : { ...this.currentSeriesState };
  }

  get currentEncounter(): FloorEncounter | null {
    const series = this.currentSeriesState;
    return series === null ? null : getFloorEncounter(series.floor, series.encounterIndex);
  }

  get ai(): AiController | null {
    return this.currentAi;
  }

  get suspendedBattle(): SuspendedBattle | null {
    const suspended = this.currentSuspendedBattle;
    return suspended?.kind === 'floor'
      ? { kind: 'floor', series: { ...suspended.series } }
      : suspended;
  }

  get route(): TowerRoute {
    return this.currentRoute;
  }

  get saveError(): 'SAVE_FAILED' | null {
    return this.currentSaveError;
  }

  startFloor(floor: Floor, matchSeed: number): StartFloorResult {
    if (!canSelectFloor(this.currentProgress, floor)) {
      return { ok: false, reason: 'LOCKED_FLOOR' };
    }
    this.currentSuspendedBattle = null;
    this.currentSelectedFloor = floor;
    this.currentSeriesState = startFloorSeries(floor);
    const started = this.startEncounter(matchSeed);
    if (!started.ok) return { ok: false, reason: 'NO_SELECTED_FLOOR' };
    return started;
  }

  startEncounter(matchSeed: number): StartEncounterResult {
    const floor = this.currentSelectedFloor;
    const series = this.currentSeriesState;
    if (floor === null) return { ok: false, reason: 'NO_SELECTED_FLOOR' };
    if (series === null || series.floor !== floor) {
      return { ok: false, reason: 'NO_ACTIVE_SERIES' };
    }

    this.currentMatch = createMatch({ matchSeed });
    this.currentAi = createAiController(
      getAiFloorProfile(floor, this.currentProgress.selectedDifficulty),
      deriveAiSeed(matchSeed),
      'opponent',
    );
    this.currentSuspendedBattle = null;
    this.currentRoute = 'MATCH';
    return {
      ok: true,
      match: this.currentMatch,
      encounter: getFloorEncounter(series.floor, series.encounterIndex),
      series: { ...series },
    };
  }

  restartFloor(matchSeed: number): StartFloorResult {
    if (this.currentSelectedFloor === null) {
      return { ok: false, reason: 'NO_SELECTED_FLOOR' };
    }
    return this.startFloor(this.currentSelectedFloor, matchSeed);
  }

  startOwlMatch(matchSeed: number): StartOwlMatchResult {
    const resumesSuspendedOwl = this.currentRoute === 'TOWER'
      && this.currentSuspendedBattle?.kind === 'owl';
    if (
      this.currentRoute !== 'OWL_REVEAL'
      && this.currentRoute !== 'OWL_RESULT'
      && !resumesSuspendedOwl
    ) {
      return { ok: false, reason: 'NO_OWL_REVEAL' };
    }
    this.currentMatch = createMatch({ matchSeed });
    this.currentAi = createAiController(
      getAiFloorProfile(5, this.currentProgress.selectedDifficulty),
      deriveAiSeed(matchSeed),
      'opponent',
    );
    this.currentSuspendedBattle = null;
    this.currentRoute = 'OWL_MATCH';
    return { ok: true, match: this.currentMatch };
  }

  async completeEncounter(result: FloorResult): Promise<CompleteEncounterResult> {
    const floor = this.currentSelectedFloor;
    const series = this.currentSeriesState;
    const encounter = this.currentEncounter;
    if (floor === null) {
      return {
        ok: false,
        reason: 'NO_SELECTED_FLOOR',
        route: this.currentRoute,
        encounter: null,
        series: null,
        floorCompleted: false,
      };
    }
    if (
      this.currentRoute !== 'MATCH'
      || this.currentMatch === null
      || this.currentAi === null
      || series === null
      || encounter === null
    ) {
      return {
        ok: false,
        reason: 'NO_ACTIVE_MATCH',
        route: this.currentRoute,
        encounter,
        series: this.currentSeries,
        floorCompleted: false,
      };
    }

    const resolution = resolveEncounter(series, result);
    this.currentSuspendedBattle = null;
    this.currentMatch = null;
    this.currentAi = null;
    if (resolution.kind === 'next-encounter') {
      this.currentSeriesState = resolution.series;
      this.currentRoute = 'FLOOR_INTRO';
      return {
        ok: true,
        route: this.currentRoute,
        encounter: resolution.encounter,
        series: { ...resolution.series },
        floorCompleted: false,
      };
    }

    this.currentSeriesState = null;
    if (resolution.kind === 'series-loss') {
      this.currentRoute = routeFor(floor, result);
      return {
        ok: true,
        route: this.currentRoute,
        encounter,
        series: null,
        floorCompleted: false,
      };
    }

    this.currentProgress = applyFloorResult(this.currentProgress, floor, 'WIN');
    this.currentRoute = isFinalFloor(floor) ? 'OWL_REVEAL' : 'RESULT_WIN';
    const save = await this.persistCurrentProgress();
    return { ...save, encounter, series: null, floorCompleted: true };
  }

  async completeOwlMatch(result: FloorResult): Promise<TowerSaveResult> {
    if (
      this.currentRoute !== 'OWL_MATCH'
      || this.currentMatch === null
      || this.currentAi === null
    ) {
      return { ok: false, reason: 'NO_ACTIVE_MATCH', route: this.currentRoute };
    }

    this.currentMatch = null;
    this.currentAi = null;
    this.currentSuspendedBattle = null;
    if (result !== 'WIN') {
      this.currentRoute = 'OWL_RESULT';
      return { ok: true, route: this.currentRoute };
    }

    const difficulty = this.currentProgress.selectedDifficulty;
    const next = cloneProgress(this.currentProgress);
    const run = next.difficultyProgress[difficulty];
    next.difficultyProgress[difficulty] = { ...run, owlDefeated: true };
    const nextDifficultyValue = nextDifficulty(difficulty);
    if (nextDifficultyValue !== null) {
      next.unlockedDifficulties[nextDifficultyValue] = true;
    }
    this.currentProgress = next;
    this.currentRoute = 'ENDING';
    return this.persistCurrentProgress();
  }

  /** @deprecated Use completeEncounter for the three-opponent floor gauntlet. */
  async completeFloor(result: FloorResult): Promise<TowerSaveResult> {
    const floor = this.currentSelectedFloor;
    if (floor === null) {
      return { ok: false, reason: 'NO_SELECTED_FLOOR', route: this.currentRoute };
    }
    if (
      this.currentRoute !== 'MATCH'
      || this.currentMatch === null
      || this.currentAi === null
    ) {
      return { ok: false, reason: 'NO_ACTIVE_MATCH', route: this.currentRoute };
    }

    this.currentProgress = applyFloorResult(this.currentProgress, floor, result);
    this.currentRoute = routeFor(floor, result);
    this.currentMatch = null;
    this.currentAi = null;
    this.currentSeriesState = null;
    this.currentSuspendedBattle = null;
    return this.persistCurrentProgress();
  }

  abandonMatch(): SuspendedBattle | null {
    if (this.currentMatch === null || this.currentAi === null) return null;
    let suspended: SuspendedBattle;
    if (this.currentRoute === 'MATCH' && this.currentSeriesState !== null) {
      suspended = { kind: 'floor', series: { ...this.currentSeriesState } };
    } else if (this.currentRoute === 'OWL_MATCH') {
      suspended = { kind: 'owl' };
    } else {
      return null;
    }
    this.currentMatch = null;
    this.currentAi = null;
    this.currentSuspendedBattle = suspended;
    this.currentRoute = 'TOWER';
    return suspended.kind === 'floor'
      ? { kind: 'floor', series: { ...suspended.series } }
      : suspended;
  }

  async selectDifficulty(difficulty: ProgressState['selectedDifficulty']): Promise<TowerSaveResult> {
    if (!isDifficulty(difficulty) || !canSelectDifficulty(this.currentProgress, difficulty)) {
      return { ok: false, reason: 'LOCKED_DIFFICULTY', route: this.currentRoute };
    }

    const next = cloneProgress(this.currentProgress);
    next.selectedDifficulty = difficulty;
    this.currentProgress = next;
    this.currentSelectedFloor = null;
    this.currentSeriesState = null;
    this.currentMatch = null;
    this.currentAi = null;
    this.currentSuspendedBattle = null;
    this.currentRoute = 'TOWER';
    return this.persistCurrentProgress();
  }

  async updateProfile(profile: PlayerProfile): Promise<TowerSaveResult> {
    const next = cloneProgress(this.currentProgress);
    next.profile = {
      initials: profile.initials,
      characterId: profile.characterId,
    };
    this.currentProgress = next;
    this.currentSelectedFloor = null;
    this.currentSeriesState = null;
    this.currentMatch = null;
    this.currentAi = null;
    this.currentSuspendedBattle = null;
    this.currentRoute = 'TOWER';
    return this.persistCurrentProgress();
  }

  async recordScore(
    record: ScoreRecord,
    queueForOnline: boolean,
  ): Promise<TowerSaveResult> {
    const candidate = { ...record };
    const current = this.currentProgress.localBestScores[candidate.difficulty];
    if (!isBetterScore(candidate, current)) {
      return { ok: true, route: this.currentRoute };
    }

    const next = cloneProgress(this.currentProgress);
    next.localBestScores[candidate.difficulty] = { ...candidate };
    const pending = next.pendingLeaderboardSubmissions[candidate.difficulty] ?? null;
    if (queueForOnline && isBetterScore(candidate, pending)) {
      next.pendingLeaderboardSubmissions[candidate.difficulty] = { ...candidate };
    }
    this.currentProgress = next;
    return this.persistCurrentProgress();
  }

  async clearPendingSubmission(
    difficulty: ProgressState['selectedDifficulty'],
    expectedRecord: ScoreRecord,
  ): Promise<TowerSaveResult> {
    const expected = { ...expectedRecord };
    const current = this.currentProgress.pendingLeaderboardSubmissions[difficulty];
    if (current === undefined || !sameScoreRecord(current, expected)) {
      return { ok: true, route: this.currentRoute };
    }

    const next = cloneProgress(this.currentProgress);
    delete next.pendingLeaderboardSubmissions[difficulty];
    this.currentProgress = next;
    return this.persistCurrentProgress();
  }

  async updateSettings(
    settings: Partial<ProgressState['settings']>,
  ): Promise<TowerSaveResult> {
    if (!isSettingsUpdate(settings)) {
      return { ok: false, reason: 'INVALID_SETTINGS', route: this.currentRoute };
    }

    const next = cloneProgress(this.currentProgress);
    next.settings = { ...next.settings, ...settings };
    this.currentProgress = next;
    return this.persistCurrentProgress();
  }

  async retrySave(): Promise<TowerSaveResult> {
    const pending = this.pendingSave;
    if (pending === null) {
      return { ok: false, reason: 'NO_PENDING_SAVE', route: this.currentRoute };
    }
    return this.enqueueSave(cloneProgress(pending));
  }

  private persistCurrentProgress(): Promise<TowerSaveResult> {
    const pending = cloneProgress(this.currentProgress);
    return this.enqueueSave(pending);
  }

  private async enqueueSave(pending: ProgressState): Promise<TowerSaveResult> {
    this.pendingSave = pending;
    const save = this.saveTail.then(async () => {
      try {
        return (await this.repository.save(pending)).ok;
      } catch {
        return false;
      }
    });
    this.saveTail = save.then(() => undefined, () => undefined);

    if (!await save) {
      this.currentSaveError = 'SAVE_FAILED';
      return { ok: false, reason: 'SAVE_FAILED', route: this.currentRoute };
    }
    if (this.pendingSave === pending) {
      this.pendingSave = null;
      this.currentSaveError = null;
    }
    return { ok: true, route: this.currentRoute };
  }
}
