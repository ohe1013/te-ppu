import type { AiObservation, SideId, TimedCommand } from '../core/index';
import type { Floor } from '../progression';

export type AiStrengthLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface AiController {
  readonly side: SideId;
  update(view: AiObservation, tick: number): readonly TimedCommand[];
}

export interface AiFloorProfile {
  readonly floor: Floor;
  readonly reactionTicks: number;
  readonly lookahead: 0 | 1 | 2;
  readonly topK: 5 | 4 | 3 | 2 | 1;
  readonly rankWeights: readonly number[];
  readonly futureDiscount: number;
  readonly weights: Readonly<Record<HeuristicName, number>>;
  readonly itemPolicy: 'FIRST_VALID' | 'RISK_AWARE' | 'TACTICAL';
}

export interface AiSkillStep {
  readonly reactionTicks: number;
  readonly lookahead: 0 | 1 | 2;
  readonly rankWeights: readonly [number, ...number[]];
  readonly futureDiscount: number;
  readonly heuristicBlend: number;
  readonly itemPolicy: AiFloorProfile['itemPolicy'];
}

export type BoardView = AiObservation['self']['board'];

export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

export type HeuristicName =
  | 'aggregateHeight'
  | 'maxHeight'
  | 'holes'
  | 'bumpiness'
  | 'clearedLines'
  | 'combo'
  | 'incomingOffset'
  | 'itemGain'
  | 'opponentPressure';
