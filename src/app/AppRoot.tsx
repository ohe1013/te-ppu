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
import '../ui/screens/screens.css';
import {
  reduceRoute,
  type AppRoute,
  type Floor,
  type MatchResult,
} from './app-route';
import type { AppServices } from './app-services';
import type { AssetManager } from '../assets';
import { createAppLifecycleCoordinator } from '../platform/app-lifecycle';
import type { AudioPort } from '../platform/audio-port';
import type { ProgressState } from '../progression/index';
import type { PlatformPort } from '../platform/platform-port';
import { musicForRoute } from '../platform/audio-route';
import { TowerController } from './towerController';
import { useBoot } from './use-boot';

export interface MatchRouteViewProps {
  readonly audioPort: AudioPort;
  readonly floor: Floor;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => Promise<void>;
  readonly onRetrySettingsSave: () => Promise<boolean>;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly platform: PlatformPort;
  readonly settings: ProgressState['settings'];
  readonly settingsSaveFailed: boolean;
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
  const [, refreshControllerView] = useReducer((value: number) => value + 1, 0);
  const [resultSavePending, setResultSavePending] = useState(false);
  const [saveRetrying, setSaveRetrying] = useState(false);
  const controllerRef = useRef<TowerController | null>(null);
  const completionPendingRef = useRef(false);
  const completionTokenRef = useRef(0);
  const mountedRef = useRef(false);

  if (boot.status === 'ready' && controllerRef.current === null) {
    controllerRef.current = new TowerController(boot.progress, services.progressRepository);
  }
  const controller = controllerRef.current;

  useEffect(() => {
    if (boot.status === 'ready') dispatchRoute({ type: 'boot-ready' });
  }, [boot.status]);

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

  function startFloor(floor: Floor) {
    if (controller === null) return;
    const seed = createMatchSeed();
    const started = controller.startFloor(floor, seed);
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
    setResultSavePending(true);
    const save = controller.completeFloor(toControllerResult(result));
    dispatchRoute({ type: 'match-finished', result });
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

  let content: ReactNode;
  if (boot.status !== 'ready' || controller === null || route.name === 'boot') {
    content = <BootScreen state={boot} />;
  } else {
    switch (route.name) {
      case 'tower':
        content = (
          <TowerScreen
            notice={boot.notice}
            progress={controller.progress}
            onSelectFloor={(floor) => dispatchRoute({ type: 'select-floor', floor })}
          />
        );
        break;
      case 'floor-intro':
        content = (
          <FloorIntroScreen
            floor={route.floor}
            onBack={() => dispatchRoute({ type: 'return-to-tower' })}
            onStart={() => startFloor(route.floor)}
          />
        );
        break;
      case 'match':
        content = renderMatch({
          audioPort: services.audioPort,
          floor: route.floor,
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
            floor={route.floor}
            progress={controller.progress}
            result={route.result}
            saveFailed={controller.saveError === 'SAVE_FAILED'}
            savePending={resultSavePending || saveRetrying}
            saveRetrying={saveRetrying}
            onContinue={() => dispatchRoute({ type: 'continue' })}
            onRetry={retryFloor}
            onRetrySave={() => void retrySave()}
          />
        );
        break;
      case 'ending':
        content = (
          <EndingScreen
            onReturnToTower={() => dispatchRoute({ type: 'return-to-tower' })}
          />
        );
        break;
    }
  }

  return (
    <main
      className="app-shell"
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
