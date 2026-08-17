import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EndingScreen } from '../ui/screens/EndingScreen';
import { FloorIntroScreen } from '../ui/screens/FloorIntroScreen';
import { BootScreen } from '../ui/screens/BootScreen';
import { MatchScreen } from '../ui/screens/MatchScreen';
import { ResultScreen } from '../ui/screens/ResultScreen';
import { TowerScreen } from '../ui/screens/TowerScreen';
import { OwlRevealScreen } from '../ui/screens/OwlRevealScreen';
import { OwlResultScreen } from '../ui/screens/OwlResultScreen';
import { CharacterSelectScreen } from '../ui/screens/CharacterSelectScreen';
import { NameEntryScreen } from '../ui/screens/NameEntryScreen';
import {
  RankingScreen,
  type RankingEntry,
  type RankingStatus,
} from '../ui/screens/RankingScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import '../ui/screens/screens.css';
import {
  reduceRoute,
  type AppRoute,
  type Floor,
  type MatchOutcome,
  type MatchResult,
} from './app-route';
import type { AppServices } from './app-services';
import type { AssetManager, PlayerCharacterAssets } from '../assets';
import { useFloorAssets } from '../assets/use-floor-assets';
import { createAppLifecycleCoordinator } from '../platform/app-lifecycle';
import type { AudioPort } from '../platform/audio-port';
import { usePlatformBack } from '../platform/back-request';
import type { ProgressState, ScoreRecord } from '../progression/index';
import {
  DEFAULT_PROGRESS,
  FINAL_FLOOR,
  getFloorEncounter,
  OWL_ENCOUNTER,
  type OwlEncounter,
} from '../progression/index';
import type { PlatformPort } from '../platform/platform-port';
import { musicForRoute } from '../platform/audio-route';
import {
  PLAYER_CHARACTERS,
  isPlayerCharacterId,
  type PlayerCharacterDefinition,
  type PlayerCharacterId,
} from '../player';
import type { Difficulty } from '../progression';
import {
  createLocalLeaderboardRepository,
  type LeaderboardEntry,
  type LeaderboardRepository,
} from '../leaderboard';
import { TowerController } from './towerController';
import { useBoot } from './use-boot';
import { useLeaderboard } from './use-leaderboard';
import type { GameEvent } from '../core';
import {
  createScoreRecord,
  isBetterScore,
  ScoreRunController,
  type ScoreRunSnapshot,
} from '../scoring';

export interface MatchRouteViewProps {
  readonly audioPort: AudioPort;
  readonly floor: Floor;
  readonly encounterIndex: 0 | 1 | 2;
  readonly wins: 0 | 1 | 2;
  readonly difficulty: ProgressState['selectedDifficulty'];
  readonly specialEncounter?: OwlEncounter;
  readonly seed: number;
  readonly onAbandon: () => void;
  readonly onFinished: (outcome: MatchOutcome) => Promise<void>;
  readonly onScoreEvents: (events: readonly GameEvent[]) => void;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly player: PlayerCharacterDefinition;
  readonly playerAssets?: PlayerCharacterAssets;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
  readonly runScore: number;
  readonly commonAssets?: ReturnType<AssetManager['getCommonAssets']>;
  readonly floorAssets?: ReturnType<AssetManager['getFloorAssets']>;
}

export interface AppRootProps {
  readonly services: AppServices;
  readonly createMatchSeed?: () => number;
  readonly devClearedMode?: boolean;
  readonly nowIso?: () => string;
  readonly renderMatch?: (props: MatchRouteViewProps) => ReactNode;
}

const assetDestroyFinalizers = new WeakMap<
  AssetManager,
  {
    readonly audioPort: AudioPort;
    readonly handle: ReturnType<typeof setTimeout>;
    readonly token: object;
  }
>();

function createDefaultMatchSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]!;
}

function toControllerResult(result: MatchResult): 'WIN' | 'LOSS' | 'DRAW' {
  if (result === 'win') return 'WIN';
  if (result === 'loss') return 'LOSS';
  return 'DRAW';
}

function currentIso(): string {
  return new Date().toISOString();
}

