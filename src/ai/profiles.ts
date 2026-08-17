import {
  isDifficulty,
  isFloor,
  type Difficulty,
  type Floor,
} from '../progression/index';
import type { AiFloorProfile, AiSkillStep, AiStrengthLevel } from './types';

const ROOKIE_HEURISTIC_WEIGHTS: AiFloorProfile['weights'] = {
  aggregateHeight: -0.25,
  maxHeight: -0.5,
  holes: -2,
  bumpiness: -0.25,
  clearedLines: 0.8,
  combo: 0.3,
  incomingOffset: 0.4,
  itemGain: 0.5,
  opponentPressure: 0,
};

const EXPERT_HEURISTIC_WEIGHTS: AiFloorProfile['weights'] = {
  aggregateHeight: -0.45,
  maxHeight: -1.2,
  holes: -5,
  bumpiness: -0.65,
  clearedLines: 1.5,
  combo: 1.8,
  incomingOffset: 1.8,
  itemGain: 1.5,
  opponentPressure: 0.6,
};

export const AI_SKILL_LADDER: readonly AiSkillStep[] = [
  { reactionTicks: 48, lookahead: 0, rankWeights: [.20, .20, .20, .20, .20], futureDiscount: .00, heuristicBlend: .00, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 44, lookahead: 0, rankWeights: [.28, .24, .20, .16, .12], futureDiscount: .00, heuristicBlend: .07, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 40, lookahead: 0, rankWeights: [.36, .26, .18, .12, .08], futureDiscount: .00, heuristicBlend: .14, itemPolicy: 'FIRST_VALID' },
  { reactionTicks: 36, lookahead: 0, rankWeights: [.44, .27, .16, .09, .04], futureDiscount: .00, heuristicBlend: .21, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 32, lookahead: 0, rankWeights: [.52, .28, .14, .06], futureDiscount: .00, heuristicBlend: .29, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 29, lookahead: 1, rankWeights: [.56, .28, .12, .04], futureDiscount: .56, heuristicBlend: .36, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 26, lookahead: 1, rankWeights: [.62, .25, .10, .03], futureDiscount: .58, heuristicBlend: .43, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 23, lookahead: 1, rankWeights: [.68, .22, .08, .02], futureDiscount: .60, heuristicBlend: .50, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 20, lookahead: 1, rankWeights: [.74, .20, .06], futureDiscount: .62, heuristicBlend: .57, itemPolicy: 'RISK_AWARE' },
  { reactionTicks: 17, lookahead: 1, rankWeights: [.80, .16, .04], futureDiscount: .64, heuristicBlend: .64, itemPolicy: 'TACTICAL' },
  { reactionTicks: 14, lookahead: 2, rankWeights: [.84, .13, .03], futureDiscount: .66, heuristicBlend: .71, itemPolicy: 'TACTICAL' },
  { reactionTicks: 12, lookahead: 2, rankWeights: [.88, .10, .02], futureDiscount: .68, heuristicBlend: .79, itemPolicy: 'TACTICAL' },
  { reactionTicks: 10, lookahead: 2, rankWeights: [.92, .08], futureDiscount: .70, heuristicBlend: .86, itemPolicy: 'TACTICAL' },
  { reactionTicks: 8, lookahead: 2, rankWeights: [.96, .04], futureDiscount: .72, heuristicBlend: .93, itemPolicy: 'TACTICAL' },
  { reactionTicks: 6, lookahead: 2, rankWeights: [1], futureDiscount: .74, heuristicBlend: 1, itemPolicy: 'TACTICAL' },
];

const HEURISTIC_NAMES = [
  'aggregateHeight', 'maxHeight', 'holes', 'bumpiness', 'clearedLines',
  'combo', 'incomingOffset', 'itemGain', 'opponentPressure',
] as const;
const POLICY_STRENGTH = { FIRST_VALID: 0, RISK_AWARE: 1, TACTICAL: 2 } as const;
const LEVEL_OFFSET = { easy: 0, normal: 5, hard: 10 } as const;

function cumulative(weights: readonly number[], count: number): number {
  return weights.slice(0, count).reduce((sum, weight) => sum + weight, 0);
}

