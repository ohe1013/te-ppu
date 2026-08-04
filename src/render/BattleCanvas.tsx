import { Application, type ApplicationRef } from '@pixi/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Texture, type Application as PixiApplication, type Graphics } from 'pixi.js';
import type {
  PublicMatchView,
} from '../core/index';
import type { AtlasData } from '../assets';
import {
  commandFeedbackViewFor,
  type CommandFeedback,
  type GameEventBatch,
} from '../app/use-match-loop';
import { BoardScene } from './BoardScene';
import { computeBoardLayout } from './board-layout';
import {
  effectsForEvents,
  effectsForCommandFeedback,
  effectLifetimeMs,
  stateEffectsForView,
  type AnimationEffect,
} from './event-animation-queue';
import {
  BATTLE_ANIMATIONS,
  resolveBattleAnimationFrames,
  type BattleAtlasTextures,
} from './battle-animation-registry';
import { BattleTextureCache } from './battle-texture-cache';
import type { BoardSkin } from './board-skin';
import './pixi-elements';

const MAX_RESOLUTION = 2;
const MAX_DECORATIVE_EFFECTS = 6;
type BattleAtlasInput = BattleAtlasTextures | AtlasData;

export interface BattleCanvasProps {
  readonly commandFeedback: readonly CommandFeedback[];
  readonly eventBatches: readonly GameEventBatch[];
  readonly atlas?: BattleAtlasInput | null;
  /** Optional manager-resolved tile refs; missing refs retain Graphics rendering. */
  readonly skin?: BoardSkin;
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

interface StartedEffect {
  readonly effect: AnimationEffect;
  readonly startedAt: number;
}

function isAtlasData(atlas: BattleAtlasInput | null | undefined): atlas is AtlasData {
  return atlas !== null
    && atlas !== undefined
    && 'image' in atlas
    && 'json' in atlas;
}

function useOrderedEffects(
  eventBatches: readonly GameEventBatch[],
  commandFeedback: readonly CommandFeedback[],
  view: PublicMatchView,
): {
  readonly effectProgress: number;
  readonly effects: readonly AnimationEffect[];
} {
  const handledBatchesRef = useRef(new Set<string>());
  const handledCommandsRef = useRef(new Set<number>());
  const pendingCriticalRef = useRef<AnimationEffect[]>([]);
  const runningRef = useRef(new Map<string, StartedEffect>());
  const [, refresh] = useState(0);

  const startNextCritical = (startedAt: number) => {
    const hasCritical = [...runningRef.current.values()]
      .some(({ effect }) => effect.priority === 'critical');
    if (hasCritical) return;
    const next = pendingCriticalRef.current.shift();
    if (next !== undefined) runningRef.current.set(next.id, { effect: next, startedAt });
  };

  const retain = (effects: readonly AnimationEffect[], startedAt: number) => {
    for (const effect of effects) {
      if (effect.priority === 'critical') {
        pendingCriticalRef.current.push(effect);
        continue;
      }
      const decorativeCount = [...runningRef.current.values()]
        .filter(({ effect: running }) => running.priority === 'decorative').length;
      if (decorativeCount < MAX_DECORATIVE_EFFECTS) {
        runningRef.current.set(effect.id, { effect, startedAt });
      }
    }
    startNextCritical(startedAt);
  };

  useEffect(() => {
    const startedAt = performance.now();
    for (const [index, batch] of eventBatches
      .map((value, index) => ({ index, value }))
      .sort((left, right) => left.value.tick - right.value.tick || left.index - right.index)
      .map(({ index, value }) => [index, value] as const)) {
      const batchKey = `${batch.tick}:${index}`;
      if (batch.events.length === 0 || handledBatchesRef.current.has(batchKey)) continue;
      handledBatchesRef.current.add(batchKey);
      retain(effectsForEvents(batch.events, batch.tick, batch.view), startedAt);
    }
    for (const feedback of commandFeedback) {
      if (handledCommandsRef.current.has(feedback.sequence)) continue;
      handledCommandsRef.current.add(feedback.sequence);
      retain(effectsForCommandFeedback(
        [feedback],
        commandFeedbackViewFor(commandFeedback, feedback) ?? view,
      ), startedAt);
    }
    refresh((version) => version + 1);
  }, [commandFeedback, eventBatches, view]);

  useEffect(() => {
    if (runningRef.current.size === 0) return;
    let frame: number | null = null;
    const update = (timestamp: number) => {
      let expiredCritical = false;
      for (const [id, started] of runningRef.current) {
        const duration = effectLifetimeMs(started.effect);
        if (duration !== null && timestamp - started.startedAt >= duration) {
          runningRef.current.delete(id);
          expiredCritical ||= started.effect.priority === 'critical';
        }
      }
      if (expiredCritical) startNextCritical(timestamp);
      refresh((version) => version + 1);
      if (runningRef.current.size > 0) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  });

  const now = performance.now();
  const transient = [...runningRef.current.values()].map(({ effect, startedAt }) => {
    const duration = effectLifetimeMs(effect);
    const presentationProgress = duration === null ? 0 : Math.min(1, Math.max(0, (now - startedAt) / duration));
    return { ...effect, presentationProgress } satisfies AnimationEffect;
  });
  const active = transient.find(({ priority }) => priority === 'critical') ?? null;

  return {
    effectProgress: active?.presentationProgress ?? 0,
    effects: [
      ...transient,
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
  skin,
  view,
}: BattleCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<ApplicationRef>(null);
  const textureCacheRef = useRef<BattleTextureCache | null>(null);
  if (textureCacheRef.current === null) textureCacheRef.current = new BattleTextureCache(Texture);
  const metricsRef = useRef<CanvasMetrics>({ height: 1, resolution: 1, width: 1 });
  const [metrics, setMetrics] = useState(metricsRef.current);
  const { effectProgress, effects } = useOrderedEffects(eventBatches, commandFeedback, view);
  const textures = isAtlasData(atlas)
    ? textureCacheRef.current.resolveAtlas(atlas)
    : atlas;
  const boardEffects = effects.filter((effect) => (
    effect.group !== 'attack-shot'
    || resolveBattleAnimationFrames(textures, 'attack-shot') === null
  ));
  const fallbackAttacks = effects.filter((effect) => (
    effect.group === 'attack-shot'
    && resolveBattleAnimationFrames(textures, 'attack-shot') === null
  ));
  const layout = computeBoardLayout(metrics.width, metrics.height);

  useEffect(() => () => textureCacheRef.current?.destroy(), []);

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
          atlas={textures}
          effectProgress={effectProgress}
          effects={boardEffects}
          model={view.sides.player}
          rect={layout.player}
          selectedRow={selectedRow}
          skin={skin}
          side="player"
          textureCache={textureCacheRef.current}
        />
        <BoardScene
          atlas={textures}
          effectProgress={effectProgress}
          effects={boardEffects}
          model={view.sides.opponent}
          rect={layout.opponent}
          selectedRow={null}
          skin={skin}
          side="opponent"
          textureCache={textureCacheRef.current}
        />
        {effects.flatMap((effect) => {
          if (effect.group !== 'attack-shot') return [];
          const frames = resolveBattleAnimationFrames(textures, effect.group);
          if (frames === null) return [];
          const from = effect.side === 'player' ? layout.player : layout.opponent;
          const to = effect.side === 'player' ? layout.opponent : layout.player;
          const progress = effect.presentationProgress ?? effectProgress;
          return [
            <pixiAnimatedSprite
              anchor={{ x: BATTLE_ANIMATIONS['attack-shot'].anchor[0], y: BATTLE_ANIMATIONS['attack-shot'].anchor[1] }}
              animationSpeed={BATTLE_ANIMATIONS['attack-shot'].fps / 60}
              autoPlay
              data-testid="attack-shot-sprite"
              key={effect.id}
              loop
              textures={frames}
              x={from.x + from.width / 2 + (to.x - from.x) * progress}
              y={from.y + from.height / 2 + (to.y - from.y) * progress}
            />,
          ];
        })}
        {fallbackAttacks.length > 0 && (
          <pixiGraphics
            draw={(graphics: Graphics) => {
              graphics.clear();
              for (const effect of fallbackAttacks) {
                const from = effect.side === 'player' ? layout.player : layout.opponent;
                const to = effect.side === 'player' ? layout.opponent : layout.player;
                const progress = effect.presentationProgress ?? effectProgress;
                const x = from.x + from.width / 2 + (to.x - from.x) * progress;
                const y = from.y + from.height / 2 + (to.y - from.y) * progress;
                graphics.circle(x, y, Math.max(4, Math.min(from.width, from.height) * 0.08))
                  .fill({ color: 0xff9f43 });
              }
            }}
          />
        )}
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