function isPristineRun(snapshot: ScoreRunSnapshot): boolean {
  return snapshot.phase === 'active'
    && snapshot.score === 0
    && snapshot.durationTicks === 0
    && snapshot.encountersWon === 0
    && snapshot.requiredFloor === 1;
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

function toRankingEntry(
  record: ScoreRecord | LeaderboardEntry,
  rank: number | '?',
  badge?: 'LOCAL',
): RankingEntry {
  return {
    rank,
    ...(badge === undefined ? {} : { badge }),
    initials: record.initials,
    characterId: record.characterId,
    score: record.score,
    reachedFloor: record.reachedFloor,
    encountersWon: record.encountersWon,
    owlDefeated: record.owlDefeated,
  };
}

function leaderboardEntryAsScoreRecord(entry: LeaderboardEntry): ScoreRecord {
  return {
    schemaVersion: entry.schemaVersion,
    initials: entry.initials,
    characterId: entry.characterId,
    difficulty: entry.difficulty,
    score: entry.score,
    durationTicks: entry.durationTicks,
    reachedFloor: entry.reachedFloor,
    encountersWon: entry.encountersWon,
    owlDefeated: entry.owlDefeated,
    achievedAt: entry.updatedAt,
  };
}

function mergeRankingEntries(
  remoteEntries: readonly LeaderboardEntry[],
  currentUserId: string | null,
  localBest: ScoreRecord | null,
): readonly RankingEntry[] {
  const rankedRemote = remoteEntries.map((entry, index) => toRankingEntry(entry, index + 1));
  if (localBest === null) return rankedRemote;
  const localEntry = toRankingEntry(localBest, '?', 'LOCAL');
  if (currentUserId === null) return [...rankedRemote, localEntry];

  const currentUserRemote = remoteEntries.find((entry) => entry.userId === currentUserId);
  if (currentUserRemote === undefined) return [...rankedRemote, localEntry];
  if (!isBetterScore(localBest, leaderboardEntryAsScoreRecord(currentUserRemote))) {
    return rankedRemote;
  }
  return [
    ...rankedRemote.filter((_entry, index) => remoteEntries[index]?.userId !== currentUserId),
    localEntry,
  ];
}

interface RankedMatchIdentity {
  readonly token: symbol;
  readonly scoreRun: ScoreRunController;
  readonly kind: 'floor' | 'owl';
  readonly floor: Floor;
  readonly encounterIndex: 0 | 1 | 2;
  readonly seed: number;
}

export function AppRoot({
  createMatchSeed = createDefaultMatchSeed,
  devClearedMode = false,
  nowIso = currentIso,
  renderMatch = (props) => <MatchScreen {...props} />,
  services,
}: AppRootProps) {
  const boot = useBoot(services);
  const [route, dispatchRoute] = useReducer(reduceRoute, { name: 'boot' } satisfies AppRoute);
  const displayedFloor = route.name === 'floor-intro'
    || route.name === 'match'
    || route.name === 'result'
    ? route.floor
    : route.name === 'owl-reveal'
      || route.name === 'owl-match'
      || route.name === 'owl-result'
      || route.name === 'ending'
      ? FINAL_FLOOR
      : null;
  const floorAssets = useFloorAssets(services.assetManager, displayedFloor);
  const commonAssets = boot.status === 'ready' ? services.assetManager.getCommonAssets() : null;
  const [, refreshControllerView] = useReducer((value: number) => value + 1, 0);
  const [resultSavePending, setResultSavePending] = useState(false);
  const [resultSaveFailed, setResultSaveFailed] = useState(false);
  const [saveRetrying, setSaveRetrying] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [rankingDifficulty, setRankingDifficulty] = useState<Difficulty>('easy');
  const controllerRef = useRef<TowerController | null>(null);
  const fallbackLeaderboardRef = useRef<LeaderboardRepository | null>(null);
  const scoreRunRef = useRef<ScoreRunController | null>(null);
  const matchIdentityRef = useRef<RankedMatchIdentity | null>(null);
  const completionPendingRef = useRef(false);
  const completionTokenRef = useRef(0);
  const profileSavePendingRef = useRef(false);
  const retryProfileButtonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);

  if (boot.status === 'ready' && controllerRef.current === null) {
    controllerRef.current = new TowerController(boot.progress, boot.progressRepository);
  }
  const controller = controllerRef.current;
  if (services.leaderboardRepository === undefined && fallbackLeaderboardRef.current === null) {
    fallbackLeaderboardRef.current = createLocalLeaderboardRepository();
  }
  const leaderboardRepository = services.leaderboardRepository
    ?? fallbackLeaderboardRef.current!;
  const leaderboard = useLeaderboard({
    repository: leaderboardRepository,
    progress: controller?.progress ?? DEFAULT_PROGRESS,
    onClearPending: async (difficulty, candidate) => {
      const activeController = controllerRef.current;
      if (activeController === null) return { ok: false };
      const current = activeController.progress.pendingLeaderboardSubmissions[difficulty];
      const result = current === undefined && activeController.saveError === 'SAVE_FAILED'
        ? await activeController.retrySave()
        : await activeController.clearPendingSubmission(difficulty, candidate);
      if (mountedRef.current) refreshControllerView();
      return { ok: result.ok };
    },
  });
  const scoreRunSnapshot = scoreRunRef.current?.snapshot ?? null;
  const runActive = scoreRunSnapshot?.phase === 'active';
  const suspendedBattle = controller?.suspendedBattle ?? null;
  const profileCharacterId = controller?.progress.profile?.characterId;
  const selectedPlayerId = isPlayerCharacterId(profileCharacterId)
    ? profileCharacterId
    : 'hero-engineer';
  const selectedPlayer = PLAYER_CHARACTERS[selectedPlayerId];
  const selectedPlayerAssets = commonAssets?.players[selectedPlayerId];
  const closeApp = useCallback(
    () => services.platform.close(),
    [services.platform],
  );

  useEffect(() => {
    if (boot.status === 'ready') dispatchRoute({ type: 'boot-ready' });
  }, [boot.status]);

  useEffect(() => {
    if (controller !== null && (route.name === 'title' || route.name === 'ranking')) {
      void leaderboard.retryPending();
    }
  }, [controller, leaderboard.retryPending, route.name]);

  useEffect(() => {
    if (profileSaveStatus === 'failed') retryProfileButtonRef.current?.focus();
  }, [profileSaveStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      matchIdentityRef.current = null;
      completionTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const lifecycle = createAppLifecycleCoordinator({
      audio: services.audioPort,
      onCountdownChange: () => undefined,
      resetAll: () => undefined,
      setPaused: () => undefined,
    });
    return () => lifecycle.destroy();
  }, [services.audioPort]);

  useEffect(() => {
    void services.audioPort.setMusic(musicForRoute(route)).catch(() => undefined);
  }, [route, services.audioPort]);

  useEffect(() => {
    if (controller === null) return;
    const { soundEnabled, bgmVolume, sfxVolume } = controller.progress.settings;
    services.audioPort.setEnabled(soundEnabled);
    services.audioPort.setVolumes({
      bgm: bgmVolume / 100,
      sfx: sfxVolume / 100,
    });
  }, [
    controller,
    controller?.progress.settings.soundEnabled,
    controller?.progress.settings.bgmVolume,
    controller?.progress.settings.sfxVolume,
    services.audioPort,
  ]);

  useEffect(() => {
    const manager = services.assetManager;
    const audioPort = services.audioPort;
    const existing = assetDestroyFinalizers.get(manager);
    if (existing !== undefined) {
      clearTimeout(existing.handle);
      assetDestroyFinalizers.delete(manager);
    }
    return () => {
      const token = {};
      const handle = setTimeout(() => {
        const current = assetDestroyFinalizers.get(manager);
        if (
          current === undefined
          || current.token !== token
          || current.audioPort !== audioPort
        ) return;
        assetDestroyFinalizers.delete(manager);
        void (async () => {
          try {
            await audioPort.destroy();
          } catch {
            // Audio teardown must not prevent asset teardown.
          } finally {
            manager.destroy();
          }
        })();
      }, 300);
      assetDestroyFinalizers.set(manager, { audioPort, handle, token });
    };
  }, [services.assetManager, services.audioPort]);

  function startIntro(
    intro: Extract<AppRoute, { name: 'floor-intro' }>,
  ) {
    const scoreRun = scoreRunRef.current;
    if (
      controller === null
      || scoreRun === null
      || matchIdentityRef.current !== null
      || completionPendingRef.current
    ) return;
    const seed = createMatchSeed();
    const started = intro.encounterIndex === 0
      ? controller.startFloor(intro.floor, seed)
      : controller.startEncounter(seed);
    if (started.ok) {
      scoreRun.beginMatch();
      matchIdentityRef.current = {
        token: Symbol('ranked-floor-match'),
        scoreRun,
        kind: 'floor',
        floor: intro.floor,
        encounterIndex: intro.encounterIndex,
        seed,
      };
      dispatchRoute({ type: 'start-match', seed });
    }
  }

  function startScoreRun(): void {
    if (controller === null) return;
    matchIdentityRef.current = null;
    scoreRunRef.current = ScoreRunController.start(controller.progress.selectedDifficulty);
    completionPendingRef.current = false;
    completionTokenRef.current += 1;
    setResultSavePending(false);
    setResultSaveFailed(false);
    refreshControllerView();
  }

  function startScoreRunAtFloor(floor: Floor): void {
    if (controller === null) return;
    matchIdentityRef.current = null;
    scoreRunRef.current = ScoreRunController.startAtFloor(
      controller.progress.selectedDifficulty,
      floor,
    );
    completionPendingRef.current = false;
    completionTokenRef.current += 1;
    setResultSavePending(false);
    setResultSaveFailed(false);
    refreshControllerView();
  }

  function isCurrentMatch(identity: RankedMatchIdentity): boolean {
    const current = matchIdentityRef.current;
    return current !== null
      && current.token === identity.token
      && current.scoreRun === identity.scoreRun
      && scoreRunRef.current === identity.scoreRun;
  }

  function recordScoreEvents(
    identity: RankedMatchIdentity,
    events: readonly GameEvent[],
  ): void {
    if (!isCurrentMatch(identity) || identity.scoreRun.snapshot.phase !== 'active') return;
    identity.scoreRun.recordEvents(events);
    refreshControllerView();
  }

  function abandonMatch(identity: RankedMatchIdentity): void {
    const routeMatchesIdentity = identity.kind === 'floor'
      ? route.name === 'match'
        && route.floor === identity.floor
        && route.encounterIndex === identity.encounterIndex
        && route.seed === identity.seed
      : route.name === 'owl-match' && route.seed === identity.seed;
    if (
      controller === null
      || !routeMatchesIdentity
      || !isCurrentMatch(identity)
      || completionPendingRef.current
    ) return;
    matchIdentityRef.current = null;
    identity.scoreRun.abandonMatch();
    const suspended = controller.abandonMatch();
    if (suspended === null) return;
    refreshControllerView();
    dispatchRoute({ type: 'return-to-tower' });
  }

  async function saveFinalScore(record: ScoreRecord) {
    if (controller === null) return null;
    const previousBest = controller.progress.localBestScores[record.difficulty];
    const accepted = isBetterScore(record, previousBest);
    if (!accepted) return null;
    const result = await controller.recordScore(record, true);
    if (mountedRef.current) refreshControllerView();
    if (result.ok && leaderboardRepository.kind === 'firestore') {
      const pending = controller.progress.pendingLeaderboardSubmissions[record.difficulty];
      if (pending !== undefined && sameScoreRecord(pending, record)) {
        void leaderboard.submitPending(record.difficulty, pending);
      }
    }
    return result;
  }

  async function finishMatch(
    identity: RankedMatchIdentity,
    { result, durationTicks }: MatchOutcome,
  ): Promise<void> {
    if (
      controller === null
      || identity.kind !== 'floor'
      || !isCurrentMatch(identity)
      || completionPendingRef.current
    ) return;
    matchIdentityRef.current = null;
    completionPendingRef.current = true;
    const completionToken = completionTokenRef.current + 1;
    completionTokenRef.current = completionToken;
    setResultSaveFailed(false);
    const resolution = identity.scoreRun.completeMatch({
      floor: identity.floor,
      encounterIndex: identity.encounterIndex,
      isOwl: false,
      result,
      durationTicks,
    });
    const progressSave = controller.completeEncounter(toControllerResult(result));
    const finalScoreSave = resolution.kind === 'ended' && controller.progress.profile !== null
      ? saveFinalScore(
          createScoreRecord(resolution.summary, controller.progress.profile, nowIso()),
        )
      : null;
    setResultSavePending(identity.encounterIndex === 2 || finalScoreSave !== null);
    dispatchRoute({ type: 'match-finished', result });
    refreshControllerView();
    const [progressSaveResult, finalScoreSaveResult] = await Promise.all([
      progressSave,
      finalScoreSave ?? Promise.resolve(null),
    ]);
    if (!mountedRef.current || completionTokenRef.current !== completionToken) return;
    completionPendingRef.current = false;
    setResultSavePending(false);
    setResultSaveFailed((finalScoreSaveResult ?? progressSaveResult).ok !== true);
    refreshControllerView();
  }

  function startOwlMatch(): void {
    const scoreRun = scoreRunRef.current;
    if (
      controller === null
      || scoreRun === null
      || matchIdentityRef.current !== null
      || completionPendingRef.current
    ) return;
    const seed = createMatchSeed();
    const started = controller.startOwlMatch(seed);
    if (started.ok) {
      scoreRun.beginMatch();
      matchIdentityRef.current = {
        token: Symbol('ranked-owl-match'),
        scoreRun,
        kind: 'owl',
        floor: FINAL_FLOOR,
        encounterIndex: 2,
        seed,
      };
      dispatchRoute({ type: 'start-owl-match', seed: started.match.matchSeed });
    }
  }

  async function finishOwlMatch(
    identity: RankedMatchIdentity,
    { result, durationTicks }: MatchOutcome,
  ): Promise<void> {
    if (
      controller === null
      || identity.kind !== 'owl'
      || !isCurrentMatch(identity)
      || completionPendingRef.current
    ) return;
    matchIdentityRef.current = null;
    completionPendingRef.current = true;
    const completionToken = completionTokenRef.current + 1;
    completionTokenRef.current = completionToken;
    setResultSavePending(true);
    setResultSaveFailed(false);
    const resolution = identity.scoreRun.completeMatch({
      floor: identity.floor,
      encounterIndex: identity.encounterIndex,
      isOwl: true,
      result,
      durationTicks,
    });
    const progressSave = controller.completeOwlMatch(toControllerResult(result));
    const profile = controller.progress.profile;
    const finalScoreSave = resolution.kind === 'ended' && profile !== null
      ? saveFinalScore(createScoreRecord(resolution.summary, profile, nowIso()))
      : null;
    dispatchRoute({ type: 'owl-match-finished', result });
    refreshControllerView();
    const [progressSaveResult, finalScoreSaveResult] = await Promise.all([
      progressSave,
      finalScoreSave ?? Promise.resolve(null),
    ]);
    if (!mountedRef.current || completionTokenRef.current !== completionToken) return;
    completionPendingRef.current = false;
    setResultSavePending(false);
    setResultSaveFailed((finalScoreSaveResult ?? progressSaveResult).ok !== true);
    refreshControllerView();
  }

  async function retrySave(): Promise<boolean> {
    if (controller === null || saveRetrying) return false;
    setSaveRetrying(true);
    const result = await controller.retrySave();
    if (!mountedRef.current) return result.ok;
    setSaveRetrying(false);
    if (route.name === 'result' || route.name === 'owl-result') {
      setResultSaveFailed(!result.ok);
    }
    refreshControllerView();
    return result.ok;
  }

  async function updateSettings(
    settings: Partial<ProgressState['settings']>,
  ): Promise<boolean> {
    if (controller === null) return false;
    const save = controller.updateSettings(settings);
    refreshControllerView();
    const result = await save;
    if (mountedRef.current) refreshControllerView();
    return result.ok;
  }

  async function selectDifficulty(
    difficulty: ProgressState['selectedDifficulty'],
  ): Promise<boolean> {
    if (controller === null) return false;
    if (devClearedMode && controller.progress.selectedDifficulty === difficulty) return true;
    const activeRun = scoreRunRef.current;
    if (!devClearedMode && activeRun !== null && !isPristineRun(activeRun.snapshot)) return false;
    const save = controller.selectDifficulty(difficulty);
    if (controller.progress.selectedDifficulty === difficulty && activeRun !== null) {
      scoreRunRef.current = ScoreRunController.start(difficulty);
    }
    refreshControllerView();
    const result = await save;
    if (mountedRef.current) refreshControllerView();
    return result.ok;
  }

  function clearScoreRun(): void {
    matchIdentityRef.current = null;
    scoreRunRef.current = null;
    completionPendingRef.current = false;
    completionTokenRef.current += 1;
    setResultSavePending(false);
    setResultSaveFailed(false);
  }

  function showTitle(): void {
    setProfileSaveStatus('idle');
    dispatchRoute({ type: 'return-to-title' });
  }

  function finishRunAndShowTitle(): void {
    clearScoreRun();
    showTitle();
  }

  function finishEndedRun(): void {
    clearScoreRun();
    dispatchRoute({ type: 'continue' });
  }

  function openRanking(): void {
    if (controller === null) return;
    const difficulty = controller.progress.selectedDifficulty;
    setRankingDifficulty(difficulty);
    void leaderboard.load(difficulty);
    dispatchRoute({ type: 'open-ranking' });
  }

  async function completeProfile(characterId: PlayerCharacterId): Promise<void> {
    if (
      controller === null
      || route.name !== 'character-select'
      || profileSaveStatus !== 'idle'
      || profileSavePendingRef.current
    ) return;
    const profile = { initials: route.initials, characterId };
    profileSavePendingRef.current = true;
    setProfileSaveStatus('saving');
    const result = await controller.updateProfile(profile);
    profileSavePendingRef.current = false;
    if (!mountedRef.current) return;
    refreshControllerView();
    if (!result.ok) {
      setProfileSaveStatus('failed');
      return;
    }
    setProfileSaveStatus('idle');
    if (route.intent === 'start-run') startScoreRun();
    else clearScoreRun();
    dispatchRoute({ type: 'character-selected' });
  }

  async function retryProfileSave(): Promise<void> {
    if (
      controller === null
      || route.name !== 'character-select'
      || profileSavePendingRef.current
    ) return;
    profileSavePendingRef.current = true;
    setProfileSaveStatus('saving');
    const result = await controller.retrySave();
    profileSavePendingRef.current = false;
    if (!mountedRef.current) return;
    refreshControllerView();
    if (!result.ok) {
      setProfileSaveStatus('failed');
      return;
    }
    setProfileSaveStatus('idle');
    if (route.intent === 'start-run') startScoreRun();
    else clearScoreRun();
    dispatchRoute({ type: 'character-selected' });
  }

  function handleRouteBack(): void {
    switch (route.name) {
      case 'name-entry':
      case 'ranking':
      case 'tower':
        showTitle();
        return;
      case 'character-select':
        if (profileSaveStatus === 'idle') showTitle();
        return;
      case 'floor-intro':
        if (route.encounterIndex === 0) {
          dispatchRoute({ type: 'return-to-tower' });
        }
        return;
      case 'ending':
        finishRunAndShowTitle();
        return;
      case 'boot':
      case 'title':
      case 'match':
      case 'owl-match':
      case 'result':
      case 'owl-reveal':
      case 'owl-result':
        return;
    }
  }

  usePlatformBack(handleRouteBack, {
    enabled: route.name !== 'boot'
      && route.name !== 'title'
      && route.name !== 'match'
      && route.name !== 'owl-match',
    priority: 10,
  });

  let content: ReactNode;
  if (boot.status !== 'ready' || controller === null || route.name === 'boot') {
    content = <BootScreen state={boot} />;
  } else {
    switch (route.name) {
      case 'title':
        content = (
          <TitleScreen
            commonAssets={commonAssets}
            notice={boot.notice}
            onChangePlayer={() => {
              setProfileSaveStatus('idle');
              dispatchRoute({ type: 'change-player' });
            }}
            onExit={closeApp}
            onOpenRanking={openRanking}
            onStartRun={() => {
              if (runActive) {
                dispatchRoute({ type: 'resume-run' });
                return;
              }
              const hasProfile = controller.progress.profile !== null;
              if (hasProfile) startScoreRun();
              dispatchRoute({ type: 'start-run', hasProfile });
            }}
            progress={controller.progress}
            runActive={runActive}
            syncPending={Object.values(leaderboard.pendingDifficulties).some(Boolean)}
          />
        );
        break;
      case 'name-entry':
        content = (
          <NameEntryScreen
            backdrop={commonAssets?.towerBackdrop}
            initialValue=""
            onBack={showTitle}
            onComplete={(initials) => dispatchRoute({ type: 'name-completed', initials })}
          />
        );
        break;
      case 'character-select':
        content = (
          <>
            <CharacterSelectScreen
              assets={{
                'hero-engineer': { fullArt: commonAssets?.players['hero-engineer'].fullArt },
                'cloud-courier': { fullArt: commonAssets?.players['cloud-courier'].fullArt },
                'star-alchemist': { fullArt: commonAssets?.players['star-alchemist'].fullArt },
              }}
              initialCharacterId={controller.progress.profile?.characterId ?? 'hero-engineer'}
              interactionLocked={profileSaveStatus !== 'idle'}
              onBack={() => {
                if (profileSaveStatus === 'idle') showTitle();
              }}
              onComplete={(characterId) => { void completeProfile(characterId); }}
            />
            {profileSaveStatus !== 'idle' && (
              <aside
                aria-labelledby={profileSaveStatus === 'failed' ? 'profile-save-error-title' : undefined}
                aria-live="polite"
                aria-modal={profileSaveStatus === 'failed' ? true : undefined}
                className={`profile-save-panel profile-save-panel--${profileSaveStatus}`}
                data-testid="profile-save-panel"
                onKeyDown={(event) => {
                  if (profileSaveStatus !== 'failed' || event.key !== 'Tab') return;
                  event.preventDefault();
                  retryProfileButtonRef.current?.focus();
                }}
                role={profileSaveStatus === 'failed' ? 'dialog' : undefined}
              >
                {profileSaveStatus === 'saving' ? (
                  <p role="status">SAVING PLAYER PROFILE</p>
                ) : (
                  <>
                    <p id="profile-save-error-title" role="alert">PROFILE SAVE FAILED</p>
                    <button
                      onClick={() => { void retryProfileSave(); }}
                      ref={retryProfileButtonRef}
                      type="button"
                    >
                      RETRY SAVE
                    </button>
                  </>
                )}
              </aside>
            )}
          </>
        );
        break;
      case 'ranking': {
        const localBest = controller.progress.localBestScores[rankingDifficulty];
        let entries: readonly RankingEntry[];
        let status: RankingStatus;
        if (leaderboardRepository.kind === 'local') {
          status = 'local';
          entries = localBest === null ? [] : [toRankingEntry(localBest, '?', 'LOCAL')];
        } else if (
          leaderboard.read.difficulty !== rankingDifficulty
          || leaderboard.read.status === 'idle'
          || leaderboard.read.status === 'loading'
        ) {
          status = 'loading';
          entries = [];
        } else if (leaderboard.read.status === 'unavailable') {
          status = 'unavailable';
          entries = localBest === null ? [] : [toRankingEntry(localBest, '?', 'LOCAL')];
        } else {
          status = 'ready';
          entries = mergeRankingEntries(
            leaderboard.read.entries,
            leaderboard.read.currentUserId,
            localBest,
          );
        }
        content = (
          <RankingScreen
            difficulty={rankingDifficulty}
            entries={entries}
            onBack={showTitle}
            onSelectDifficulty={(difficulty) => {
              setRankingDifficulty(difficulty);
              void leaderboard.load(difficulty);
            }}
            status={status}
            syncPending={leaderboard.pendingDifficulties[rankingDifficulty]}
            unlockedDifficulties={controller.progress.unlockedDifficulties}
          />
        );
        break;
      }
      case 'tower':
        content = (
          <TowerScreen
            commonAssets={commonAssets}
            continuation={suspendedBattle?.kind === 'floor'
              ? {
                  kind: 'floor',
                  floor: suspendedBattle.series.floor,
                  encounterIndex: suspendedBattle.series.encounterIndex,
                }
              : suspendedBattle?.kind === 'owl'
                ? { kind: 'owl' }
                : null}
            administratorFreeSelection={devClearedMode}
            difficultySelectionLocked={!devClearedMode
              && scoreRunSnapshot !== null
              && !isPristineRun(scoreRunSnapshot)}
            notice={boot.notice}
            onBack={showTitle}
            progress={controller.progress}
            onSelectDifficulty={(difficulty) => { void selectDifficulty(difficulty); }}
            onSelectFloor={(floor) => {
              if (!devClearedMode && scoreRunRef.current?.canSelectFloor(floor) !== true) return;
              const suspended = suspendedBattle;
              if (suspended?.kind === 'floor' && suspended.series.floor === floor) {
                dispatchRoute({ type: 'resume-floor', series: suspended.series });
              } else if (suspended?.kind === 'owl' && floor === FINAL_FLOOR) {
                dispatchRoute({ type: 'resume-owl' });
              } else {
                if (devClearedMode) {
                  if (!controller.resetBattleSession()) return;
                  startScoreRunAtFloor(floor);
                }
                dispatchRoute({ type: 'select-floor', floor });
              }
            }}
            requiredFloor={scoreRunSnapshot?.requiredFloor ?? 1}
            runActive={runActive}
            runScore={scoreRunSnapshot?.score ?? 0}
          />
        );
        break;
      case 'owl-reveal':
        content = (
          <OwlRevealScreen
            commonAssets={commonAssets}
            difficulty={controller.progress.selectedDifficulty}
            floorAssets={floorAssets}
            onStart={startOwlMatch}
          />
        );
        break;
      case 'owl-match': {
        const identity = matchIdentityRef.current;
        const matchIdentity = identity !== null
          && identity.kind === 'owl'
          && identity.seed === route.seed
          ? identity
          : null;
        content = renderMatch({
          audioPort: services.audioPort,
          difficulty: controller.progress.selectedDifficulty,
          encounterIndex: 2,
          floor: FINAL_FLOOR,
          wins: 2,
          specialEncounter: OWL_ENCOUNTER,
          commonAssets,
          floorAssets,
          player: selectedPlayer,
          playerAssets: selectedPlayerAssets,
          seed: route.seed,
          onAbandon: () => {
            if (matchIdentity !== null) abandonMatch(matchIdentity);
          },
          onFinished: (outcome) => matchIdentity === null
            ? Promise.resolve()
            : finishOwlMatch(matchIdentity, outcome),
          onScoreEvents: (events) => {
            if (matchIdentity !== null) recordScoreEvents(matchIdentity, events);
          },
          onRetrySettingsSave: retrySave,
          onSettingsChange: updateSettings,
          platform: services.platform,
          runScore: scoreRunSnapshot?.score ?? 0,
          settings: controller.progress.settings,
          settingsSaveFailed: controller.saveError === 'SAVE_FAILED',
        });
        break;
      }
      case 'owl-result':
        content = (
          <OwlResultScreen
            commonAssets={commonAssets}
            floorAssets={floorAssets}
            onContinue={() => {
              if (route.result === 'win') dispatchRoute({ type: 'continue' });
              else finishEndedRun();
            }}
            onRetrySave={() => void retrySave()}
            player={selectedPlayer}
            playerAssets={selectedPlayerAssets}
            result={route.result}
            saveFailed={resultSaveFailed}
            savePending={resultSavePending || saveRetrying}
            saveRetrying={saveRetrying}
            score={scoreRunSnapshot?.score ?? 0}
          />
        );
        break;
      case 'floor-intro':
        content = (
          <FloorIntroScreen
            background={floorAssets?.background}
            encounter={getFloorEncounter(route.floor, route.encounterIndex)}
            floor={route.floor}
            onBack={route.encounterIndex === 0
              ? () => dispatchRoute({ type: 'return-to-tower' })
              : undefined}
            onStart={() => startIntro(route)}
            player={selectedPlayer}
            playerAssets={selectedPlayerAssets}
            rival={commonAssets?.rivals[getFloorEncounter(route.floor, route.encounterIndex).characterId]}
            series={{
              floor: route.floor,
              encounterIndex: route.encounterIndex,
              wins: route.wins,
            }}
          />
        );
        break;
      case 'match': {
        const identity = matchIdentityRef.current;
        const matchIdentity = identity !== null
          && identity.kind === 'floor'
          && identity.floor === route.floor
          && identity.encounterIndex === route.encounterIndex
          && identity.seed === route.seed
          ? identity
          : null;
        content = renderMatch({
          audioPort: services.audioPort,
          difficulty: controller.progress.selectedDifficulty,
          floor: route.floor,
          encounterIndex: route.encounterIndex,
          wins: route.wins,
          commonAssets,
          floorAssets,
          player: selectedPlayer,
          playerAssets: selectedPlayerAssets,
          seed: route.seed,
          onAbandon: () => {
            if (matchIdentity !== null) abandonMatch(matchIdentity);
          },
          onFinished: (outcome) => matchIdentity === null
            ? Promise.resolve()
            : finishMatch(matchIdentity, outcome),
          onScoreEvents: (events) => {
            if (matchIdentity !== null) recordScoreEvents(matchIdentity, events);
          },
          onRetrySettingsSave: retrySave,
          onSettingsChange: updateSettings,
          platform: services.platform,
          runScore: scoreRunSnapshot?.score ?? 0,
          settings: controller.progress.settings,
          settingsSaveFailed: controller.saveError === 'SAVE_FAILED',
        });
        break;
      }
      case 'result':
        content = (
          <ResultScreen
            background={floorAssets?.background}
            encounter={getFloorEncounter(route.floor, route.encounterIndex)}
            floor={route.floor}
            progress={controller.progress}
            result={route.result}
            saveFailed={resultSaveFailed}
            savePending={resultSavePending || saveRetrying}
            saveRetrying={saveRetrying}
            score={scoreRunSnapshot?.score ?? 0}
            onContinue={() => {
              if (route.result === 'win') dispatchRoute({ type: 'continue' });
              else finishEndedRun();
            }}
            onRetrySave={() => void retrySave()}
            player={selectedPlayer}
            playerAssets={selectedPlayerAssets}
            rival={commonAssets?.rivals[getFloorEncounter(route.floor, route.encounterIndex).characterId]}
            series={{
              floor: route.floor,
              encounterIndex: route.encounterIndex,
              wins: route.wins,
            }}
            seriesComplete={route.seriesComplete}
          />
        );
        break;
      case 'ending':
        content = (
          <EndingScreen
            commonAssets={commonAssets}
            difficulty={controller.progress.selectedDifficulty}
            floorAssets={floorAssets}
            onReturnToTitle={finishRunAndShowTitle}
            player={selectedPlayer}
            playerAssets={selectedPlayerAssets}
            score={scoreRunSnapshot?.score ?? 0}
            unlockedDifficulties={controller.progress.unlockedDifficulties}
          />
        );
        break;
    }
  }

  return (
    <main
      className="app-shell"
      data-difficulty={controller?.progress.selectedDifficulty ?? 'easy'}
      data-run-score={scoreRunSnapshot?.score ?? 0}
      data-runtime-mode={services.platform.kind}
      data-testid="app-shell"
      id="app-shell"
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          void services.audioPort.unlock();
        }
      }}
      onPointerDownCapture={() => {
        void services.audioPort.unlock();
      }}
    >
      {content}
      <div data-modal-root="" id="modal-root" />
    </main>
  );
}
