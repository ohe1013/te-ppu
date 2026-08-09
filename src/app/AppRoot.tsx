import {
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
import { RankingScreen } from '../ui/screens/RankingScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import '../ui/screens/screens.css';
import {
  reduceRoute,
  type AppRoute,
  type Floor,
  type MatchResult,
} from './app-route';
import type { AppServices } from './app-services';
import type { AssetManager } from '../assets';
import { useFloorAssets } from '../assets/use-floor-assets';
import { createAppLifecycleCoordinator } from '../platform/app-lifecycle';
import type { AudioPort } from '../platform/audio-port';
import type { ProgressState } from '../progression/index';
import {
  FINAL_FLOOR,
  getFloorEncounter,
  OWL_ENCOUNTER,
  type OwlEncounter,
} from '../progression/index';
import type { PlatformPort } from '../platform/platform-port';
import { musicForRoute } from '../platform/audio-route';
import type { PlayerCharacterId } from '../player';
import type { Difficulty } from '../progression';
import { TowerController } from './towerController';
import { useBoot } from './use-boot';

export interface MatchRouteViewProps {
  readonly audioPort: AudioPort;
  readonly floor: Floor;
  readonly encounterIndex: 0 | 1 | 2;
  readonly wins: 0 | 1 | 2;
  readonly difficulty: ProgressState['selectedDifficulty'];
  readonly specialEncounter?: OwlEncounter;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => Promise<void>;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
  readonly commonAssets?: ReturnType<AssetManager['getCommonAssets']>;
  readonly floorAssets?: ReturnType<AssetManager['getFloorAssets']>;
}

export interface AppRootProps {
  readonly services: AppServices;
  readonly createMatchSeed?: () => number;
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

export function AppRoot({
  createMatchSeed = createDefaultMatchSeed,
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
  const [saveRetrying, setSaveRetrying] = useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [rankingDifficulty, setRankingDifficulty] = useState<Difficulty>('easy');
  const controllerRef = useRef<TowerController | null>(null);
  const completionPendingRef = useRef(false);
  const completionTokenRef = useRef(0);
  const profileSavePendingRef = useRef(false);
  const retryProfileButtonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);

  if (boot.status === 'ready' && controllerRef.current === null) {
    controllerRef.current = new TowerController(boot.progress, boot.progressRepository);
  }
  const controller = controllerRef.current;

  useEffect(() => {
    if (boot.status === 'ready') dispatchRoute({ type: 'boot-ready' });
  }, [boot.status]);

  useEffect(() => {
    if (profileSaveStatus === 'failed') retryProfileButtonRef.current?.focus();
  }, [profileSaveStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    if (controller !== null) {
      services.audioPort.setEnabled(controller.progress.settings.soundEnabled);
    }
  }, [controller, controller?.progress.settings.soundEnabled, services.audioPort]);

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
    if (controller === null) return;
    const seed = createMatchSeed();
    const started = intro.encounterIndex === 0
      ? controller.startFloor(intro.floor, seed)
      : controller.startEncounter(seed);
    if (started.ok) dispatchRoute({ type: 'start-match', seed });
  }

  function retryFloor() {
    if (controller === null) return;
    const seed = createMatchSeed();
    const started = controller.restartFloor(seed);
    if (started.ok) dispatchRoute({ type: 'retry', seed });
  }

  async function finishMatch(result: MatchResult): Promise<void> {
    if (controller === null || completionPendingRef.current) return;
    completionPendingRef.current = true;
    const completionToken = completionTokenRef.current + 1;
    completionTokenRef.current = completionToken;
    const finalWin = route.name === 'match'
      && result === 'win'
      && route.encounterIndex === 2;
    setResultSavePending(finalWin);
    const save = controller.completeEncounter(toControllerResult(result));
    dispatchRoute({ type: 'match-finished', result });
    refreshControllerView();
    await save;
    if (!mountedRef.current || completionTokenRef.current !== completionToken) return;
    completionPendingRef.current = false;
    setResultSavePending(false);
    refreshControllerView();
  }

  function startOwlMatch(): void {
    if (controller === null) return;
    const started = controller.startOwlMatch(createMatchSeed());
    if (started.ok) dispatchRoute({ type: 'start-owl-match', seed: started.match.matchSeed });
  }

  async function finishOwlMatch(result: MatchResult): Promise<void> {
    if (controller === null || completionPendingRef.current) return;
    completionPendingRef.current = true;
    const completionToken = completionTokenRef.current + 1;
    completionTokenRef.current = completionToken;
    setResultSavePending(result === 'win');
    const save = controller.completeOwlMatch(toControllerResult(result));
    dispatchRoute({ type: 'owl-match-finished', result });
    refreshControllerView();
    await save;
    if (!mountedRef.current || completionTokenRef.current !== completionToken) return;
    completionPendingRef.current = false;
    setResultSavePending(false);
    refreshControllerView();
  }

  async function retrySave(): Promise<boolean> {
    if (controller === null || saveRetrying) return false;
    setSaveRetrying(true);
    const result = await controller.retrySave();
    if (!mountedRef.current) return result.ok;
    setSaveRetrying(false);
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
    const save = controller.selectDifficulty(difficulty);
    refreshControllerView();
    const result = await save;
    if (mountedRef.current) refreshControllerView();
    return result.ok;
  }

  function returnToTitle(): void {
    setProfileSaveStatus('idle');
    dispatchRoute({ type: 'return-to-title' });
  }

  function openRanking(): void {
    if (controller === null) return;
    setRankingDifficulty(controller.progress.selectedDifficulty);
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
    dispatchRoute({ type: 'character-selected' });
  }

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
            onOpenRanking={openRanking}
            onStartRun={() => dispatchRoute({
              type: 'start-run',
              hasProfile: controller.progress.profile !== null,
            })}
            progress={controller.progress}
          />
        );
        break;
      case 'name-entry':
        content = (
          <NameEntryScreen
            backdrop={commonAssets?.towerBackdrop}
            initialValue=""
            onBack={returnToTitle}
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
              }}
              initialCharacterId={controller.progress.profile?.characterId ?? 'hero-engineer'}
              interactionLocked={profileSaveStatus !== 'idle'}
              onBack={() => {
                if (profileSaveStatus === 'idle') returnToTitle();
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
        content = (
          <RankingScreen
            difficulty={rankingDifficulty}
            entries={localBest === null ? [] : [localBest]}
            onBack={returnToTitle}
            onSelectDifficulty={setRankingDifficulty}
            status="local"
            syncPending={controller.progress.pendingLeaderboardSubmissions[rankingDifficulty]
              !== undefined}
            unlockedDifficulties={controller.progress.unlockedDifficulties}
          />
        );
        break;
      }
      case 'tower':
        content = (
          <TowerScreen
            commonAssets={commonAssets}
            notice={boot.notice}
            progress={controller.progress}
            onSelectDifficulty={(difficulty) => { void selectDifficulty(difficulty); }}
            onSelectFloor={(floor) => dispatchRoute({ type: 'select-floor', floor })}
          />
        );
        break;
      case 'owl-reveal':
        content = (
          <OwlRevealScreen
            commonAssets={commonAssets}
            difficulty={controller.progress.selectedDifficulty}
            floorAssets={floorAssets}
            onBack={() => dispatchRoute({ type: 'return-to-tower' })}
            onStart={startOwlMatch}
          />
        );
        break;
      case 'owl-match':
        content = renderMatch({
          audioPort: services.audioPort,
          difficulty: controller.progress.selectedDifficulty,
          encounterIndex: 2,
          floor: FINAL_FLOOR,
          wins: 2,
          specialEncounter: OWL_ENCOUNTER,
          commonAssets,
          floorAssets,
          seed: route.seed,
          onFinished: finishOwlMatch,
          onRetrySettingsSave: retrySave,
          onSettingsChange: updateSettings,
          platform: services.platform,
          settings: controller.progress.settings,
          settingsSaveFailed: controller.saveError === 'SAVE_FAILED',
        });
        break;
      case 'owl-result':
        content = (
          <OwlResultScreen
            commonAssets={commonAssets}
            floorAssets={floorAssets}
            onContinue={() => dispatchRoute({ type: 'continue' })}
            result={route.result}
          />
        );
        break;
      case 'floor-intro':
        content = (
          <FloorIntroScreen
            background={floorAssets?.background}
            encounter={getFloorEncounter(route.floor, route.encounterIndex)}
            floor={route.floor}
            onBack={() => dispatchRoute({ type: 'return-to-tower' })}
            onStart={() => startIntro(route)}
            rival={commonAssets?.rivals[getFloorEncounter(route.floor, route.encounterIndex).characterId]}
            series={{
              floor: route.floor,
              encounterIndex: route.encounterIndex,
              wins: route.wins,
            }}
          />
        );
        break;
      case 'match':
        content = renderMatch({
          audioPort: services.audioPort,
          difficulty: controller.progress.selectedDifficulty,
          floor: route.floor,
          encounterIndex: route.encounterIndex,
          wins: route.wins,
          commonAssets,
          floorAssets,
          seed: route.seed,
          onFinished: finishMatch,
          onRetrySettingsSave: retrySave,
          onSettingsChange: updateSettings,
          platform: services.platform,
          settings: controller.progress.settings,
          settingsSaveFailed: controller.saveError === 'SAVE_FAILED',
        });
        break;
      case 'result':
        content = (
          <ResultScreen
            background={floorAssets?.background}
            encounter={getFloorEncounter(route.floor, route.encounterIndex)}
            floor={route.floor}
            progress={controller.progress}
            result={route.result}
            saveFailed={controller.saveError === 'SAVE_FAILED'}
            savePending={resultSavePending || saveRetrying}
            saveRetrying={saveRetrying}
            onContinue={() => dispatchRoute({ type: 'continue' })}
            onRetry={retryFloor}
            onRetrySave={() => void retrySave()}
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
            onReturnToTower={() => dispatchRoute({ type: 'return-to-tower' })}
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
    </main>
  );
}
