import {
  AI_FLOOR_PROFILES,
  createAiController,
  type AiController,
} from '../ai/index';
import {
  RandomStream,
  counterU32,
  createMatch,
  type MatchState,
} from '../core/index';
import {
  applyFloorResult,
  canSelectFloor,
  type Floor,
  type FloorResult,
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
  | { readonly ok: true; readonly match: MatchState }
  | { readonly ok: false; readonly reason: 'LOCKED_FLOOR' | 'NO_SELECTED_FLOOR' };

export type TowerSaveResult =
  | { readonly ok: true; readonly route: TowerRoute }
  | {
      readonly ok: false;
      readonly reason: 'SAVE_FAILED' | 'NO_PENDING_SAVE' | 'NO_SELECTED_FLOOR';
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

function routeFor(floor: Floor, result: FloorResult): TowerRoute {
  if (result === 'LOSS') return 'RESULT_LOSS';
  if (result === 'DRAW') return 'RESULT_DRAW';
  return floor === 3 ? 'ENDING' : 'RESULT_WIN';
}

function deriveAiSeed(matchSeed: number): number {
  return counterU32(matchSeed, RandomStream.AI_MISTAKE, 1);
}

export class TowerController {
  private currentProgress: ProgressState;
  private currentSelectedFloor: Floor | null = null;
  private currentMatch: MatchState | null = null;
  private currentAi: AiController | null = null;
  private currentRoute: TowerRoute = 'TOWER';
  private currentSaveError: 'SAVE_FAILED' | null = null;
  private pendingSave: ProgressState | null = null;

  constructor(
    progress: ProgressState,
    private readonly repository: ProgressRepository,
  ) {
    this.currentProgress = cloneProgress(progress);
  }

  get progress(): ProgressState {
    return this.currentProgress;
  }

  get selectedFloor(): Floor | null {
    return this.currentSelectedFloor;
  }

  get match(): MatchState | null {
    return this.currentMatch;
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
    this.currentMatch = createMatch({ matchSeed });
    this.currentAi = createAiController(
      AI_FLOOR_PROFILES[floor - 1]!,
      deriveAiSeed(matchSeed),
      'opponent',
    );
    this.currentRoute = 'MATCH';
    return { ok: true, match: this.currentMatch };
  }

  restartFloor(matchSeed: number): StartFloorResult {
    if (this.currentSelectedFloor === null) {
      return { ok: false, reason: 'NO_SELECTED_FLOOR' };
    }
    return this.startFloor(this.currentSelectedFloor, matchSeed);
  }

  async completeFloor(result: FloorResult): Promise<TowerSaveResult> {
    const floor = this.currentSelectedFloor;
    if (floor === null) {
      return { ok: false, reason: 'NO_SELECTED_FLOOR', route: this.currentRoute };
    }

    this.currentProgress = applyFloorResult(this.currentProgress, floor, result);
    this.currentRoute = routeFor(floor, result);
    this.currentMatch = null;
    this.currentAi = null;
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

    const saved = await this.repository.save(pending);
    if (!saved.ok) {
      this.currentSaveError = 'SAVE_FAILED';
      return { ok: false, reason: 'SAVE_FAILED', route: this.currentRoute };
    }
    if (this.pendingSave === pending) this.pendingSave = null;
    this.currentSaveError = null;
    return { ok: true, route: this.currentRoute };
  }

  private async persistCurrentProgress(): Promise<TowerSaveResult> {
    const pending = cloneProgress(this.currentProgress);
    this.pendingSave = pending;
    const saved = await this.repository.save(pending);
    if (!saved.ok) {
      this.currentSaveError = 'SAVE_FAILED';
      return { ok: false, reason: 'SAVE_FAILED', route: this.currentRoute };
    }
    if (this.pendingSave === pending) this.pendingSave = null;
    this.currentSaveError = null;
    return { ok: true, route: this.currentRoute };
  }
}
