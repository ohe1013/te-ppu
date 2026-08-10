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

interface RepositoryContext {
  readonly generation: number;
  readonly repository: LeaderboardRepository;
  readonly queued: CandidateMap;
  readonly inFlight: CandidateMap;
  readonly retained: CandidateMap;
  readonly cleared: CandidateMap;
  worker: Promise<void> | null;
}

interface VersionedReadState {
  readonly generation: number;
  readonly value: LeaderboardReadState;
}

function idleReadState(): LeaderboardReadState {
  return {
    status: 'idle',
    difficulty: null,
    source: null,
    currentUserId: null,
    entries: [],
  };
}

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

function carryPendingCandidates(context: RepositoryContext): CandidateMap {
  const carried: CandidateMap = {};
  for (const source of [context.retained, context.queued, context.inFlight]) {
    for (const difficulty of DIFFICULTIES) {
      const candidate = source[difficulty];
      const current = carried[difficulty];
      if (
        candidate !== undefined
        && (current === undefined || isBetterScore(candidate, current))
      ) {
        carried[difficulty] = { ...candidate };
      }
    }
  }
  return carried;
}

function createRepositoryContext(
  repository: LeaderboardRepository,
  generation: number,
  retained: CandidateMap = {},
): RepositoryContext {
  return {
    generation,
    repository,
    queued: {},
    inFlight: {},
    retained: cloneCandidateMap(retained),
    cleared: {},
    worker: null,
  };
}

