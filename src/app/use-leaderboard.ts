import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { LeaderboardEntry, LeaderboardRepository } from '../leaderboard';
import {
  cloneProgressState,
  DIFFICULTIES,
  type Difficulty,
  type ProgressState,
  type ScoreRecord,
} from '../progression';
import { isBetterScore } from '../scoring';

export interface LeaderboardReadState {
  readonly status: 'idle' | 'local' | 'loading' | 'ready' | 'unavailable';
  readonly difficulty: Difficulty | null;
  readonly source: 'local' | 'firestore' | null;
  readonly currentUserId: string | null;
  readonly entries: readonly LeaderboardEntry[];
}

export interface UseLeaderboardOptions {
  readonly repository: LeaderboardRepository;
  readonly progress: ProgressState;
  readonly onClearPending: (
    difficulty: Difficulty,
    candidate: ScoreRecord,
  ) => Promise<{ readonly ok: boolean }>;
}

type CandidateMap = Partial<Record<Difficulty, ScoreRecord>>;

function sameScoreRecord(left: ScoreRecord, right: ScoreRecord): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.initials === right.initials
    && left.characterId === right.characterId
    && left.difficulty === right.difficulty
    && left.score === right.score
    && left.durationTicks === right.durationTicks
    && left.reachedFloor === right.reachedFloor
    && left.encountersWon === right.encountersWon
    && left.owlDefeated === right.owlDefeated
    && left.achievedAt === right.achievedAt;
}

function cloneCandidateMap(source: CandidateMap): CandidateMap {
  return Object.fromEntries(
    Object.entries(source).map(([difficulty, candidate]) => [difficulty, { ...candidate }]),
  ) as CandidateMap;
}

