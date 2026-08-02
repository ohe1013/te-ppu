import type { AiObservation, SideId, TimedCommand } from '../core/index';

export interface AiController {
  readonly side: SideId;
  update(view: AiObservation, tick: number): readonly TimedCommand[];
}

export interface AiFloorProfile {
  readonly floor: 1 | 2 | 3;
  readonly reactionTicks: 48 | 27 | 12;
  readonly lookahead: 0 | 1 | 2;
  readonly topK: 5 | 3 | 1;
  readonly rankWeights: readonly number[];
  readonly futureDiscount: number;
  readonly weights: Readonly<Record<HeuristicName, number>>;
  readonly itemPolicy: 'FIRST_VALID' | 'RISK_AWARE' | 'TACTICAL';
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
