import { parseFirebaseWebConfig } from './firebase-config';
import { createFirebaseGateway } from './firebase-gateway';
import { createFirestoreLeaderboardRepository } from './firestoreLeaderboardRepository';
import { createLocalLeaderboardRepository } from './localLeaderboardRepository';
import type { LeaderboardRepository } from './types';

export function createLeaderboardRepository(
  env: Record<string, string | boolean | undefined>,
  onConfigurationError: (error: Error) => void = () => undefined,
): LeaderboardRepository {
  try {
    const config = parseFirebaseWebConfig(env);
    return config === null
      ? createLocalLeaderboardRepository()
      : createFirestoreLeaderboardRepository(createFirebaseGateway(config));
  } catch (error) {
    onConfigurationError(error instanceof Error ? error : new Error(String(error)));
    return createLocalLeaderboardRepository();
  }
}
