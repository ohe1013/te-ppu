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

  private constructor(difficulty: Difficulty) {
    this.#state = {
      difficulty,
      score: 0,
      durationTicks: 0,
      requiredFloor: 1,
      encounterIndex: 0,
      encountersWon: 0,
      owlDefeated: false,
      awaitingOwl: false,
      phase: 'active',
      reachedFloor: 1,
    };
  }

  static start(difficulty: Difficulty): ScoreRunController {
    return new ScoreRunController(difficulty);
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

  recordEvents(events: readonly GameEvent[]): void {
    this.#assertActive();
    this.#state.score += scorePlayerEvents(events);
  }

  completeMatch(outcome: MatchScoreOutcome): ScoreRunResolution {
    this.#assertActive();
    this.#assertExpectedOutcome(outcome);
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

  #assertActive(): void {
    if (this.#state.phase === 'ended') throw new RangeError('Score run has ended.');
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
