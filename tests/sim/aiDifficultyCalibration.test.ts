import { describe, expect, it } from 'vitest';
import {
  AI_DIFFICULTY_CALIBRATION_SEED_PAIRS,
  AI_DIFFICULTY_COMPARISONS,
  assertAiDifficultyCalibration,
  exactOneSidedSignPValue,
  runAiDifficultyCalibration,
  summarizeDifficultyComparison,
  type AiDifficultyComparisonReport,
} from '../../src/sim/aiDifficultyCalibration';
import type { SimulationSummary } from '../../src/sim/aiSimulation';

function summary(
  outcome: SimulationSummary['outcome'],
  overrides: Partial<SimulationSummary> = {},
): SimulationSummary {
  return {
    outcome,
    ticks: 100,
    stateHash: 'state-hash',
    eventHash: 'event-hash',
    rejectedCommands: 0,
    exceededTickLimit: false,
    ...overrides,
  };
}

function passingReports(): AiDifficultyComparisonReport[] {
  return AI_DIFFICULTY_COMPARISONS.map((comparison) => ({
    comparison,
    seedPairs: 128,
    games: 256,
    higherPoints: comparison.strictShare ? 131 : 167,
    higherShare: comparison.strictShare ? .51 : .65,
    pairedWins: 80,
    pairedLosses: 40,
    pairedTies: 8,
    oneSidedPValue: .01,
    rejectedCommands: 0,
    cappedMatches: 0,
  }));
}

describe('AI difficulty calibration statistics', () => {
  it('calculates the exact one-sided sign-test upper tail', () => {
    expect(exactOneSidedSignPValue(7, 0)).toBeCloseTo(0.0078125, 12);
    expect(exactOneSidedSignPValue(6, 1)).toBeCloseTo(0.0625, 12);
    expect(exactOneSidedSignPValue(0, 7)).toBe(1);
    expect(exactOneSidedSignPValue(0, 0)).toBe(1);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [1.5, 0],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid sign-test counts (%s, %s)', (wins, losses) => {
    expect(() => exactOneSidedSignPValue(wins, losses)).toThrow(
      'sign-test counts must be non-negative safe integers',
    );
  });

  it('scores each higher profile from both mirrored sides and aggregates pair results', () => {
    const report = summarizeDifficultyComparison(AI_DIFFICULTY_COMPARISONS[0]!, [
      {
        seed: 1,
        higherAsPlayer: summary('player'),
        higherAsOpponent: summary('opponent'),
      },
      {
        seed: 2,
        higherAsPlayer: summary('draw'),
        higherAsOpponent: summary('draw'),
      },
    ]);

    expect(report).toEqual({
      comparison: AI_DIFFICULTY_COMPARISONS[0],
      seedPairs: 2,
      games: 4,
      higherPoints: 3,
      higherShare: .75,
      pairedWins: 1,
      pairedLosses: 0,
      pairedTies: 1,
      oneSidedPValue: .5,
      rejectedCommands: 0,
      cappedMatches: 0,
    });
  });

  it('aggregates losses, rejected commands, and capped matches from both games', () => {
    const report = summarizeDifficultyComparison(AI_DIFFICULTY_COMPARISONS[1]!, [
      {
        seed: 9,
        higherAsPlayer: summary('opponent', {
          rejectedCommands: 2,
          exceededTickLimit: true,
        }),
        higherAsOpponent: summary('player', {
          rejectedCommands: 3,
          exceededTickLimit: true,
        }),
      },
    ]);

    expect(report).toMatchObject({
      higherPoints: 0,
      higherShare: 0,
      pairedWins: 0,
      pairedLosses: 1,
      pairedTies: 0,
      oneSidedPValue: 1,
      rejectedCommands: 5,
      cappedMatches: 2,
    });
  });
});

describe('AI difficulty calibration thresholds', () => {
  it('accepts complete canonical reports that clear every threshold', () => {
    expect(AI_DIFFICULTY_CALIBRATION_SEED_PAIRS).toBe(128);
    expect(AI_DIFFICULTY_COMPARISONS.map((comparison) => comparison.id)).toEqual([
      'easy5-normal1',
      'normal5-hard1',
      'easy1-hard5',
    ]);
    expect(() => assertAiDifficultyCalibration(passingReports())).not.toThrow();
  });

  it.each([
    ['a boundary share of .5', 0, { higherShare: .5 }],
    ['an endpoint share below .65', 2, { higherShare: .649 }],
    ['a p-value of .05', 1, { oneSidedPValue: .05 }],
    ['a rejected command', 0, { rejectedCommands: 1 }],
    ['a capped match', 0, { cappedMatches: 1 }],
    ['fewer than 128 seed pairs', 0, { seedPairs: 127 }],
    ['fewer than 256 games', 0, { games: 255 }],
  ] satisfies readonly [string, number, Partial<AiDifficultyComparisonReport>][]) (
    'rejects %s',
    (_label, reportIndex, override) => {
      const reports = passingReports();
      reports[reportIndex] = { ...reports[reportIndex]!, ...override };
      expect(() => assertAiDifficultyCalibration(reports)).toThrow();
    },
  );

  it('rejects a missing or duplicate comparison ID', () => {
    const reports = passingReports();
    expect(() => assertAiDifficultyCalibration(reports.slice(0, 2))).toThrow();
    expect(() => assertAiDifficultyCalibration([
      reports[0]!,
      reports[1]!,
      { ...reports[2]!, comparison: reports[0]!.comparison },
    ])).toThrow();
  });
});

describe('AI difficulty calibration runner', () => {
  it.each([
    { seeds: [], label: 'empty' },
    { seeds: [1, 1], label: 'duplicate' },
    { seeds: [0], label: 'zero' },
    { seeds: [-1], label: 'negative' },
    { seeds: [1.5], label: 'fractional' },
    { seeds: [Number.MAX_SAFE_INTEGER + 1], label: 'unsafe' },
  ])('rejects $label seed lists before running matches', ({ seeds }) => {
    expect(() => runAiDifficultyCalibration({ seeds })).toThrow();
  });

  it('runs one bounded mirrored pair per comparison with real controllers', () => {
    const reports = runAiDifficultyCalibration({ seeds: [1], tickLimit: 1 });

    expect(reports.map(({ comparison, seedPairs, games, cappedMatches }) => ({
      id: comparison.id,
      seedPairs,
      games,
      cappedMatches,
    }))).toEqual([
      { id: 'easy5-normal1', seedPairs: 1, games: 2, cappedMatches: 2 },
      { id: 'normal5-hard1', seedPairs: 1, games: 2, cappedMatches: 2 },
      { id: 'easy1-hard5', seedPairs: 1, games: 2, cappedMatches: 2 },
    ]);
  });
});
