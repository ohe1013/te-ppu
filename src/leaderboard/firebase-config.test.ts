import { describe, expect, it, vi } from 'vitest';
import type { ScoreRecord } from '../progression';
import { createLeaderboardRepository } from './createLeaderboardRepository';
import { parseFirebaseWebConfig } from './firebase-config';

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
