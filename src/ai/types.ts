import type { AiObservation, SideId, TimedCommand } from '../core/index';
import type { Floor } from '../progression';

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
