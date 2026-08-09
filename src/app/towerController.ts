import { createAiController, getAiFloorProfile, type AiController } from '../ai/index';
import {
  RandomStream,
  counterU32,
  createMatch,
  type MatchState,
} from '../core/index';
import {
  applyFloorResult,
  canSelectFloor,
  getFloorEncounter,
  isFinalFloor,
  resolveEncounter,
  startFloorSeries,
  type Floor,
  type FloorEncounter,
  type FloorResult,
  type FloorSeriesState,
  type ProgressRepository,
  type ProgressState,
} from '../progression/index';

export type TowerRoute =
  | 'TOWER'
  | 'FLOOR_INTRO'
  | 'MATCH'
  | 'RESULT_WIN'
  | 'RESULT_LOSS'
  | 'RESULT_DRAW'
  | 'ENDING';

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

export type TowerSaveResult =
  | { readonly ok: true; readonly route: TowerRoute }
  | {
      readonly ok: false;
      readonly reason:
        | 'SAVE_FAILED'
        | 'NO_PENDING_SAVE'
        | 'NO_SELECTED_FLOOR'
        | 'NO_ACTIVE_MATCH'
        | 'INVALID_SETTINGS';
      readonly route: TowerRoute;
    };

function cloneProgress(state: ProgressState): ProgressState {
  return {
    schemaVersion: state.schemaVersion,
    highestUnlockedFloor: state.highestUnlockedFloor,
    clearedFloors: { ...state.clearedFloors },
    settings: { ...state.settings },
  };
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
    (key === 'soundEnabled' || key === 'hapticsEnabled')
    && typeof value === 'boolean'
  ));
}

export class TowerController {
  private currentProgress: ProgressState;
  private currentSelectedFloor: Floor | null = null;
  private currentSeriesState: FloorSeriesState | null = null;
  private currentMatch: MatchState | null = null;
  private currentAi: AiController | null = null;
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
      getAiFloorProfile(floor),
      deriveAiSeed(matchSeed),
      'opponent',
    );
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
    this.currentRoute = routeFor(floor, result);
    if (resolution.kind === 'series-loss') {
      return {
        ok: true,
        route: this.currentRoute,
        encounter,
        series: null,
        floorCompleted: false,
      };
    }

    this.currentProgress = applyFloorResult(this.currentProgress, floor, 'WIN');
    const save = await this.persistCurrentProgress();
    return { ...save, encounter, series: null, floorCompleted: true };
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
    return this.persistCurrentProgress();
  }

  abandonMatch(): void {
    this.currentMatch = null;
    this.currentAi = null;
    this.currentRoute = 'FLOOR_INTRO';
  }

  async updateSettings(
    settings: Partial<ProgressState['settings']>,
  ): Promise<TowerSaveResult> {
    if (!isSettingsUpdate(settings)) {
      return { ok: false, reason: 'INVALID_SETTINGS', route: this.currentRoute };
    }

    this.currentProgress = {
      ...this.currentProgress,
      clearedFloors: { ...this.currentProgress.clearedFloors },
      settings: { ...this.currentProgress.settings, ...settings },
    };
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
