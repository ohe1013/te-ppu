import { describe, expect, it } from 'vitest';
import type { PlayerProfile } from '../player';
import type { ScoreRecord } from '../progression';
import {
  createScoreRecord,
  isBetterScore,
  scorePlayerEvents,
} from './score-rules';

describe('scorePlayerEvents', () => {
  it.each([[1, 100], [2, 300], [3, 500], [4, 800]] as const)(
    'scores a %i-line clear as %i',
    (amount, score) => {
      expect(scorePlayerEvents([
        { type: 'lines-cleared', side: 'player', amount },
      ])).toBe(score);
    },
  );

  it('adds attacks and item uses while ignoring every opponent event', () => {
    expect(scorePlayerEvents([
      { type: 'attack-sent', side: 'player', amount: 3 },
      { type: 'item-used', side: 'player', item: 'freeze' },
      { type: 'lines-cleared', side: 'opponent', amount: 4 },
      { type: 'attack-sent', side: 'opponent', amount: 99 },
      { type: 'piece-locked', side: 'player' },
    ])).toBe(250);
  });
});

describe('score record rules', () => {
  const profile: PlayerProfile = {
    initials: 'RVT',
    characterId: 'hero-engineer',
  };

  const current: ScoreRecord = {
    schemaVersion: 1,
    initials: 'OLD',
    characterId: 'cloud-courier',
    difficulty: 'easy',
    score: 1_200,
    durationTicks: 700,
    reachedFloor: 2,
    encountersWon: 4,
    owlDefeated: false,
    achievedAt: '2026-08-09T00:00:00.000Z',
  };

  it('prefers score, then a shorter duration, while exact ties retain the existing record', () => {
    expect(isBetterScore({ ...current, score: 1_201 }, current)).toBe(true);
    expect(isBetterScore({ ...current, durationTicks: 699 }, current)).toBe(true);
    expect(isBetterScore({ ...current }, current)).toBe(false);
    expect(isBetterScore({ ...current, score: 1_199, durationTicks: 1 }, current)).toBe(false);
    expect(isBetterScore(current, null)).toBe(true);
  });

  it('converts an ended run to the exact version-one score record', () => {
    expect(createScoreRecord({
      difficulty: 'hard',
      score: 31_000,
      durationTicks: 3_840,
      reachedFloor: 5,
      encountersWon: 16,
      owlDefeated: true,
    }, profile, '2026-08-09T12:00:00.000Z')).toEqual({
      schemaVersion: 1,
      initials: 'RVT',
      characterId: 'hero-engineer',
      difficulty: 'hard',
      score: 31_000,
      durationTicks: 3_840,
      reachedFloor: 5,
      encountersWon: 16,
      owlDefeated: true,
      achievedAt: '2026-08-09T12:00:00.000Z',
    });
  });
});
