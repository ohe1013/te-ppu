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
import { TowerController } from './towerController';
import { useBoot } from './use-boot';

export interface MatchRouteViewProps {
  readonly floor: Floor;
  readonly seed: number;
  readonly onFinished: (result: MatchResult) => Promise<void>;
}

export interface AppRootProps {
  readonly services: AppServices;
  readonly createMatchSeed?: () => number;
  readonly renderMatch?: (props: MatchRouteViewProps) => ReactNode;
}

function createDefaultMatchSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]!;
}

function DefaultMatchRoute({ floor }: MatchRouteViewProps) {
  return (
    <section className="screen-shell" data-testid="match-screen">
      <p className="eyebrow">{floor}층 대전</p>
      <h1>대전 화면을 준비하고 있습니다</h1>
    </section>
  );
}

function toControllerResult(result: MatchResult): 'WIN' | 'LOSS' | 'DRAW' {
  if (result === 'win') return 'WIN';
  if (result === 'loss') return 'LOSS';
  return 'DRAW';
}

export function AppRoot({
  createMatchSeed = createDefaultMatchSeed,
  renderMatch = (props) => <DefaultMatchRoute {...props} />,
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

  const controller = controllerRef.current;

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

  async function retrySave(): Promise<void> {
    if (controller === null || saveRetrying) return;
    setSaveRetrying(true);
    await controller.retrySave();
    if (!mountedRef.current) return;
    setSaveRetrying(false);
    refreshControllerView();
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
          floor: route.floor,
          seed: route.seed,
          onFinished: finishMatch,
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
    >
      {content}
    </main>
  );
}
