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
export const LOOKAHEAD_BEAM_WIDTH = 4;

function projectedCandidates(view: AiObservation): readonly PlacementCandidate[] {
  return enumerateCandidates(view);
}

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
  if (candidate.topOut === true) return { features, score: Number.NEGATIVE_INFINITY };

  const currentScore = dot(profile.weights, features);
  const [next, ...remaining] = previews;
  if (next === undefined) return { features, score: currentScore };

  const nextView = futureObservation(view, candidate, next);
  const futureScores = projectedCandidates(nextView).map((future) =>
    totalScore(nextView, future, remaining, profile).score);
  const bestFuture = futureScores.length === 0
    ? Number.NEGATIVE_INFINITY
    : Math.max(...futureScores);
  return { features, score: currentScore + profile.futureDiscount * bestFuture };
}

function placementLandingRow(candidate: PlacementCandidate): number {
  return Math.max(...candidate.landingCells.map(({ y }) => y));
}

function commandKey(candidate: PlacementCandidate): string {
  return JSON.stringify(candidate.commands);
}

function comparePlacements(left: PlacementCandidate, right: PlacementCandidate): number {
  if (left.rotation !== right.rotation) return left.rotation - right.rotation;
  if (left.column !== right.column) return left.column - right.column;
  const rowDifference = placementLandingRow(left) - placementLandingRow(right);
  if (rowDifference !== 0) return rowDifference;
  return commandKey(left).localeCompare(commandKey(right));
}

function compareScores(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function immediateScore(
  view: AiObservation,
  candidate: PlacementCandidate,
  profile: AiFloorProfile,
): { readonly features: HeuristicFeatures; readonly score: number } {
  const features = featuresFor(view, candidate);
  return {
    features,
    score: candidate.topOut === true
      ? Number.NEGATIVE_INFINITY
      : dot(profile.weights, features),
  };
}

interface PreviewOnePath {
  readonly rootIndex: number;
  readonly root: PlacementCandidate;
  readonly preview: PlacementCandidate;
  readonly previewView: AiObservation;
  readonly partialScore: number;
}

function stableRootBeam(
  roots: readonly PlacementCandidate[],
  rootResults: readonly { readonly score: number }[],
): readonly number[] {
  return roots
    .map((root, rootIndex) => ({ root, rootIndex, score: rootResults[rootIndex]!.score }))
    .sort((left, right) =>
      compareScores(left.score, right.score)
        || comparePlacements(left.root, right.root))
    .slice(0, LOOKAHEAD_BEAM_WIDTH)
    .map(({ rootIndex }) => rootIndex);
}

function depthOneScores(
  view: AiObservation,
  roots: readonly PlacementCandidate[],
  profile: AiFloorProfile,
): readonly ScoredCandidate[] {
  const rootResults = roots.map((candidate) => immediateScore(view, candidate, profile));
  const rootScores = Array<number>(roots.length).fill(Number.NEGATIVE_INFINITY);
  for (const rootIndex of stableRootBeam(roots, rootResults)) {
    const previewView = futureObservation(view, roots[rootIndex]!, view.self.next[0]);
    const futureScores = projectedCandidates(previewView)
      .map((candidate) => ({
        candidate,
        score: immediateScore(previewView, candidate, profile).score,
      }))
      .sort((left, right) =>
        compareScores(left.score, right.score)
          || comparePlacements(left.candidate, right.candidate));
    const best = futureScores[0]?.score ?? Number.NEGATIVE_INFINITY;
    rootScores[rootIndex] = rootResults[rootIndex]!.score + profile.futureDiscount * best;
  }
  return roots.map((candidate, index) => ({
    ...candidate,
    ...rootResults[index]!,
    score: rootScores[index]!,
  }));
}

function depthTwoScores(
  view: AiObservation,
  roots: readonly PlacementCandidate[],
  profile: AiFloorProfile,
): readonly ScoredCandidate[] {
  const previewOne = view.self.next[0];
  const previewTwo = view.self.next[1];
  const rootResults = roots.map((candidate) => immediateScore(view, candidate, profile));
  const partials: PreviewOnePath[] = [];
  const retainedRootIndexes = stableRootBeam(roots, rootResults);

  retainedRootIndexes.forEach((rootIndex) => {
    const root = roots[rootIndex]!;
    const previewView = futureObservation(view, root, previewOne);
    for (const preview of projectedCandidates(previewView)) {
      const previewResult = immediateScore(previewView, preview, profile);
      partials.push({
        rootIndex,
        root,
        preview,
        previewView,
        partialScore: rootResults[rootIndex]!.score
          + profile.futureDiscount * previewResult.score,
      });
    }
  });

  partials.sort((left, right) =>
    compareScores(left.partialScore, right.partialScore)
      || comparePlacements(left.root, right.root)
      || comparePlacements(left.preview, right.preview));

  const rootScores = Array<number>(roots.length).fill(Number.NEGATIVE_INFINITY);
  const previewTwoCache = new Map<string, number>();
  for (const path of partials.slice(0, LOOKAHEAD_BEAM_WIDTH)) {
    const previewTwoView = futureObservation(path.previewView, path.preview, previewTwo);
    const previewTwoKey = JSON.stringify([
      previewTwoView.self.board,
      previewTwoView.self.active,
      previewTwoView.self.combo,
      previewTwoView.self.incoming,
    ]);
    let best = previewTwoCache.get(previewTwoKey);
    if (best === undefined) {
      const previewTwoScores = projectedCandidates(previewTwoView)
        .map((candidate) => ({
          candidate,
          score: immediateScore(previewTwoView, candidate, profile).score,
        }))
        .sort((left, right) =>
          compareScores(left.score, right.score)
            || comparePlacements(left.candidate, right.candidate));
      best = previewTwoScores[0]?.score ?? Number.NEGATIVE_INFINITY;
      previewTwoCache.set(previewTwoKey, best);
    }
    const fullScore = path.partialScore
      + profile.futureDiscount * profile.futureDiscount * best;
    if (fullScore > rootScores[path.rootIndex]!) rootScores[path.rootIndex] = fullScore;
  }

  return roots.map((candidate, index) => ({
    ...candidate,
    ...rootResults[index]!,
    score: rootScores[index]!,
  }));
}

export function scoreCandidates(
  view: AiObservation,
  profile: AiFloorProfile,
): readonly ScoredCandidate[] {
  const previews = view.self.next.slice(0, profile.lookahead);
  const rootCandidates = projectedCandidates(view);
  const scored = profile.lookahead === 2
    ? depthTwoScores(view, rootCandidates, profile)
    : profile.lookahead === 1
      ? depthOneScores(view, rootCandidates, profile)
      : rootCandidates.map((candidate): ScoredCandidate => {
        const result = totalScore(view, candidate, previews, profile);
        return { ...candidate, ...result };
      });
  return [...scored].sort((left, right) => {
      return compareScores(left.score, right.score) || comparePlacements(left, right);
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
  const weights = profile.rankWeights.slice(0, available.length);
  let cumulative = 0;
  for (let index = 0; index < available.length; index += 1) {
    cumulative += weights[index] ?? 0;
    if (draw < cumulative) return available[index]!;
  }
  return available.at(-1)!;
}
