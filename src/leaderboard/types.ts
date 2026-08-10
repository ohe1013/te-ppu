import type { Difficulty, ScoreRecord } from '../progression';

export interface LeaderboardEntry extends Omit<ScoreRecord, 'achievedAt'> {
  readonly userId: string;
  readonly updatedAt: string;
}

export type LeaderboardReadResult =
  | {
      readonly ok: true;
      readonly source: 'local' | 'firestore';
      readonly currentUserId: string | null;
      readonly entries: readonly LeaderboardEntry[];
    }
  | {
      readonly ok: false;
      readonly reason: 'AUTH_FAILED' | 'READ_FAILED';
      readonly entries: readonly [];
    };

export type LeaderboardWriteResult =
  | { readonly ok: true; readonly source: 'local' | 'firestore' }
  | { readonly ok: false; readonly reason: 'AUTH_FAILED' | 'WRITE_FAILED' };

export interface LeaderboardRepository {
  readonly kind: 'local' | 'firestore';
  getTop(difficulty: Difficulty, limit?: 20): Promise<LeaderboardReadResult>;
  submitBest(record: ScoreRecord): Promise<LeaderboardWriteResult>;
}
