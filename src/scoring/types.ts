import type { GameEvent } from '../core';
import type { PlayerProfile } from '../player';
import type { Difficulty, EncounterIndex, Floor, ScoreRecord } from '../progression';

export type MatchResult = 'win' | 'loss' | 'draw';

export interface MatchScoreOutcome {
  readonly floor: Floor;
  readonly encounterIndex: EncounterIndex;
  readonly isOwl: boolean;
  readonly result: MatchResult;
  readonly durationTicks: number;
}

export interface ScoreRunSnapshot {
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly durationTicks: number;
  readonly requiredFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly phase: 'active' | 'ended';
}

export interface EndedScoreRun {
  readonly difficulty: Difficulty;
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
}

export type ScoreRunResolution =
  | { readonly kind: 'continued'; readonly snapshot: ScoreRunSnapshot }
  | { readonly kind: 'ended'; readonly summary: EndedScoreRun };

export type { Difficulty, EncounterIndex, Floor, GameEvent, PlayerProfile, ScoreRecord };
