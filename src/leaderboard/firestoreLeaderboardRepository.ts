import type { Difficulty, ScoreRecord } from '../progression';
import { isBetterScore } from '../scoring';
import type {
  FirestoreLeaderboardDocument,
  FirestoreLeaderboardGateway,
  FirestoreLeaderboardQuery,
  FirestoreLeaderboardSnapshot,
} from './firebase-gateway';
import type { LeaderboardEntry, LeaderboardRepository } from './types';

const TOP_TWENTY_ORDER: FirestoreLeaderboardQuery['orderBy'] = [
  { field: 'score', direction: 'desc' },
  { field: 'durationTicks', direction: 'asc' },
  { field: 'updatedAt', direction: 'asc' },
];

function toScoreRecord(
  document: FirestoreLeaderboardDocument,
  difficulty: Difficulty,
): ScoreRecord {
  return {
    schemaVersion: document.schemaVersion,
    initials: document.initials,
    characterId: document.characterId,
    difficulty,
    score: document.score,
    durationTicks: document.durationTicks,
    reachedFloor: document.reachedFloor,
    encountersWon: document.encountersWon,
    owlDefeated: document.owlDefeated,
    achievedAt: '',
  };
}

function timestampToIsoString(value: unknown): string {
  if (typeof value === 'string') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = value.toDate;
    if (typeof toDate === 'function') {
      const date = toDate.call(value) as unknown;
      if (date instanceof Date) return date.toISOString();
    }
  }
  throw new Error('Leaderboard entry has an invalid updatedAt timestamp.');
}

function toLeaderboardEntry(
  snapshot: FirestoreLeaderboardSnapshot,
  difficulty: Difficulty,
): LeaderboardEntry {
  const { updatedAt, ...score } = snapshot.data;
  return {
    ...score,
    difficulty,
    userId: snapshot.id,
    updatedAt: timestampToIsoString(updatedAt),
  };
}

export function createFirestoreLeaderboardRepository(
  gateway: FirestoreLeaderboardGateway,
): LeaderboardRepository {
  let currentUserId: Promise<string> | null = null;
  const authenticate = (): Promise<string> => {
    currentUserId ??= gateway.authenticateAnonymously().catch((error: unknown) => {
      currentUserId = null;
      throw error;
    });
    return currentUserId;
  };

  return {
    kind: 'firestore',

    async getTop(difficulty, topLimit = 20) {
      let userId: string;
      try {
        userId = await authenticate();
      } catch {
        return { ok: false, reason: 'AUTH_FAILED', entries: [] };
      }

      try {
        const snapshots = await gateway.queryPlayers({
          collectionPath: `leaderboards/${difficulty}/players`,
          orderBy: TOP_TWENTY_ORDER,
          limit: topLimit,
        });
        return {
          ok: true,
          source: 'firestore',
          currentUserId: userId,
          entries: snapshots.map((snapshot) => toLeaderboardEntry(snapshot, difficulty)),
        };
      } catch {
        return { ok: false, reason: 'READ_FAILED', entries: [] };
      }
    },

    async submitBest(record) {
      let userId: string;
      try {
        userId = await authenticate();
      } catch {
        return { ok: false, reason: 'AUTH_FAILED' };
      }

      try {
        await gateway.runPlayerTransaction(
          `leaderboards/${record.difficulty}/players/${userId}`,
          (current) => {
            if (current !== null && !isBetterScore(record, toScoreRecord(current, record.difficulty))) {
              return null;
            }
            return {
              schemaVersion: 1,
              initials: record.initials,
              characterId: record.characterId,
              score: record.score,
              durationTicks: record.durationTicks,
              reachedFloor: record.reachedFloor,
              encountersWon: record.encountersWon,
              owlDefeated: record.owlDefeated,
              updatedAt: gateway.serverTimestamp(),
            };
          },
        );
        return { ok: true, source: 'firestore' };
      } catch {
        return { ok: false, reason: 'WRITE_FAILED' };
      }
    },
  };
}
