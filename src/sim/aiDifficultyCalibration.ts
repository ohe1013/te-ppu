import { getAiFloorProfile } from '../ai/index';
import type { SideId } from '../core/index';
import type { Difficulty, Floor } from '../progression/index';
import {
  createSimulationController,
  runAiSimulation,
  type SimulationController,
  type SimulationSummary,
} from './aiSimulation';

export interface AiDifficultyEndpoint {
  readonly difficulty: Difficulty;
  readonly floor: Floor;
}

export interface AiDifficultyComparison {
  readonly id: 'easy5-normal1' | 'normal5-hard1' | 'easy1-hard5';
  readonly lower: AiDifficultyEndpoint;
  readonly higher: AiDifficultyEndpoint;
  readonly minimumHigherShare: number;
  readonly strictShare: boolean;
}

export interface MirroredDifficultyPair {
  readonly seed: number;
  readonly higherAsPlayer: SimulationSummary;
  readonly higherAsOpponent: SimulationSummary;
}

export interface AiDifficultyComparisonReport {
  readonly comparison: AiDifficultyComparison;
  readonly seedPairs: number;
  readonly games: number;
  readonly higherPoints: number;
  readonly higherShare: number;
  readonly pairedWins: number;
  readonly pairedLosses: number;
  readonly pairedTies: number;
  readonly oneSidedPValue: number;
  readonly rejectedCommands: number;
  readonly cappedMatches: number;
}

export const AI_DIFFICULTY_CALIBRATION_SEED_PAIRS = 128;

export const AI_DIFFICULTY_COMPARISONS = [
  {
    id: 'easy5-normal1',
    lower: { difficulty: 'easy', floor: 5 },
    higher: { difficulty: 'normal', floor: 1 },
    minimumHigherShare: .5,
    strictShare: true,
  },
  {
    id: 'normal5-hard1',
    lower: { difficulty: 'normal', floor: 5 },
    higher: { difficulty: 'hard', floor: 1 },
    minimumHigherShare: .5,
    strictShare: true,
  },
  {
    id: 'easy1-hard5',
    lower: { difficulty: 'easy', floor: 1 },
    higher: { difficulty: 'hard', floor: 5 },
    minimumHigherShare: .65,
    strictShare: false,
  },
] as const satisfies readonly AiDifficultyComparison[];

export function exactOneSidedSignPValue(wins: number, losses: number): number {
  if (!Number.isSafeInteger(wins) || wins < 0
    || !Number.isSafeInteger(losses) || losses < 0) {
    throw new RangeError('sign-test counts must be non-negative safe integers');
  }
  const trials = wins + losses;
  if (trials === 0) return 1;
  let term = 0.5 ** trials;
  let tail = 0;
  for (let successes = 0; successes <= trials; successes += 1) {
    if (successes >= wins) tail += term;
    term *= (trials - successes) / (successes + 1);
  }
  return Math.min(1, tail);
}

function higherPointsFor(summary: SimulationSummary, higherSide: SideId): number {
  if (summary.outcome === 'draw') return .5;
  return summary.outcome === higherSide ? 1 : 0;
}

export function summarizeDifficultyComparison(
  comparison: AiDifficultyComparison,
  pairs: readonly MirroredDifficultyPair[],
): AiDifficultyComparisonReport {
  let higherPoints = 0;
  let pairedWins = 0;
  let pairedLosses = 0;
  let pairedTies = 0;
  let rejectedCommands = 0;
  let cappedMatches = 0;

  for (const pair of pairs) {
    const pairPoints = higherPointsFor(pair.higherAsPlayer, 'player')
      + higherPointsFor(pair.higherAsOpponent, 'opponent');
    higherPoints += pairPoints;
    if (pairPoints > 1) pairedWins += 1;
    else if (pairPoints < 1) pairedLosses += 1;
    else pairedTies += 1;
    rejectedCommands += pair.higherAsPlayer.rejectedCommands
      + pair.higherAsOpponent.rejectedCommands;
    cappedMatches += Number(pair.higherAsPlayer.exceededTickLimit)
      + Number(pair.higherAsOpponent.exceededTickLimit);
  }

  const games = pairs.length * 2;
  return {
    comparison,
    seedPairs: pairs.length,
    games,
    higherPoints,
    higherShare: higherPoints / games,
    pairedWins,
    pairedLosses,
    pairedTies,
    oneSidedPValue: exactOneSidedSignPValue(pairedWins, pairedLosses),
    rejectedCommands,
    cappedMatches,
  };
}

