import { Application, type ApplicationRef } from '@pixi/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Application as PixiApplication } from 'pixi.js';
import type {
  GameEvent,
  PublicMatchView,
} from '../core/index';
import { BoardScene } from './BoardScene';
import { computeBoardLayout } from './board-layout';
import {
  effectsForEvents,
  EventAnimationQueue,
  type AnimationEffect,
} from './event-animation-queue';
import './pixi-elements';

const MAX_RESOLUTION = 2;
const MAX_DECORATIVE_EFFECTS = 6;
const CRITICAL_EFFECT_MS = 140;
const EFFECT_FRAME_GRACE_MS = 50;

export interface BattleCanvasProps {
  readonly events: readonly GameEvent[];
  readonly playerBoardOverlay?: ReactNode;
  readonly selectedRow: number | null;
  readonly view: PublicMatchView;
}

export interface CanvasMetrics {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

function resolution(): number {
  const value = Number.isFinite(window.devicePixelRatio)
    ? window.devicePixelRatio
    : 1;
  return Math.min(MAX_RESOLUTION, Math.max(1, value));
}

export function measureBattleCanvas(element: HTMLElement): CanvasMetrics {
  const rect = element.getBoundingClientRect();
  return {
    height: Math.max(1, Math.round(rect.height)),
    resolution: resolution(),
    width: Math.max(1, Math.round(rect.width)),
  };
}

export function observeBattleCanvas(
  element: HTMLElement,
  onChange: (metrics: CanvasMetrics) => void,
): () => void {
  const publish = () => onChange(measureBattleCanvas(element));
  const observer = new ResizeObserver(publish);
  observer.observe(element);
  window.addEventListener('resize', publish);

  let resolutionQuery: MediaQueryList | null = null;
  const handleResolutionChange = () => {
    publish();
    detachResolutionQuery();
    attachResolutionQuery();
  };
  const attachResolutionQuery = () => {
    if (typeof window.matchMedia !== 'function') return;
    resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    resolutionQuery.addEventListener('change', handleResolutionChange);
  };
  const detachResolutionQuery = () => {
    if (resolutionQuery === null) return;
    resolutionQuery.removeEventListener('change', handleResolutionChange);
    resolutionQuery = null;
  };

  attachResolutionQuery();
  publish();

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', publish);
    detachResolutionQuery();
  };
}

function useOrderedEffects(
  events: readonly GameEvent[],
  tick: number,
): {
  readonly effectProgress: number;
  readonly effects: readonly AnimationEffect[];
} {
  const queueRef = useRef(new EventAnimationQueue({
    maxDecorative: MAX_DECORATIVE_EFFECTS,
  }));
  const handledTickRef = useRef<number | null>(null);
  const activeRef = useRef<AnimationEffect | null>(null);
  const [active, setActive] = useState<AnimationEffect | null>(null);
  const [decorative, setDecorative] = useState<readonly AnimationEffect[]>([]);
  const [progress, setProgress] = useState<{
    readonly effectId: string | null;
    readonly value: number;
  }>({ effectId: null, value: 0 });

  useEffect(() => {
    if (events.length === 0 || handledTickRef.current === tick) return;
    handledTickRef.current = tick;
    const queue = queueRef.current;
    queue.enqueue(effectsForEvents(events, `tick-${tick}`));
    setDecorative(queue.takeDecorative());
    if (activeRef.current === null) {
      const next = queue.shiftCritical();
      activeRef.current = next;
      setActive(next);
    }
  }, [events, tick]);

  useEffect(() => {
    if (active === null) return;
    const effectId = active.id;
    setProgress({ effectId, value: 0 });
    let advanced = false;
    let advanceFrame: number | null = null;
    let progressFrame: number | null = null;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      setDecorative([]);
      const next = queueRef.current.shiftCritical();
      activeRef.current = next;
      setActive(next);
      setProgress({ effectId: next?.id ?? null, value: 0 });
    };
    if (active.event.type === 'garbage-landed') {
      const startedAt = performance.now();
      const updateProgress = (timestamp: number) => {
        progressFrame = null;
        if (advanced) return;
        const value = Math.min(
          1,
          Math.max(0, (timestamp - startedAt) / CRITICAL_EFFECT_MS),
        );
        setProgress((current) => (
          current.effectId === effectId && current.value === value
            ? current
            : { effectId, value }
        ));
        if (value < 1) {
          progressFrame = window.requestAnimationFrame(updateProgress);
          return;
        }
        advanceFrame = window.requestAnimationFrame(() => {
          advanceFrame = null;
          advance();
        });
      };
      progressFrame = window.requestAnimationFrame(updateProgress);
    }
    const timer = window.setTimeout(
      advance,
      active.event.type === 'garbage-landed'
        ? CRITICAL_EFFECT_MS + EFFECT_FRAME_GRACE_MS
        : CRITICAL_EFFECT_MS,
    );
    return () => {
      advanced = true;
      window.clearTimeout(timer);
      if (progressFrame !== null) window.cancelAnimationFrame(progressFrame);
      if (advanceFrame !== null) window.cancelAnimationFrame(advanceFrame);
    };
  }, [active]);

  return {
    effectProgress: active !== null && progress.effectId === active.id
      ? progress.value
      : 0,
    effects: active === null ? decorative : [active, ...decorative],
  };
}

export function BattleCanvas({
  events,
  playerBoardOverlay,
  selectedRow,
  view,
}: BattleCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<ApplicationRef>(null);
  const metricsRef = useRef<CanvasMetrics>({ height: 1, resolution: 1, width: 1 });
  const [metrics, setMetrics] = useState(metricsRef.current);
  const { effectProgress, effects } = useOrderedEffects(events, view.tick);
  const layout = computeBoardLayout(metrics.width, metrics.height);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    return observeBattleCanvas(host, (nextMetrics) => {
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
    });
  }, []);

  const resizeApplication = useCallback((application: PixiApplication) => {
    const nextMetrics = metricsRef.current;
    application.renderer.resize(
      nextMetrics.width,
      nextMetrics.height,
      nextMetrics.resolution,
    );
  }, []);

  useLayoutEffect(() => {
    const application = applicationRef.current?.getApplication();
    if (application !== null && application !== undefined) {
      application.renderer.resize(metrics.width, metrics.height, metrics.resolution);
    }
  }, [metrics]);

  return (
    <div
      className="battle-canvas"
      data-opponent-height={layout.opponent.height}
      data-opponent-width={layout.opponent.width}
      data-player-height={layout.player.height}
      data-player-width={layout.player.width}
      data-testid="battle-canvas"
      ref={hostRef}
    >
      <Application
        antialias={false}
        autoDensity
        backgroundAlpha={0}
        height={metrics.height}
        onInit={resizeApplication}
        preference="webgl"
        ref={applicationRef}
        resolution={metrics.resolution}
        width={metrics.width}
      >
        <BoardScene
          effectProgress={effectProgress}
          effects={effects}
          model={view.sides.player}
          rect={layout.player}
          selectedRow={selectedRow}
          side="player"
        />
        <BoardScene
          effectProgress={effectProgress}
          effects={effects}
          model={view.sides.opponent}
          rect={layout.opponent}
          selectedRow={null}
          side="opponent"
        />
      </Application>
      {playerBoardOverlay !== undefined && (
        <div
          className="battle-canvas__player-overlay"
          data-testid="player-board-overlay"
          style={{
            height: layout.player.height,
            left: layout.player.x,
            top: layout.player.y,
            width: layout.player.width,
          }}
        >
          {playerBoardOverlay}
        </div>
      )}
    </div>
  );
}