export function assertValidAiSkillLadder(ladder: readonly AiSkillStep[]): void {
  if (ladder.length !== 15) throw new RangeError('AI skill ladder must contain exactly 15 steps');
  ladder.forEach((step, index) => {
    const level = index + 1;
    if (!Number.isInteger(step.reactionTicks) || step.reactionTicks <= 0) {
      throw new RangeError(`AI skill level ${level} reaction ticks must be a positive integer`);
    }
    if (step.lookahead !== 0 && step.lookahead !== 1 && step.lookahead !== 2) {
      throw new RangeError(`AI skill level ${level} lookahead is invalid`);
    }
    if (!Number.isFinite(step.futureDiscount) || step.futureDiscount < 0 || step.futureDiscount > 1) {
      throw new RangeError(`AI skill level ${level} future discount is invalid`);
    }
    if (!Number.isFinite(step.heuristicBlend) || step.heuristicBlend < 0 || step.heuristicBlend > 1) {
      throw new RangeError(`AI skill level ${level} heuristic blend is invalid`);
    }
    if (!Object.hasOwn(POLICY_STRENGTH, step.itemPolicy)) {
      throw new RangeError(`AI skill level ${level} item policy is invalid`);
    }
    if (step.rankWeights.length < 1 || step.rankWeights.length > 5
      || step.rankWeights.some((weight, rank) => !Number.isFinite(weight)
        || weight < 0 || (rank > 0 && weight > step.rankWeights[rank - 1]! + 1e-10))) {
      throw new RangeError(`AI skill level ${level} rank weights are invalid`);
    }
    const total = step.rankWeights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 1e-10) {
      throw new RangeError(`AI skill level ${level} rank weights must sum to 1`);
    }
    if (index === 0) return;
    const previous = ladder[index - 1]!;
    if (step.reactionTicks >= previous.reactionTicks
      || step.lookahead < previous.lookahead
      || step.futureDiscount < previous.futureDiscount
      || step.heuristicBlend < previous.heuristicBlend
      || POLICY_STRENGTH[step.itemPolicy] < POLICY_STRENGTH[previous.itemPolicy]) {
      throw new RangeError(`AI skill level ${level} regresses from level ${level - 1}`);
    }
    for (let count = 1; count <= 5; count += 1) {
      if (cumulative(step.rankWeights, count) + 1e-10 < cumulative(previous.rankWeights, count)) {
        throw new RangeError(`AI skill level ${level} rank distribution regresses`);
      }
    }
  });
}

function interpolateWeights(blend: number): AiFloorProfile['weights'] {
  return Object.fromEntries(HEURISTIC_NAMES.map((name) => [
    name,
    ROOKIE_HEURISTIC_WEIGHTS[name]
      + (EXPERT_HEURISTIC_WEIGHTS[name] - ROOKIE_HEURISTIC_WEIGHTS[name]) * blend,
  ])) as unknown as AiFloorProfile['weights'];
}

export function getAiStrengthLevel(difficulty: Difficulty, floor: Floor): AiStrengthLevel {
  if (!isDifficulty(difficulty) || !isFloor(floor)) {
    if (!isFloor(floor)) throw new RangeError(`Missing AI profile for floor ${String(floor)}`);
    throw new RangeError(`Missing AI difficulty ${String(difficulty)}`);
  }
  return (LEVEL_OFFSET[difficulty] + floor) as AiStrengthLevel;
}

function profileForLevel(level: AiStrengthLevel): AiFloorProfile {
  const step = AI_SKILL_LADDER[level - 1]!;
  const topK = step.rankWeights.length as AiFloorProfile['topK'];
  return {
    floor: (((level - 1) % 5) + 1) as Floor,
    reactionTicks: step.reactionTicks,
    lookahead: step.lookahead,
    topK,
    rankWeights: step.rankWeights,
    futureDiscount: step.futureDiscount,
    weights: interpolateWeights(step.heuristicBlend),
    itemPolicy: step.itemPolicy,
  };
}

assertValidAiSkillLadder(AI_SKILL_LADDER);
const AI_PROFILES_BY_LEVEL = AI_SKILL_LADDER.map((_, index) =>
  profileForLevel((index + 1) as AiStrengthLevel));
export const AI_FLOOR_PROFILES: readonly AiFloorProfile[] = AI_PROFILES_BY_LEVEL.slice(0, 5);

export function getAiFloorProfile(
  floor: Floor,
  difficulty: Difficulty = 'easy',
): AiFloorProfile {
  return AI_PROFILES_BY_LEVEL[getAiStrengthLevel(difficulty, floor) - 1]!;
}
