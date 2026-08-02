import {
  BOARD_WIDTH,
  type AiObservation,
  type Cell,
  type ItemType,
  type PublicPieceToken,
} from '../core/index';
import { enumerateCandidates, type PlacementCandidate } from './candidates';
import type { AiFloorProfile, BoardView, HeuristicName } from './types';

export type HeuristicFeatures = Readonly<Record<HeuristicName, number>>;

export interface ScoredCandidate extends PlacementCandidate {
  readonly features: HeuristicFeatures;
  readonly score: number;
}

export type MistakeRandom = () => number;

function columnHeights(board: BoardView): readonly number[] {
  const rows = board.length / BOARD_WIDTH;
  return Array.from({ length: BOARD_WIDTH }, (_, x) => {
    for (let y = 0; y < rows; y += 1) {
      if (board[y * BOARD_WIDTH + x] !== null) return rows - y;
    }
    return 0;
  });
}

function countHoles(board: BoardView): number {
  const rows = board.length / BOARD_WIDTH;
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    let occupiedAbove = false;
    for (let y = 0; y < rows; y += 1) {
      const occupied = board[y * BOARD_WIDTH + x] !== null;
      if (occupied) occupiedAbove = true;
      else if (occupiedAbove) holes += 1;
    }
  }
  return holes;
}

function itemValue(items: readonly ItemType[]): number {
  return items.reduce((total, item) => total + (item === 'queue-swap' ? 3 : 1), 0);
}

function normalizedHeight(board: readonly (Cell | null)[]): number {
  const heights = columnHeights(board);
  const rows = board.length / BOARD_WIDTH;
  return rows === 0 ? 0 : Math.max(...heights) / rows;
}

function featuresFor(view: AiObservation, candidate: PlacementCandidate): HeuristicFeatures {
  const heights = columnHeights(candidate.resultingBoard);
  return {
    aggregateHeight: heights.reduce((sum, height) => sum + height, 0),
    maxHeight: Math.max(...heights),
    holes: countHoles(candidate.resultingBoard),
    bumpiness: heights.slice(1).reduce(
      (sum, height, index) => sum + Math.abs(height - heights[index]!),
      0,
    ),
    clearedLines: candidate.clearedLines,
    combo: candidate.clearedLines > 0 ? view.self.combo + 1 : 0,
    incomingOffset: Math.min(candidate.attack, view.self.incoming),
    itemGain: itemValue(candidate.acquiredItems),
    opponentPressure: candidate.attack * normalizedHeight(view.opponent.board),
  };
}

function dot(weights: AiFloorProfile['weights'], features: HeuristicFeatures): number {
  return (Object.keys(weights) as HeuristicName[]).reduce(
    (score, name) => score + weights[name] * features[name],
    0,
  );
}

function futureObservation(
  view: AiObservation,
  candidate: PlacementCandidate,
  token: PublicPieceToken,
): AiObservation {
  const combo = candidate.clearedLines > 0 ? view.self.combo + 1 : 0;
  const incoming = Math.max(0, view.self.incoming - candidate.attack);
  return {
    ...view,
    self: {
      ...view.self,
      board: candidate.resultingBoard,
      active: { token, x: 3, y: -2, rotation: 0 },
      ghostY: null,
      combo,
      incoming,
      topOut: false,
      phase: 'active',
    },
  };
}

function totalScore(
  view: AiObservation,
  candidate: PlacementCandidate,
  previews: readonly PublicPieceToken[],
  profile: AiFloorProfile,
): { readonly features: HeuristicFeatures; readonly score: number } {
  const features = featuresFor(view, candidate);
  if (candidate.topOut) return { features, score: Number.NEGATIVE_INFINITY };

  const currentScore = dot(profile.weights, features);
  const [next, ...remaining] = previews;
  if (next === undefined) return { features, score: currentScore };

  const nextView = futureObservation(view, candidate, next);
  const futureScores = enumerateCandidates(nextView).map((future) =>
    totalScore(nextView, future, remaining, profile).score);
  const bestFuture = futureScores.length === 0
    ? Number.NEGATIVE_INFINITY
    : Math.max(...futureScores);
  return { features, score: currentScore + profile.futureDiscount * bestFuture };
}

function landingRow(candidate: PlacementCandidate): number {
  return Math.max(...candidate.landingCells.map(({ y }) => y));
}

function commandKey(candidate: PlacementCandidate): string {
  return JSON.stringify(candidate.commands);
}

export function scoreCandidates(
  view: AiObservation,
  profile: AiFloorProfile,
): readonly ScoredCandidate[] {
  const previews = view.self.next.slice(0, profile.lookahead);
  return enumerateCandidates(view)
    .map((candidate): ScoredCandidate => {
      const result = totalScore(view, candidate, previews, profile);
      return { ...candidate, ...result };
    })
    .sort((left, right) => {
      if (left.score !== right.score) return left.score > right.score ? -1 : 1;
      if (left.rotation !== right.rotation) return left.rotation - right.rotation;
      if (left.column !== right.column) return left.column - right.column;
      const rowDifference = landingRow(left) - landingRow(right);
      if (rowDifference !== 0) return rowDifference;
      return commandKey(left).localeCompare(commandKey(right));
    });
}

function boundedDraw(rng: MistakeRandom): number {
  const draw = rng();
  if (!Number.isFinite(draw) || draw <= 0) return 0;
  return Math.min(draw, 1 - Number.EPSILON);
}

export function selectCandidate(
  scored: readonly ScoredCandidate[],
  profile: AiFloorProfile,
  rng: MistakeRandom,
): ScoredCandidate {
  if (scored.length === 0) throw new RangeError('cannot select from an empty candidate list');
  const draw = boundedDraw(rng);
  const available = scored.slice(0, Math.min(profile.topK, scored.length));

  if (profile.floor === 1) {
    return available[Math.floor(draw * available.length)]!;
  }
  if (profile.floor === 3) return available[0]!;

  const weights = profile.rankWeights.slice(0, available.length);
  let cumulative = 0;
  for (let index = 0; index < available.length; index += 1) {
    cumulative += weights[index] ?? 0;
    if (draw < cumulative) return available[index]!;
  }
  return available.at(-1)!;
}
