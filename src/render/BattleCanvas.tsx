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
import type { AttackFeedbackPresentation } from '../ui/match/attack-feedback';
import type { AtlasData } from '../assets';
import {
  commandFeedbackViewFor,
  type CommandFeedback,
  type GameEventBatch,
} from '../app/use-match-loop';
import { BoardScene } from './BoardScene';
import { computeBoardLayout } from './board-layout';
import { computeAttackRibbon } from './attack-ribbon';
import { boardImpactOffset } from './attack-impact-geometry';
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
  readonly attackFeedback?: AttackFeedbackPresentation | null;
  readonly commandFeedback: readonly CommandFeedback[];
  readonly eventBatches: readonly GameEventBatch[];
  readonly atlas?: BattleAtlasInput | null;
  /** Optional manager-resolved tile refs; missing refs retain Graphics rendering. */
  readonly skin?: BoardSkin;
  readonly playerBoardOverlay?: ReactNode;
  readonly reducedMotion?: boolean;
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

  const retain = (effects: readonly AnimationEffect[], startedAt: number): boolean => {
    let retained = false;
    for (const effect of effects) {
      if (effect.priority === 'critical') {
        pendingCriticalRef.current.push(effect);
        retained = true;
        continue;
      }
      const decorativeCount = [...runningRef.current.values()]
        .filter(({ effect: running }) => running.priority === 'decorative').length;
      if (decorativeCount < MAX_DECORATIVE_EFFECTS) {
        runningRef.current.set(effect.id, { effect, startedAt });
        retained = true;
      }
    }
    startNextCritical(startedAt);
    return retained;
  };

  useEffect(() => {
    const startedAt = performance.now();
    let retainedEffects = false;
    for (const [index, batch] of eventBatches
      .map((value, index) => ({ index, value }))
      .sort((left, right) => left.value.tick - right.value.tick || left.index - right.index)
      .map(({ index, value }) => [index, value] as const)) {
      const batchKey = `${batch.tick}:${index}`;
      if (batch.events.length === 0 || handledBatchesRef.current.has(batchKey)) continue;
      handledBatchesRef.current.add(batchKey);
      retainedEffects = retain(effectsForEvents(batch.events, batch.tick, batch.view), startedAt)
        || retainedEffects;
    }
    for (const feedback of commandFeedback) {
      if (handledCommandsRef.current.has(feedback.sequence)) continue;
      handledCommandsRef.current.add(feedback.sequence);
      retainedEffects = retain(effectsForCommandFeedback(
        [feedback],
        commandFeedbackViewFor(commandFeedback, feedback) ?? view,
      ), startedAt) || retainedEffects;
    }
    if (retainedEffects) refresh((version) => version + 1);
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
  attackFeedback = null,
  commandFeedback,
  eventBatches,
  playerBoardOverlay,
  reducedMotion = false,
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
  const boardEffects = effects.filter((effect) => effect.group !== 'attack-shot');
  const layout = computeBoardLayout(metrics.width, metrics.height);
  const attackSource = attackFeedback?.source ?? 'player';
  const attackReducedMotion = attackFeedback?.reducedMotion ?? false;
  const sourceRect = attackFeedback?.source === 'opponent' ? layout.opponent : layout.player;
  const targetRect = attackFeedback?.target === 'player' ? layout.player : layout.opponent;
  const playerOffset = boardImpactOffset(attackFeedback, 'player', sourceRect, targetRect);
  const opponentOffset = boardImpactOffset(attackFeedback, 'opponent', sourceRect, targetRect);
  const presentedPlayer = {
    ...layout.player,
    x: layout.player.x + playerOffset.x,
    y: layout.player.y + playerOffset.y,
  };
  const presentedOpponent = {
    ...layout.opponent,
    x: layout.opponent.x + opponentOffset.x,
    y: layout.opponent.y + opponentOffset.y,
  };
  const launchRibbon = attackFeedback?.phase === 'launch'
    ? computeAttackRibbon(
      sourceRect,
      targetRect,
      attackReducedMotion
        ? 1
        : 1 - (1 - attackFeedback.phaseProgress) ** 3,
    )
    : null;
  const attackFrames = launchRibbon === null
    ? null
    : resolveBattleAnimationFrames(textures, 'attack-shot');
  const launchAlpha = attackReducedMotion
    ? 0.35 + Math.min(1, Math.max(0, attackFeedback?.phaseProgress ?? 0)) * 0.65
    : 1;
  const impactProgress = attackFeedback?.phase === 'impact'
    ? Math.min(1, Math.max(0, attackFeedback.phaseProgress))
    : null;

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
          rect={presentedPlayer}
          reducedMotion={reducedMotion}
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
          rect={presentedOpponent}
          reducedMotion={reducedMotion}
          selectedRow={null}
          skin={skin}
          side="opponent"
          textureCache={textureCacheRef.current}
        />
        {launchRibbon !== null && attackFrames !== null && (
          <pixiAnimatedSprite
            alpha={launchAlpha}
            anchor={{ x: BATTLE_ANIMATIONS['attack-shot'].anchor[0], y: BATTLE_ANIMATIONS['attack-shot'].anchor[1] }}
            animationSpeed={BATTLE_ANIMATIONS['attack-shot'].fps / 60}
            autoPlay
            data-testid="attack-shot-sprite"
            height={Math.max(24, Math.min(72, launchRibbon.length * 0.2))}
            loop
            rotation={launchRibbon.angle}
            textures={attackFrames}
            width={Math.max(24, Math.min(72, launchRibbon.length * 0.2))}
            x={launchRibbon.x}
            y={launchRibbon.y}
          />
        )}
        {launchRibbon !== null && attackFrames === null && (
          <pixiGraphics
            alpha={launchAlpha}
            data-testid="attack-ribbon"
            draw={(graphics: Graphics) => {
              graphics.clear();
              const half = Math.max(12, Math.min(42, launchRibbon.length * 0.16));
              const directionX = Math.cos(launchRibbon.angle);
              const directionY = Math.sin(launchRibbon.angle);
              graphics
                .moveTo(-directionX * half, -directionY * half)
                .lineTo(directionX * half, directionY * half)
                .stroke({
                  color: attackSource === 'player' ? 0x65d8ff : 0xff6fb1,
                  width: Math.max(4, Math.min(sourceRect.width, sourceRect.height) * 0.06),
                });
              graphics.circle(
                0,
                0,
                Math.max(5, Math.min(sourceRect.width, sourceRect.height) * 0.1),
              ).fill({ color: 0xffca5c });
              graphics.circle(
                0,
                0,
                Math.max(8, Math.min(sourceRect.width, sourceRect.height) * 0.15),
              ).stroke({ color: 0xfff4cf, width: 2 });
            }}
            x={launchRibbon.x}
            y={launchRibbon.y}
          />
        )}
        {impactProgress !== null && (
          <pixiGraphics
            alpha={1 - impactProgress}
            data-testid="attack-impact-ring"
            draw={(graphics: Graphics) => {
              const boardSize = Math.min(targetRect.width, targetRect.height);
              const radius = attackReducedMotion
                ? Math.max(8, Math.min(18, boardSize * 0.1))
                : Math.max(8, Math.min(24, boardSize * (0.08 + impactProgress * 0.07)));
              graphics.clear();
              graphics.circle(0, 0, radius).stroke({
                color: attackSource === 'player' ? 0x65d8ff : 0xff6fb1,
                width: 2,
              });
            }}
            x={targetRect.x + targetRect.width / 2}
            y={targetRect.y + targetRect.height / 2}
          />
        )}
      </Application>
      {playerBoardOverlay !== undefined && (
        <div
          className="battle-canvas__player-overlay"
          data-testid="player-board-overlay"
          style={{
            height: presentedPlayer.height,
            left: presentedPlayer.x,
            top: presentedPlayer.y,
            width: presentedPlayer.width,
          }}
        >
          {playerBoardOverlay}
        </div>
      )}
    </div>
  );
}
