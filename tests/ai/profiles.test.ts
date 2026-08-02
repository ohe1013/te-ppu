import { describe, expect, it } from 'vitest';
import { createAiObservation, createMatch } from '../../src/core/index';
import {
  AI_FLOOR_PROFILES,
  getAiFloorProfile,
} from '../../src/ai/index';

const expectedWeights = [
  [-0.25, -0.5, -2, -0.25, 0.8, 0.3, 0.4, 0.5, 0],
  [-0.3, -0.65, -2.75, -0.35, 1, 0.6, 0.75, 0.8, 0.1],
  [-0.35, -0.8, -3.5, -0.45, 1.2, 0.9, 1.1, 1.2, 0.2],
  [-0.4, -1, -4.25, -0.55, 1.35, 1.35, 1.45, 1.35, 0.4],
  [-0.45, -1.2, -5, -0.65, 1.5, 1.8, 1.8, 1.5, 0.6],
] as const;

describe('AI floor profiles', () => {
  it('defines the approved five-level timing, search, selection, and item-policy ladder', () => {
    expect(AI_FLOOR_PROFILES.map(({
      floor,
      reactionTicks,
      lookahead,
      topK,
      rankWeights,
      futureDiscount,
      itemPolicy,
    }) => ({
      floor,
      reactionTicks,
      lookahead,
      topK,
      rankWeights,
      futureDiscount,
      itemPolicy,
    }))).toEqual([
      { floor: 1, reactionTicks: 48, lookahead: 0, topK: 5, rankWeights: [.2, .2, .2, .2, .2], futureDiscount: 0, itemPolicy: 'FIRST_VALID' },
      { floor: 2, reactionTicks: 38, lookahead: 0, topK: 4, rankWeights: [.4, .3, .2, .1], futureDiscount: 0, itemPolicy: 'RISK_AWARE' },
      { floor: 3, reactionTicks: 27, lookahead: 1, topK: 3, rankWeights: [.6, .3, .1], futureDiscount: .65, itemPolicy: 'RISK_AWARE' },
      { floor: 4, reactionTicks: 19, lookahead: 1, topK: 2, rankWeights: [.75, .25], futureDiscount: .68, itemPolicy: 'TACTICAL' },
      { floor: 5, reactionTicks: 12, lookahead: 2, topK: 1, rankWeights: [1], futureDiscount: .7, itemPolicy: 'TACTICAL' },
    ]);
  });

  it('defines exact ordered heuristic weights and a valid ordered probability distribution per floor', () => {
    expect(AI_FLOOR_PROFILES.map((profile) => [
      profile.weights.aggregateHeight,
      profile.weights.maxHeight,
      profile.weights.holes,
      profile.weights.bumpiness,
      profile.weights.clearedLines,
      profile.weights.combo,
      profile.weights.incomingOffset,
      profile.weights.itemGain,
      profile.weights.opponentPressure,
    ])).toEqual(expectedWeights);
    expect(AI_FLOOR_PROFILES.map(({ floor }) => floor)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(AI_FLOOR_PROFILES.map(({ floor }) => floor)).size).toBe(5);
    for (const profile of AI_FLOOR_PROFILES) {
      expect(profile.reactionTicks).toBeGreaterThan(0);
      expect(profile.reactionTicks % 1).toBe(0);
      expect(profile.topK).toBeGreaterThan(0);
      expect(profile.topK % 1).toBe(0);
      expect(profile.rankWeights).toHaveLength(profile.topK);
      expect(profile.rankWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
    }
  });

  it('returns the checked profile matching each floor', () => {
    for (const profile of AI_FLOOR_PROFILES) {
      expect(getAiFloorProfile(profile.floor)).toBe(profile);
    }
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
