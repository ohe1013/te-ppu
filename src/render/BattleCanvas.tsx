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
  PublicMatchView,
} from '../core/index';
import type { CommandFeedback, GameEventBatch } from '../app/use-match-loop';
import { BoardScene } from './BoardScene';
import { computeBoardLayout } from './board-layout';
import {
  effectsForEvents,
  effectsForCommandFeedback,
  effectLifetimeMs,
  EventAnimationQueue,
  stateEffectsForView,
  type AnimationEffect,
} from './event-animation-queue';
import {
  BATTLE_ANIMATIONS,
  resolveBattleAnimationFrames,
  type BattleAtlasTextures,
} from './battle-animation-registry';
import './pixi-elements';

const MAX_RESOLUTION = 2;
const MAX_DECORATIVE_EFFECTS = 6;
const EFFECT_FRAME_GRACE_MS = 50;

export interface BattleCanvasProps {
  readonly commandFeedback: readonly CommandFeedback[];
  readonly eventBatches: readonly GameEventBatch[];
  readonly atlas?: BattleAtlasTextures | null;
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
  eventBatches: readonly GameEventBatch[],
  commandFeedback: readonly CommandFeedback[],
  view: PublicMatchView,
): {
  readonly effectProgress: number;
  readonly effects: readonly AnimationEffect[];
} {
  const queueRef = useRef(new EventAnimationQueue({
    maxDecorative: MAX_DECORATIVE_EFFECTS,
  }));
  const handledBatchesRef = useRef(new Set<string>());
  const handledCommandsRef = useRef(new Set<number>());
  const activeRef = useRef<AnimationEffect | null>(null);
  const [active, setActive] = useState<AnimationEffect | null>(null);
  const [decorative, setDecorative] = useState<readonly AnimationEffect[]>([]);
  const [progress, setProgress] = useState<{
    readonly effectId: string | null;
    readonly value: number;
  }>({ effectId: null, value: 0 });

  useEffect(() => {
    const queue = queueRef.current;
    for (const [index, batch] of eventBatches
      .map((value, index) => ({ index, value }))
      .sort((left, right) => left.value.tick - right.value.tick || left.index - right.index)
      .map(({ index, value }) => [index, value] as const)) {
      const batchKey = `${batch.tick}:${index}`;
      if (batch.events.length === 0 || handledBatchesRef.current.has(batchKey)) continue;
      handledBatchesRef.current.add(batchKey);
      queue.enqueue(effectsForEvents(batch.events, batch.tick, batch.view));
    }
    for (const feedback of commandFeedback) {
      if (handledCommandsRef.current.has(feedback.sequence)) continue;
      handledCommandsRef.current.add(feedback.sequence);
      queue.enqueue(effectsForCommandFeedback([feedback], view));
    }
    setDecorative(queue.takeDecorative());
    if (activeRef.current === null) {
      const next = queue.shiftCritical();
      activeRef.current = next;
      setActive(next);
    }
  }, [commandFeedback, eventBatches, view]);

  useEffect(() => {
    if (active === null) return;
    const duration = effectLifetimeMs(active);
    if (duration === null) return;
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
    const startedAt = performance.now();
    const updateProgress = (timestamp: number) => {
      progressFrame = null;
      if (advanced) return;
      const value = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
      setProgress((current) => current.effectId === effectId && current.value === value
        ? current : { effectId, value });
      if (value < 1) {
        progressFrame = window.requestAnimationFrame(updateProgress);
      } else {
        advanceFrame = window.requestAnimationFrame(() => {
          advanceFrame = null;
          advance();
        });
      }
    };
    progressFrame = window.requestAnimationFrame(updateProgress);
    const timer = window.setTimeout(
      advance,
      duration + EFFECT_FRAME_GRACE_MS,
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
    effects: [
      ...(active === null ? decorative : [active, ...decorative]),
      ...stateEffectsForView(view),
    ],
  };
}

export function BattleCanvas({
  atlas,
  commandFeedback,
  eventBatches,
  playerBoardOverlay,
  selectedRow,
  view,
}: BattleCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<ApplicationRef>(null);
  const metricsRef = useRef<CanvasMetrics>({ height: 1, resolution: 1, width: 1 });
  const [metrics, setMetrics] = useState(metricsRef.current);
  const { effectProgress, effects } = useOrderedEffects(eventBatches, commandFeedback, view);
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
      data-opponent-board-height={layout.opponent.height}
      data-opponent-board-width={layout.opponent.width}
      data-opponent-height={layout.opponent.height}
      data-opponent-width={layout.opponent.width}
      data-player-board-height={layout.player.height}
      data-player-board-width={layout.player.width}
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
          atlas={atlas}
          effectProgress={effectProgress}
          effects={effects}
          model={view.sides.player}
          rect={layout.player}
          selectedRow={selectedRow}
          side="player"
        />
        <BoardScene
          atlas={atlas}
          effectProgress={effectProgress}
          effects={effects}
          model={view.sides.opponent}
          rect={layout.opponent}
          selectedRow={null}
          side="opponent"
        />
        {effects.flatMap((effect) => {
          if (effect.group !== 'attack-shot') return [];
          const textures = resolveBattleAnimationFrames(atlas, effect.group);
          if (textures === null) return [];
          const from = effect.side === 'player' ? layout.player : layout.opponent;
          const to = effect.side === 'player' ? layout.opponent : layout.player;
          const progress = effectProgress;
          return [
            <pixiAnimatedSprite
              anchor={{ x: BATTLE_ANIMATIONS['attack-shot'].anchor[0], y: BATTLE_ANIMATIONS['attack-shot'].anchor[1] }}
              animationSpeed={BATTLE_ANIMATIONS['attack-shot'].fps / 60}
              autoPlay
              data-testid="attack-shot-sprite"
              key={effect.id}
              loop
              textures={[...textures]}
              x={from.x + from.width / 2 + (to.x - from.x) * progress}
              y={from.y + from.height / 2 + (to.y - from.y) * progress}
            />,
          ];
        })}
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
