import type { GameEvent } from '../core';
import { FINAL_FLOOR, type Difficulty, type EncounterIndex, type Floor } from '../progression';
import { scorePlayerEvents } from './score-rules';
import type {
  EndedScoreRun,
  MatchScoreOutcome,
  ScoreRunResolution,
  ScoreRunSnapshot,
} from './types';

const MATCH_WIN_SCORE = 1_000;
const FLOOR_CLEAR_SCORE = 2_000;
const OWL_WIN_SCORE = 5_000;

interface MutableScoreRunState {
  difficulty: Difficulty;
  score: number;
  durationTicks: number;
  requiredFloor: Floor;
  encounterIndex: EncounterIndex;
  encountersWon: number;
  owlDefeated: boolean;
  awaitingOwl: boolean;
  phase: 'active' | 'ended';
  reachedFloor: Floor;
}

function nextFloor(floor: Floor): Floor {
  return (floor + 1) as Floor;
}

export class ScoreRunController {
  readonly #state: MutableScoreRunState;
  #matchScoreCheckpoint: number | null = null;

  private constructor(difficulty: Difficulty, requiredFloor: Floor) {
    this.#state = {
      difficulty,
      score: 0,
      durationTicks: 0,
      requiredFloor,
      encounterIndex: 0,
      encountersWon: 0,
      owlDefeated: false,
      awaitingOwl: false,
      phase: 'active',
      reachedFloor: requiredFloor,
    };
  }

  static start(difficulty: Difficulty): ScoreRunController {
    return new ScoreRunController(difficulty, 1);
  }

  static startAtFloor(difficulty: Difficulty, requiredFloor: Floor): ScoreRunController {
    return new ScoreRunController(difficulty, requiredFloor);
  }

  get snapshot(): ScoreRunSnapshot {
    return {
      difficulty: this.#state.difficulty,
      score: this.#state.score,
      durationTicks: this.#state.durationTicks,
      requiredFloor: this.#state.requiredFloor,
      encountersWon: this.#state.encountersWon,
      owlDefeated: this.#state.owlDefeated,
      phase: this.#state.phase,
    };
  }

  canSelectFloor(floor: Floor): boolean {
    return this.#state.phase === 'active' && floor === this.#state.requiredFloor;
  }

  beginMatch(): void {
    this.#assertActive();
    if (this.#matchScoreCheckpoint !== null) {
      throw new RangeError('A score-run match is already active.');
    }
    this.#matchScoreCheckpoint = this.#state.score;
  }

  recordEvents(events: readonly GameEvent[]): void {
    this.#assertActiveMatch();
    this.#state.score += scorePlayerEvents(events);
  }

  completeMatch(outcome: MatchScoreOutcome): ScoreRunResolution {
    this.#assertActiveMatch();
    this.#assertExpectedOutcome(outcome);
    this.#matchScoreCheckpoint = null;
    this.#state.durationTicks += outcome.durationTicks;
    this.#state.reachedFloor = outcome.floor;

    if (outcome.result !== 'win') return this.#endRun();

    this.#state.score += MATCH_WIN_SCORE;
    this.#state.encountersWon += 1;

    if (outcome.isOwl) {
      this.#state.score += OWL_WIN_SCORE;
      this.#state.owlDefeated = true;
      return this.#endRun();
    }

    if (outcome.encounterIndex !== 2) {
      this.#state.encounterIndex = (outcome.encounterIndex + 1) as EncounterIndex;
      return { kind: 'continued', snapshot: this.snapshot };
    }

    this.#state.score += FLOOR_CLEAR_SCORE;
    if (outcome.floor === FINAL_FLOOR) {
      this.#state.awaitingOwl = true;
      return { kind: 'continued', snapshot: this.snapshot };
    }

    this.#state.requiredFloor = nextFloor(outcome.floor);
    this.#state.encounterIndex = 0;
    return { kind: 'continued', snapshot: this.snapshot };
  }

  abandonMatch(): void {
    this.#assertActiveMatch();
    this.#state.score = this.#matchScoreCheckpoint!;
    this.#matchScoreCheckpoint = null;
  }

  #assertActive(): void {
    if (this.#state.phase === 'ended') throw new RangeError('Score run has ended.');
  }

  #assertActiveMatch(): void {
    this.#assertActive();
    if (this.#matchScoreCheckpoint === null) {
      throw new RangeError('No score-run match is active.');
    }
  }

  #assertExpectedOutcome(outcome: MatchScoreOutcome): void {
    if (
      outcome.floor !== this.#state.requiredFloor
      || outcome.encounterIndex !== this.#state.encounterIndex
      || outcome.isOwl !== this.#state.awaitingOwl
    ) {
      throw new RangeError('Score run outcome is out of order.');
    }
  }

  #endRun(): ScoreRunResolution {
    this.#state.phase = 'ended';
    return { kind: 'ended', summary: this.#endedSummary() };
  }

  #endedSummary(): EndedScoreRun {
    return {
      difficulty: this.#state.difficulty,
      score: this.#state.score,
      durationTicks: this.#state.durationTicks,
      reachedFloor: this.#state.reachedFloor,
      encountersWon: this.#state.encountersWon,
      owlDefeated: this.#state.owlDefeated,
    };
  }
}