export function useLeaderboard({
  repository,
  progress,
  onClearPending,
}: UseLeaderboardOptions) {
  const [versionedRead, setVersionedRead] = useState<VersionedReadState>({
    generation: 0,
    value: idleReadState(),
  });
  const [, refreshQueueState] = useReducer((value: number) => value + 1, 0);
  const mountedRef = useRef(false);
  const readTokenRef = useRef(0);
  const progressRef = useRef(cloneProgressState(progress));
  const onClearPendingRef = useRef(onClearPending);
  const repositoryContextRef = useRef<RepositoryContext | null>(null);

  const previousRepositoryContext = repositoryContextRef.current;
  let repositoryContext: RepositoryContext;
  if (previousRepositoryContext === null) {
    repositoryContext = createRepositoryContext(repository, 0);
    repositoryContextRef.current = repositoryContext;
  } else if (previousRepositoryContext.repository !== repository) {
    repositoryContext = createRepositoryContext(
      repository,
      previousRepositoryContext.generation + 1,
      carryPendingCandidates(previousRepositoryContext),
    );
    repositoryContextRef.current = repositoryContext;
    readTokenRef.current += 1;
  } else {
    repositoryContext = previousRepositoryContext;
  }

  progressRef.current = cloneProgressState(progress);
  onClearPendingRef.current = onClearPending;

  for (const difficulty of DIFFICULTIES) {
    const cleared = repositoryContext.cleared[difficulty];
    const stored = progress.pendingLeaderboardSubmissions[difficulty];
    if (cleared !== undefined && (stored === undefined || !sameScoreRecord(stored, cleared))) {
      delete repositoryContext.cleared[difficulty];
    }
    const retained = repositoryContext.retained[difficulty];
    if (
      retained !== undefined
      && stored !== undefined
      && !sameScoreRecord(stored, retained)
      && isBetterScore(stored, retained)
    ) {
      delete repositoryContext.retained[difficulty];
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readTokenRef.current += 1;
    };
  }, []);

  const notifyQueueChanged = useCallback((context: RepositoryContext) => {
    if (mountedRef.current && repositoryContextRef.current === context) refreshQueueState();
  }, []);

  const load = useCallback(async (difficulty: Difficulty): Promise<void> => {
    const context = repositoryContext;
    const token = ++readTokenRef.current;
    if (context.repository.kind === 'local') {
      setVersionedRead({
        generation: context.generation,
        value: {
          status: 'local',
          difficulty,
          source: 'local',
          currentUserId: null,
          entries: [],
        },
      });
      return;
    }

    setVersionedRead({
      generation: context.generation,
      value: {
        status: 'loading',
        difficulty,
        source: 'firestore',
        currentUserId: null,
        entries: [],
      },
    });
    try {
      const response = await context.repository.getTop(difficulty);
      if (
        !mountedRef.current
        || token !== readTokenRef.current
        || repositoryContextRef.current !== context
      ) return;
      if (!response.ok) {
        setVersionedRead({
          generation: context.generation,
          value: {
            status: 'unavailable',
            difficulty,
            source: 'firestore',
            currentUserId: null,
            entries: [],
          },
        });
        return;
      }
      setVersionedRead({
        generation: context.generation,
        value: {
          status: 'ready',
          difficulty,
          source: 'firestore',
          currentUserId: response.currentUserId,
          entries: response.entries.map((entry) => ({ ...entry })),
        },
      });
    } catch {
      if (
        !mountedRef.current
        || token !== readTokenRef.current
        || repositoryContextRef.current !== context
      ) return;
      setVersionedRead({
        generation: context.generation,
        value: {
          status: 'unavailable',
          difficulty,
          source: 'firestore',
          currentUserId: null,
          entries: [],
        },
      });
    }
  }, [repositoryContext]);

  const enqueueCandidates = useCallback((candidates: CandidateMap): Promise<void> => {
    const context = repositoryContext;
    if (context.repository.kind === 'local') return Promise.resolve();

    for (const difficulty of DIFFICULTIES) {
      const candidate = candidates[difficulty];
      if (candidate === undefined) continue;
      const inFlight = context.inFlight[difficulty];
      if (inFlight !== undefined && sameScoreRecord(inFlight, candidate)) continue;
      const queued = context.queued[difficulty];
      if (
        queued !== undefined
        && (sameScoreRecord(queued, candidate) || !isBetterScore(candidate, queued))
      ) continue;
      context.queued[difficulty] = { ...candidate };
    }

    if (context.worker !== null) {
      notifyQueueChanged(context);
      return context.worker;
    }

    const drainQueue = async (): Promise<void> => {
      while (true) {
        if (!mountedRef.current || repositoryContextRef.current !== context) return;
        const difficulty = DIFFICULTIES.find(
          (candidateDifficulty) => context.queued[candidateDifficulty] !== undefined,
        );
        if (difficulty === undefined) return;
        const queued = context.queued[difficulty];
        if (queued === undefined) continue;
        const candidate = { ...queued };
        delete context.queued[difficulty];
        context.inFlight[difficulty] = { ...candidate };
        notifyQueueChanged(context);

        let writeSucceeded = false;
        try {
          const write = await context.repository.submitBest({ ...candidate });
          writeSucceeded = write.ok && write.source === 'firestore';
        } catch {
          writeSucceeded = false;
        }

        if (!mountedRef.current || repositoryContextRef.current !== context) return;

        if (!writeSucceeded) {
          context.retained[difficulty] = { ...candidate };
        } else {
          let clearSucceeded = false;
          try {
            const clear = await onClearPendingRef.current(difficulty, { ...candidate });
            clearSucceeded = clear.ok;
          } catch {
            clearSucceeded = false;
          }
          if (!mountedRef.current || repositoryContextRef.current !== context) return;
          if (clearSucceeded) {
            const retained = context.retained[difficulty];
            if (retained !== undefined && sameScoreRecord(retained, candidate)) {
              delete context.retained[difficulty];
            }
            context.cleared[difficulty] = { ...candidate };
          } else {
            context.retained[difficulty] = { ...candidate };
          }
        }

        delete context.inFlight[difficulty];
        notifyQueueChanged(context);
      }
    };

    const worker = drainQueue().finally(() => {
      if (context.worker === worker) context.worker = null;
      notifyQueueChanged(context);
    });
    context.worker = worker;
    notifyQueueChanged(context);
    return worker;
  }, [notifyQueueChanged, repositoryContext]);

  const retryPending = useCallback((): Promise<void> => {
    if (repositoryContext.repository.kind === 'local') return Promise.resolve();
    const candidates = cloneCandidateMap(progressRef.current.pendingLeaderboardSubmissions);
    for (const difficulty of DIFFICULTIES) {
      const cleared = repositoryContext.cleared[difficulty];
      const stored = candidates[difficulty];
      if (cleared !== undefined && stored !== undefined && sameScoreRecord(cleared, stored)) {
        delete candidates[difficulty];
      }
      const retained = repositoryContext.retained[difficulty];
      const remaining = candidates[difficulty];
      if (retained === undefined) continue;
      if (remaining === undefined || !isBetterScore(remaining, retained)) {
        candidates[difficulty] = { ...retained };
      }
    }
    return enqueueCandidates(candidates);
  }, [enqueueCandidates, repositoryContext]);

  const submitPending = useCallback((
    difficulty: Difficulty,
    candidate: ScoreRecord,
  ): Promise<void> => enqueueCandidates({ [difficulty]: { ...candidate } }), [enqueueCandidates]);

  const pendingDifficulties = Object.fromEntries(DIFFICULTIES.map((difficulty) => {
    if (repositoryContext.repository.kind === 'local') return [difficulty, false];
    const stored = progress.pendingLeaderboardSubmissions[difficulty];
    const cleared = repositoryContext.cleared[difficulty];
    return [difficulty, repositoryContext.retained[difficulty] !== undefined
      || repositoryContext.queued[difficulty] !== undefined
      || repositoryContext.inFlight[difficulty] !== undefined
      || (stored !== undefined && (cleared === undefined || !sameScoreRecord(stored, cleared)))];
  })) as Record<Difficulty, boolean>;

  const read = versionedRead.generation === repositoryContext.generation
    ? versionedRead.value
    : idleReadState();

  return {
    read,
    pendingDifficulties,
    load,
    retryPending,
    submitPending,
  } as const;
}
