import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '../progression';
import { createFirestoreLeaderboardRepository } from './firestoreLeaderboardRepository';
import type {
  FirestoreLeaderboardDocument,
  FirestoreLeaderboardGateway,
  FirestoreLeaderboardQuery,
  FirestoreLeaderboardSnapshot,
} from './firebase-gateway';

const RECORD: ScoreRecord = {
  schemaVersion: 1,
  initials: 'RVT',
  characterId: 'hero-engineer',
  difficulty: 'easy',
  score: 12_000,
  durationTicks: 3_600,
  reachedFloor: 5,
  encountersWon: 16,
  owlDefeated: true,
  achievedAt: '2026-08-09T12:00:00.000Z',
};

class FakeFirestoreGateway implements FirestoreLeaderboardGateway {
  readonly writes: Array<{ path: string; data: FirestoreLeaderboardDocument }> = [];
  readonly queries: FirestoreLeaderboardQuery[] = [];
  authenticationCount = 0;
  authenticationError: Error | null = null;
  transactionError: Error | null = null;
  queryError: Error | null = null;
  current: FirestoreLeaderboardDocument | null = null;
  snapshots: readonly FirestoreLeaderboardSnapshot[] = [];

  async authenticateAnonymously(): Promise<string> {
    this.authenticationCount += 1;
    if (this.authenticationError !== null) throw this.authenticationError;
    return 'firebase-user';
  }

  serverTimestamp(): unknown {
    return 'SERVER_TIMESTAMP';
  }

  async runPlayerTransaction(
    path: string,
    chooseWrite: (
      current: FirestoreLeaderboardDocument | null,
    ) => FirestoreLeaderboardDocument | null,
  ): Promise<void> {
    if (this.transactionError !== null) throw this.transactionError;
    const data = chooseWrite(this.current);
    if (data !== null) this.writes.push({ path, data });
  }

  async queryPlayers(query: FirestoreLeaderboardQuery): Promise<readonly FirestoreLeaderboardSnapshot[]> {
    if (this.queryError !== null) throw this.queryError;
    this.queries.push(query);
    return this.snapshots;
  }
}

function storedDocument(overrides: Partial<FirestoreLeaderboardDocument> = {}): FirestoreLeaderboardDocument {
  return {
    schemaVersion: 1,
    initials: 'OLD',
    characterId: 'cloud-courier',
    score: 11_000,
    durationTicks: 4_000,
    reachedFloor: 4,
    encountersWon: 12,
    owlDefeated: false,
    updatedAt: { toDate: () => new Date('2026-08-09T10:00:00.000Z') },
    ...overrides,
  };
}

describe('createFirestoreLeaderboardRepository', () => {
  it('requests anonymous authentication lazily once and writes the exact UID document payload', async () => {
    const gateway = new FakeFirestoreGateway();
    const repository = createFirestoreLeaderboardRepository(gateway);

    expect(repository.kind).toBe('firestore');
    expect(gateway.authenticationCount).toBe(0);

    await expect(repository.submitBest(RECORD)).resolves.toEqual({
      ok: true,
      source: 'firestore',
    });
    await expect(repository.getTop('easy')).resolves.toMatchObject({ ok: true });

    expect(gateway.authenticationCount).toBe(1);
    expect(gateway.writes).toEqual([{
      path: 'leaderboards/easy/players/firebase-user',
      data: {
        schemaVersion: 1,
        initials: 'RVT',
        characterId: 'hero-engineer',
        score: 12_000,
        durationTicks: 3_600,
        reachedFloor: 5,
        encountersWon: 16,
        owlDefeated: true,
        updatedAt: 'SERVER_TIMESTAMP',
      },
    }]);
    expect(gateway.writes[0]?.data).not.toHaveProperty('difficulty');
    expect(gateway.writes[0]?.data).not.toHaveProperty('achievedAt');
    expect(gateway.writes[0]?.data).not.toHaveProperty('userId');
  });

  it('writes only when score improves, then duration breaks a score tie', async () => {
    const gateway = new FakeFirestoreGateway();
    const repository = createFirestoreLeaderboardRepository(gateway);

    gateway.current = storedDocument({ score: 12_001, durationTicks: 100_000 });
    await repository.submitBest(RECORD);
    expect(gateway.writes).toHaveLength(0);

    gateway.current = storedDocument({ score: 12_000, durationTicks: 3_601 });
    await repository.submitBest(RECORD);
    expect(gateway.writes).toHaveLength(1);

    gateway.current = storedDocument({ score: 12_000, durationTicks: 3_600 });
    await repository.submitBest(RECORD);
    expect(gateway.writes).toHaveLength(1);
  });

  it('reads an ordered top twenty and rehydrates path and document metadata', async () => {
    const gateway = new FakeFirestoreGateway();
    gateway.snapshots = [{
      id: 'ranked-user',
      data: storedDocument({
        initials: 'TOP',
        score: 99_000,
        updatedAt: { toDate: () => new Date('2026-08-09T11:00:00.000Z') },
      }),
    }];
    const repository = createFirestoreLeaderboardRepository(gateway);

    await expect(repository.getTop('hard', 20)).resolves.toEqual({
      ok: true,
      source: 'firestore',
      currentUserId: 'firebase-user',
      entries: [{
        schemaVersion: 1,
        initials: 'TOP',
        characterId: 'cloud-courier',
        difficulty: 'hard',
        score: 99_000,
        durationTicks: 4_000,
        reachedFloor: 4,
        encountersWon: 12,
        owlDefeated: false,
        userId: 'ranked-user',
        updatedAt: '2026-08-09T11:00:00.000Z',
      }],
    });
    expect(gateway.queries).toEqual([{
      collectionPath: 'leaderboards/hard/players',
      orderBy: [
        { field: 'score', direction: 'desc' },
        { field: 'durationTicks', direction: 'asc' },
        { field: 'updatedAt', direction: 'asc' },
      ],
      limit: 20,
    }]);
  });

  it('distinguishes authentication failures from read and write failures', async () => {
    const authGateway = new FakeFirestoreGateway();
    authGateway.authenticationError = new Error('auth unavailable');
    const authRepository = createFirestoreLeaderboardRepository(authGateway);
    await expect(authRepository.getTop('easy')).resolves.toEqual({
      ok: false,
      reason: 'AUTH_FAILED',
      entries: [],
    });
    await expect(authRepository.submitBest(RECORD)).resolves.toEqual({
      ok: false,
      reason: 'AUTH_FAILED',
    });

    const gateway = new FakeFirestoreGateway();
    gateway.queryError = new Error('read unavailable');
    gateway.transactionError = new Error('write unavailable');
    const repository = createFirestoreLeaderboardRepository(gateway);
    await expect(repository.getTop('easy')).resolves.toEqual({
      ok: false,
      reason: 'READ_FAILED',
      entries: [],
    });
    await expect(repository.submitBest(RECORD)).resolves.toEqual({
      ok: false,
      reason: 'WRITE_FAILED',
    });
  });
});
