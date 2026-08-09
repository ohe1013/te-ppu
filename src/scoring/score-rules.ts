import type { GameEvent } from '../core';
import type { PlayerProfile } from '../player';
import type { ScoreRecord } from '../progression';
import type { EndedScoreRun } from './types';

const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800] as const;
const ATTACK_LINE_SCORE = 50;
const ITEM_USE_SCORE = 100;

function boundedAmount(amount: number | undefined, maximum: number): number {
  return Math.max(0, Math.min(maximum, amount ?? 0));
}

export function scorePlayerEvents(events: readonly GameEvent[]): number {
  return events.reduce((score, event) => {
    if (event.side !== 'player') return score;
    if (event.type === 'lines-cleared') {
      return score + LINE_CLEAR_SCORES[boundedAmount(event.amount, 4)]!;
    }
    if (event.type === 'attack-sent') {
      return score + boundedAmount(event.amount, Number.MAX_SAFE_INTEGER) * ATTACK_LINE_SCORE;
    }
    if (event.type === 'item-used') return score + ITEM_USE_SCORE;
    return score;
  }, 0);
}

export function isBetterScore(candidate: ScoreRecord, current: ScoreRecord | null): boolean {
  return current === null
    || candidate.score > current.score
    || (candidate.score === current.score && candidate.durationTicks < current.durationTicks);
}

export function createScoreRecord(
  summary: EndedScoreRun,
  profile: PlayerProfile,
  achievedAt: string,
): ScoreRecord {
  return {
    schemaVersion: 1,
    initials: profile.initials,
    characterId: profile.characterId,
    difficulty: summary.difficulty,
    score: summary.score,
    durationTicks: summary.durationTicks,
    reachedFloor: summary.reachedFloor,
    encountersWon: summary.encountersWon,
    owlDefeated: summary.owlDefeated,
    achievedAt,
  };
}