function controllersFor(
  seed: number,
  player: AiDifficultyEndpoint,
  opponent: AiDifficultyEndpoint,
): Readonly<Record<SideId, SimulationController>> {
  return {
    player: createSimulationController(
      getAiFloorProfile(player.floor, player.difficulty), seed, 'player',
    ),
    opponent: createSimulationController(
      getAiFloorProfile(opponent.floor, opponent.difficulty), seed, 'opponent',
    ),
  };
}

function runPair(
  comparison: AiDifficultyComparison,
  seed: number,
  tickLimit?: number,
): MirroredDifficultyPair {
  return {
    seed,
    higherAsPlayer: runAiSimulation({
      seed,
      floor: comparison.higher.floor,
      controllers: controllersFor(seed, comparison.higher, comparison.lower),
      ...(tickLimit === undefined ? {} : { tickLimit }),
    }),
    higherAsOpponent: runAiSimulation({
      seed,
      floor: comparison.higher.floor,
      controllers: controllersFor(seed, comparison.lower, comparison.higher),
      ...(tickLimit === undefined ? {} : { tickLimit }),
    }),
  };
}

function calibrationSeeds(seeds: readonly number[] | undefined): readonly number[] {
  if (seeds === undefined) {
    return Array.from(
      { length: AI_DIFFICULTY_CALIBRATION_SEED_PAIRS },
      (_, index) => index + 1,
    );
  }
  if (seeds.length === 0) throw new RangeError('calibration seeds must not be empty');
  if (seeds.some((seed) => !Number.isSafeInteger(seed) || seed <= 0)) {
    throw new RangeError('calibration seeds must be positive safe integers');
  }
  if (new Set(seeds).size !== seeds.length) {
    throw new RangeError('calibration seeds must be unique');
  }
  return seeds;
}

export function runAiDifficultyCalibration(options: {
  readonly seeds?: readonly number[];
  readonly tickLimit?: number;
} = {}): readonly AiDifficultyComparisonReport[] {
  const seeds = calibrationSeeds(options.seeds);
  return AI_DIFFICULTY_COMPARISONS.map((comparison) =>
    summarizeDifficultyComparison(
      comparison,
      seeds.map((seed) => runPair(comparison, seed, options.tickLimit)),
    ));
}

export function assertAiDifficultyCalibration(
  reports: readonly AiDifficultyComparisonReport[],
): void {
  const ids = reports.map(({ comparison }) => comparison.id);
  const requiredIds = AI_DIFFICULTY_COMPARISONS.map(({ id }) => id);
  if (reports.length !== requiredIds.length
    || new Set(ids).size !== requiredIds.length
    || requiredIds.some((id) => !ids.includes(id))) {
    throw new Error('calibration reports must contain all three unique comparison IDs');
  }

  for (const report of reports) {
    const comparison = AI_DIFFICULTY_COMPARISONS.find(
      ({ id }) => id === report.comparison.id,
    )!;
    if (report.seedPairs < AI_DIFFICULTY_CALIBRATION_SEED_PAIRS) {
      throw new Error(`${comparison.id} requires at least 128 seed pairs`);
    }
    if (report.games < AI_DIFFICULTY_CALIBRATION_SEED_PAIRS * 2) {
      throw new Error(`${comparison.id} requires at least 256 games`);
    }
    if (report.rejectedCommands !== 0) {
      throw new Error(`${comparison.id} has rejected commands`);
    }
    if (report.cappedMatches !== 0) {
      throw new Error(`${comparison.id} has capped matches`);
    }
    const clearsShare = comparison.strictShare
      ? report.higherShare > comparison.minimumHigherShare
      : report.higherShare >= comparison.minimumHigherShare;
    if (!clearsShare) {
      throw new Error(`${comparison.id} higher-side share misses its threshold`);
    }
    if (!(report.oneSidedPValue < .05)) {
      throw new Error(`${comparison.id} one-sided sign-test p-value must be below .05`);
    }
  }
}
