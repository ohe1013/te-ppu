import { describe, expect, it } from 'vitest';
import { createAiObservation, createMatch } from '../../src/core/index';
import {
  AI_FLOOR_PROFILES,
  AI_SKILL_LADDER,
  assertValidAiSkillLadder,
  getAiFloorProfile,
  getAiStrengthLevel,
} from '../../src/ai/index';

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const expectedLevels = [
  ['easy', 1, 1], ['easy', 2, 2], ['easy', 3, 3], ['easy', 4, 4], ['easy', 5, 5],
  ['normal', 1, 6], ['normal', 2, 7], ['normal', 3, 8], ['normal', 4, 9], ['normal', 5, 10],
  ['hard', 1, 11], ['hard', 2, 12], ['hard', 3, 13], ['hard', 4, 14], ['hard', 5, 15],
] as const;
const HEURISTICS = [
  'aggregateHeight', 'maxHeight', 'holes', 'bumpiness', 'clearedLines',
  'combo', 'incomingOffset', 'itemGain', 'opponentPressure',
] as const;

function profilesByLevel() {
  return expectedLevels.map(([difficulty, floor]) => getAiFloorProfile(floor, difficulty));
}

describe('global AI skill ladder', () => {
  it.each(expectedLevels)('maps %s floor %i to global level %i', (difficulty, floor, level) => {
    expect(getAiStrengthLevel(difficulty, floor)).toBe(level);
  });

  it('keeps both difficulty boundaries strict and Hard 5 globally maximal', () => {
    expect(getAiStrengthLevel('easy', 5)).toBeLessThan(getAiStrengthLevel('normal', 1));
    expect(getAiStrengthLevel('normal', 5)).toBeLessThan(getAiStrengthLevel('hard', 1));
    expect(getAiStrengthLevel('hard', 5)).toBe(15);
  });

  it('makes every adjacent generated profile stronger without regressing selection mass', () => {
    const policyRank = { FIRST_VALID: 0, RISK_AWARE: 1, TACTICAL: 2 } as const;
    const profiles = profilesByLevel();

    for (let index = 1; index < profiles.length; index += 1) {
      const previous = profiles[index - 1]!;
      const current = profiles[index]!;
      expect(current.reactionTicks).toBeLessThan(previous.reactionTicks);
      expect(current.lookahead).toBeGreaterThanOrEqual(previous.lookahead);
      expect(current.futureDiscount).toBeGreaterThanOrEqual(previous.futureDiscount);
      expect(AI_SKILL_LADDER[index]!.heuristicBlend)
        .toBeGreaterThanOrEqual(AI_SKILL_LADDER[index - 1]!.heuristicBlend);
      expect(policyRank[current.itemPolicy]).toBeGreaterThanOrEqual(policyRank[previous.itemPolicy]);
      for (let bestN = 1; bestN <= 5; bestN += 1) {
        const mass = (weights: readonly number[]) => [...weights, 0, 0, 0, 0, 0].slice(0, bestN)
          .reduce((sum, weight) => sum + weight, 0);
        expect(mass(current.rankWeights)).toBeGreaterThanOrEqual(mass(previous.rankWeights) - 1e-10);
      }
    }
  });

  it('derives valid generated profiles with topK tied to the real distribution length', () => {
    for (const [difficulty, floor, level] of expectedLevels) {
      const profile = getAiFloorProfile(floor, difficulty);
      expect(profile.floor).toBe(((level - 1) % 5) + 1);
      expect(profile.topK).toBe(profile.rankWeights.length);
      expect(profile.rankWeights.every(Number.isFinite)).toBe(true);
      expect(profile.rankWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    }
  });

  it('interpolates rookie and expert heuristic ordering through a real interior Normal profile', () => {
    const rookie = getAiFloorProfile(1, 'easy');
    const normal = getAiFloorProfile(1, 'normal');
    const expert = getAiFloorProfile(5, 'hard');

    expect(rookie.weights.holes).toBeGreaterThan(expert.weights.holes);
    expect(rookie.weights.maxHeight).toBeGreaterThan(expert.weights.maxHeight);
    expect(rookie.weights.clearedLines).toBeLessThan(expert.weights.clearedLines);
    expect(rookie.weights.combo).toBeLessThan(expert.weights.combo);
    expect(rookie.weights.incomingOffset).toBeLessThan(expert.weights.incomingOffset);
    expect(rookie.weights.itemGain).toBeLessThan(expert.weights.itemGain);
    expect(rookie.weights.opponentPressure).toBeLessThan(expert.weights.opponentPressure);
    for (const name of HEURISTICS) {
      expect(normal.weights[name]).toBeGreaterThanOrEqual(Math.min(
        rookie.weights[name], expert.weights[name],
      ));
      expect(normal.weights[name]).toBeLessThanOrEqual(Math.max(
        rookie.weights[name], expert.weights[name],
      ));
    }
    expect(HEURISTICS.some((name) => normal.weights[name] !== rookie.weights[name]
      && normal.weights[name] !== expert.weights[name])).toBe(true);
  });

  it('caches profiles per difficulty and floor while keeping difficulty bands distinct', () => {
    for (const floor of [1, 2, 3, 4, 5] as const) {
      for (const difficulty of DIFFICULTIES) {
        expect(getAiFloorProfile(floor, difficulty)).toBe(getAiFloorProfile(floor, difficulty));
      }
      expect(getAiFloorProfile(floor, 'easy')).not.toBe(getAiFloorProfile(floor, 'normal'));
      expect(getAiFloorProfile(floor, 'normal')).not.toBe(getAiFloorProfile(floor, 'hard'));
      expect(getAiFloorProfile(floor)).toBe(AI_FLOOR_PROFILES[floor - 1]);
    }
  });

  it('rejects malformed ladder data and invalid floors with actionable errors', () => {
    expect(() => assertValidAiSkillLadder(AI_SKILL_LADDER.slice(0, 14)))
      .toThrow('AI skill ladder must contain exactly 15 steps');
    expect(() => assertValidAiSkillLadder([
      { ...AI_SKILL_LADDER[0]!, rankWeights: [.2, .2] },
      ...AI_SKILL_LADDER.slice(1),
    ])).toThrow('AI skill level 1 rank weights must sum to 1');
    expect(() => getAiFloorProfile(6 as never)).toThrow('Missing AI profile for floor 6');
  });

  it('keeps the opponent observation free of preview and ghost information', () => {
    const observation = createAiObservation(
      createMatch({ matchSeed: 7, countdownTicks: 0 }),
      'opponent',
    );

    expect(Object.keys(observation.opponent)).not.toContain('next');
    expect(Object.keys(observation.opponent)).not.toContain('ghostY');
  });
});