export function useLeaderboard({
  repository,
  progress,
  onClearPending,
}: UseLeaderboardOptions) {
  const [read, setRead] = useState<LeaderboardReadState>({
    status: 'idle',
    difficulty: null,
    source: null,
    currentUserId: null,
    entries: [],
  });
  const [, refreshQueueState] = useReducer((value: number) => value + 1, 0);
  const mountedRef = useRef(false);
  const readTokenRef = useRef(0);
  const progressRef = useRef(cloneProgressState(progress));
  const onClearPendingRef = useRef(onClearPending);
  const queuedRef = useRef<CandidateMap>({});
  const inFlightRef = useRef<CandidateMap>({});
  const retainedRef = useRef<CandidateMap>({});
  const clearedRef = useRef<CandidateMap>({});
  const workerRef = useRef<Promise<void> | null>(null);

  progressRef.current = cloneProgressState(progress);
  onClearPendingRef.current = onClearPending;

  for (const difficulty of DIFFICULTIES) {
    const cleared = clearedRef.current[difficulty];
    const stored = progress.pendingLeaderboardSubmissions[difficulty];
    if (cleared !== undefined && (stored === undefined || !sameScoreRecord(stored, cleared))) {
      delete clearedRef.current[difficulty];
    }
    const retained = retainedRef.current[difficulty];
    if (
      retained !== undefined
      && stored !== undefined
      && !sameScoreRecord(stored, retained)
      && isBetterScore(stored, retained)
    ) {
      delete retainedRef.current[difficulty];
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readTokenRef.current += 1;
    };
  }, []);

  const notifyQueueChanged = useCallback(() => {
    if (mountedRef.current) refreshQueueState();
  }, []);

  const load = useCallback(async (difficulty: Difficulty): Promise<void> => {
    const token = ++readTokenRef.current;
    if (repository.kind === 'local') {
      setRead({
        status: 'local',
        difficulty,
        source: 'local',
        currentUserId: null,
        entries: [],
      });
      return;
    }

    setRead({
      status: 'loading',
      difficulty,
      source: 'firestore',
      currentUserId: null,
      entries: [],
    });
    try {
      const response = await repository.getTop(difficulty);
      if (!mountedRef.current || token !== readTokenRef.current) return;
      if (!response.ok) {
        setRead({
          status: 'unavailable',
          difficulty,
          source: 'firestore',
          currentUserId: null,
          entries: [],
        });
        return;
      }
      setRead({
        status: 'ready',
        difficulty,
        source: 'firestore',
        currentUserId: response.currentUserId,
        entries: response.entries.map((entry) => ({ ...entry })),
      });
    } catch {
      if (!mountedRef.current || token !== readTokenRef.current) return;
      setRead({
        status: 'unavailable',
        difficulty,
        source: 'firestore',
        currentUserId: null,
        entries: [],
      });
    }
  }, [repository]);

  const enqueueCandidates = useCallback((candidates: CandidateMap): Promise<void> => {
    if (repository.kind === 'local') return Promise.resolve();

    for (const difficulty of DIFFICULTIES) {
      const candidate = candidates[difficulty];
      if (candidate === undefined) continue;
      const inFlight = inFlightRef.current[difficulty];
      if (inFlight !== undefined && sameScoreRecord(inFlight, candidate)) continue;
      const queued = queuedRef.current[difficulty];
      if (
        queued !== undefined
        && (sameScoreRecord(queued, candidate) || !isBetterScore(candidate, queued))
      ) continue;
      queuedRef.current[difficulty] = { ...candidate };
    }

    if (workerRef.current !== null) {
      notifyQueueChanged();
      return workerRef.current;
    }

    const drainQueue = async (): Promise<void> => {
      while (true) {
        const difficulty = DIFFICULTIES.find(
          (candidateDifficulty) => queuedRef.current[candidateDifficulty] !== undefined,
        );
        if (difficulty === undefined) return;
        const queued = queuedRef.current[difficulty];
        if (queued === undefined) continue;
        const candidate = { ...queued };
        delete queuedRef.current[difficulty];
        inFlightRef.current[difficulty] = { ...candidate };
        notifyQueueChanged();

        let writeSucceeded = false;
        try {
          const write = await repository.submitBest({ ...candidate });
          writeSucceeded = write.ok && write.source === 'firestore';
        } catch {
          writeSucceeded = false;
        }

        if (!writeSucceeded) {
          retainedRef.current[difficulty] = { ...candidate };
        } else {
          let clearSucceeded = false;
          try {
            const clear = await onClearPendingRef.current(difficulty, { ...candidate });
            clearSucceeded = clear.ok;
          } catch {
            clearSucceeded = false;
          }
          if (clearSucceeded) {
            const retained = retainedRef.current[difficulty];
            if (retained !== undefined && sameScoreRecord(retained, candidate)) {
              delete retainedRef.current[difficulty];
            }
            clearedRef.current[difficulty] = { ...candidate };
          } else {
            retainedRef.current[difficulty] = { ...candidate };
          }
        }

        delete inFlightRef.current[difficulty];
        notifyQueueChanged();
      }
    };

    const worker = drainQueue().finally(() => {
      if (workerRef.current === worker) workerRef.current = null;
      notifyQueueChanged();
    });
    workerRef.current = worker;
    notifyQueueChanged();
    return worker;
  }, [notifyQueueChanged, repository]);

  const retryPending = useCallback((): Promise<void> => {
    if (repository.kind === 'local') return Promise.resolve();
    const candidates = cloneCandidateMap(progressRef.current.pendingLeaderboardSubmissions);
    for (const difficulty of DIFFICULTIES) {
      const cleared = clearedRef.current[difficulty];
      const stored = candidates[difficulty];
      if (cleared !== undefined && stored !== undefined && sameScoreRecord(cleared, stored)) {
        delete candidates[difficulty];
      }
      const retained = retainedRef.current[difficulty];
      const remaining = candidates[difficulty];
      if (retained === undefined) continue;
      if (remaining === undefined || !isBetterScore(remaining, retained)) {
        candidates[difficulty] = { ...retained };
      }
    }
    return enqueueCandidates(candidates);
  }, [enqueueCandidates, repository.kind]);

  const submitPending = useCallback((
    difficulty: Difficulty,
    candidate: ScoreRecord,
  ): Promise<void> => enqueueCandidates({ [difficulty]: { ...candidate } }), [enqueueCandidates]);

  const pendingDifficulties = Object.fromEntries(DIFFICULTIES.map((difficulty) => {
    if (repository.kind === 'local') return [difficulty, false];
    const stored = progress.pendingLeaderboardSubmissions[difficulty];
    const cleared = clearedRef.current[difficulty];
    return [difficulty, retainedRef.current[difficulty] !== undefined
      || queuedRef.current[difficulty] !== undefined
      || inFlightRef.current[difficulty] !== undefined
      || (stored !== undefined && (cleared === undefined || !sameScoreRecord(stored, cleared)))];
  })) as Record<Difficulty, boolean>;

  return {
    read,
    pendingDifficulties,
    load,
    retryPending,
    submitPending,
  } as const;
}
