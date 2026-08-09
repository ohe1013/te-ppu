import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoreRecord } from '../progression';
import { createLeaderboardRepository } from './createLeaderboardRepository';
import { parseFirebaseWebConfig } from './firebase-config';

const firebaseSdkFactory = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: 'leaderboard-app' })),
  getAuth: vi.fn(() => ({ currentUser: { uid: 'password-user' } })),
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'anonymous-user' } })),
  getFirestore: vi.fn(() => ({ name: 'leaderboard-firestore' })),
  collection: vi.fn(() => ({ type: 'collection' })),
  doc: vi.fn(() => ({ type: 'document' })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(() => ({ type: 'limit' })),
  orderBy: vi.fn(() => ({ type: 'order-by' })),
  query: vi.fn(() => ({ type: 'query' })),
  runTransaction: vi.fn(async (_firestore, update) => update({
    get: vi.fn(async () => ({ exists: () => false })),
    set: vi.fn(),
  })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/app', () => ({
  initializeApp: firebaseSdkFactory.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseSdkFactory.getAuth,
  signInAnonymously: firebaseSdkFactory.signInAnonymously,
}));

vi.mock('firebase/firestore', () => ({
  collection: firebaseSdkFactory.collection,
  doc: firebaseSdkFactory.doc,
  getDocs: firebaseSdkFactory.getDocs,
  getFirestore: firebaseSdkFactory.getFirestore,
  limit: firebaseSdkFactory.limit,
  orderBy: firebaseSdkFactory.orderBy,
  query: firebaseSdkFactory.query,
  runTransaction: firebaseSdkFactory.runTransaction,
  serverTimestamp: firebaseSdkFactory.serverTimestamp,
}));

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

const COMPLETE_FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'game.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'game',
  VITE_FIREBASE_APP_ID: '1:web:abc',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseFirebaseWebConfig', () => {
  it('enables Firebase only when all four trimmed values exist', () => {
    expect(parseFirebaseWebConfig({})).toBeNull();
    expect(parseFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: '   ',
      VITE_FIREBASE_AUTH_DOMAIN: false,
    })).toBeNull();

    expect(() => parseFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_AUTH_DOMAIN: 'domain',
    })).toThrow(/partial Firebase configuration/i);

    expect(parseFirebaseWebConfig({
      VITE_FIREBASE_API_KEY: ' key ',
      VITE_FIREBASE_AUTH_DOMAIN: ' game.firebaseapp.com ',
      VITE_FIREBASE_PROJECT_ID: ' game ',
      VITE_FIREBASE_APP_ID: ' 1:web:abc ',
    })).toEqual({
      apiKey: 'key',
      authDomain: 'game.firebaseapp.com',
      projectId: 'game',
      appId: '1:web:abc',
    });
  });
});

describe('createLeaderboardRepository', () => {
  it('does not initialize Firebase App, Auth, or Firestore during complete-config construction', () => {
    const repository = createLeaderboardRepository(COMPLETE_FIREBASE_ENV);

    expect(repository.kind).toBe('firestore');
    expect(firebaseSdkFactory.initializeApp).not.toHaveBeenCalled();
    expect(firebaseSdkFactory.getAuth).not.toHaveBeenCalled();
    expect(firebaseSdkFactory.getFirestore).not.toHaveBeenCalled();
  });

  it('signs in anonymously on the first operation and caches that identity', async () => {
    const repository = createLeaderboardRepository(COMPLETE_FIREBASE_ENV);

    await expect(repository.getTop('easy')).resolves.toMatchObject({
      ok: true,
      currentUserId: 'anonymous-user',
    });
    await expect(repository.submitBest(RECORD)).resolves.toMatchObject({ ok: true });

    expect(firebaseSdkFactory.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebaseSdkFactory.getAuth).toHaveBeenCalledTimes(1);
    expect(firebaseSdkFactory.getFirestore).toHaveBeenCalledTimes(1);
    expect(firebaseSdkFactory.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('falls back to local mode without Firebase configuration', async () => {
    const repository = createLeaderboardRepository({});

    expect(repository.kind).toBe('local');
    await expect(repository.getTop('easy')).resolves.toEqual({
      ok: true,
      source: 'local',
      currentUserId: null,
      entries: [],
    });
    await expect(repository.submitBest(RECORD)).resolves.toEqual({
      ok: true,
      source: 'local',
    });
  });

  it('reports partial configuration and still constructs local mode', () => {
    const onConfigurationError = vi.fn();
    const repository = createLeaderboardRepository({
      VITE_FIREBASE_PROJECT_ID: 'game',
    }, onConfigurationError);
    expect(repository.kind).toBe('local');
    expect(onConfigurationError).toHaveBeenCalledTimes(1);
    expect(onConfigurationError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onConfigurationError.mock.calls[0]?.[0].message).toMatch(/partial Firebase configuration/i);
  });
});
