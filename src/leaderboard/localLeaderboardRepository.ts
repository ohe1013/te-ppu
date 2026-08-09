import type { LeaderboardRepository } from './types';

export function createLocalLeaderboardRepository(): LeaderboardRepository {
  return {
    kind: 'local',
    async getTop() {
      return {
        ok: true,
        source: 'local',
        currentUserId: null,
        entries: [],
      };
    },
    async submitBest() {
      return { ok: true, source: 'local' };
    },
  };
}
