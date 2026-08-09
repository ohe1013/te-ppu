import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import type { PlayerCharacterId } from '../player';
import type { Floor } from '../progression';
import type { FirebaseWebConfig } from './firebase-config';

export interface FirestoreLeaderboardDocument {
  readonly schemaVersion: 1;
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
  readonly score: number;
  readonly durationTicks: number;
  readonly reachedFloor: Floor;
  readonly encountersWon: number;
  readonly owlDefeated: boolean;
  readonly updatedAt: unknown;
}

export interface FirestoreLeaderboardSnapshot {
  readonly id: string;
  readonly data: FirestoreLeaderboardDocument;
}

export interface FirestoreLeaderboardQuery {
  readonly collectionPath: string;
  readonly orderBy: readonly [
    { readonly field: 'score'; readonly direction: 'desc' },
    { readonly field: 'durationTicks'; readonly direction: 'asc' },
    { readonly field: 'updatedAt'; readonly direction: 'asc' },
  ];
  readonly limit: 20;
}

export interface FirestoreLeaderboardGateway {
  authenticate(): Promise<string>;
  serverTimestamp(): unknown;
  runPlayerTransaction(
    path: string,
    chooseWrite: (
      current: FirestoreLeaderboardDocument | null,
    ) => FirestoreLeaderboardDocument | null,
  ): Promise<void>;
  queryPlayers(request: FirestoreLeaderboardQuery): Promise<readonly FirestoreLeaderboardSnapshot[]>;
}

export function createFirebaseGateway(config: FirebaseWebConfig): FirestoreLeaderboardGateway {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  let authentication: Promise<string> | null = null;

  return {
    authenticate() {
      if (auth.currentUser !== null) return Promise.resolve(auth.currentUser.uid);
      authentication ??= signInAnonymously(auth)
        .then(({ user }) => user.uid)
        .catch((error: unknown) => {
          authentication = null;
          throw error;
        });
      return authentication;
    },

    serverTimestamp,

    async runPlayerTransaction(path, chooseWrite) {
      const playerReference = doc(firestore, path);
      await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(playerReference);
        const current = snapshot.exists()
          ? snapshot.data() as FirestoreLeaderboardDocument
          : null;
        const next = chooseWrite(current);
        if (next !== null) transaction.set(playerReference, next);
      });
    },

    async queryPlayers(request) {
      const constraints: QueryConstraint[] = request.orderBy.map(({ field, direction }) => (
        orderBy(field, direction)
      ));
      constraints.push(limit(request.limit));
      const snapshot = await getDocs(query(
        collection(firestore, request.collectionPath),
        ...constraints,
      ));
      return snapshot.docs.map((entry) => ({
        id: entry.id,
        data: entry.data() as FirestoreLeaderboardDocument,
      }));
    },
  };
}
