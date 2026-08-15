import { useCallback, useState } from 'react';
import type { Graphics } from 'pixi.js';
import type {
  PublicSideView,
  SideId,
} from '../core/index';
import type { Rect } from './board-layout';
import {
  createBoardPrimitives,
  drawBoardPrimitives,
  effectPlacementPrimitives,
} from './draw-primitives';
import { partitionBoardPrimitives, type BoardSkin } from './board-skin';
import type { BattleTextureCache } from './battle-texture-cache';
import type { AnimationEffect } from './event-animation-queue';
import {
  animationEffectGroup,
  animationEffectSide,
  garbageRiseOffsetRows,
} from './event-animation-queue';
import {
  BATTLE_ANIMATIONS,
  resolveBattleAnimationFrames,
  type BattleAtlasTextures,
} from './battle-animation-registry';

export interface BoardSceneProps {
  readonly atlas?: BattleAtlasTextures | null;
  /** Manager-owned image refs; omitted skin keeps the procedural board intact. */
  readonly skin?: BoardSkin;
  /** Task 5 cache; BoardScene never creates URL textures. */
  readonly textureCache?: Pick<BattleTextureCache, 'resolveImage'>;
  readonly effectProgress: number;
  readonly effects: readonly AnimationEffect[];
  readonly model: PublicSideView;
  readonly rect: Rect;
  readonly reducedMotion?: boolean;
  readonly selectedRow: number | null;
  readonly side: SideId;
}

export function BoardScene({
  atlas,
  skin,
  textureCache,
  effectProgress,
  effects,
  model,
  rect,
  reducedMotion = false,
  selectedRow,
  side,
}: BoardSceneProps) {
  const [contentMask, setContentMask] = useState<Graphics | null>(null);
  const captureContentMask = useCallback((value: Graphics | null) => {
    setContentMask((current) => current === value ? current : value);
  }, []);
  const garbageRise = effects.find((effect) => (
    animationEffectSide(effect) === side
    && animationEffectGroup(effect) === 'garbage-land'
    && effect.event?.type === 'garbage-raised'
  ));
  const riseProgress = Math.min(1, Math.max(
    0,
    garbageRise?.presentationProgress ?? effectProgress,
  ));
  const contentOffsetRows = reducedMotion || garbageRise === undefined
    ? 0
    : garbageRiseOffsetRows(garbageRise, side, effectProgress);
  const contentAlpha = reducedMotion && garbageRise !== undefined
    ? 0.7 + riseProgress * 0.3
    : 1;
  const presentedModel = garbageRise?.view.sides[side] ?? model;
  const textured = effects.flatMap((effect) => {
    const group = animationEffectGroup(effect);
    if (group === null || group === 'attack-shot' || animationEffectSide(effect) !== side) return [];
    const textures = resolveBattleAnimationFrames(atlas, group);
    return textures === null ? [] : effectPlacementPrimitives(effect, side, effectProgress)
      .map((placement, index) => ({ effect, group, index, placement, textures }));
  });
  const texturedIds = new Set(textured.map(({ effect }) => effect.id));
  const fallbackEffects = effects.filter((effect) => !texturedIds.has(effect.id));
  const texturedFreeze = textured.some(({ group }) => group === 'freeze-overlay');
  const primitives = createBoardPrimitives({
    effectProgress,
    effects: fallbackEffects,
    model: texturedFreeze ? { ...presentedModel, freezeTicks: 0 } : presentedModel,
    selectedRow,
    side,
  });
  const isContentPrimitive = (role: (typeof primitives)[number]['role']) => (
    role === 'fixed-cell'
    || role === 'item-marker'
    || role === 'active-cell'
    || role === 'ghost-cell'
  );
  const contentPrimitives = primitives.filter(({ role }) => isContentPrimitive(role));
  const stationaryPrimitives = primitives.filter(({ role }) => !isContentPrimitive(role));
  const cellPartition = skin === undefined || textureCache === undefined
    ? null
    : partitionBoardPrimitives(contentPrimitives, skin, rect.width, rect.height);
  const drawStationaryBoard = useCallback((graphics: Graphics) => {
    drawBoardPrimitives(graphics, stationaryPrimitives, rect.width, rect.height);
  }, [rect.height, rect.width, stationaryPrimitives]);
  const drawBoardContent = useCallback((graphics: Graphics) => {
    drawBoardPrimitives(graphics, cellPartition?.fallback ?? contentPrimitives, rect.width, rect.height);
  }, [cellPartition, contentPrimitives, rect.height, rect.width]);
  const drawBoardMask = useCallback((graphics: Graphics) => {
    graphics.clear();
    graphics.rect(0, 0, rect.width, rect.height).fill({ color: 0xffffff });
  }, [rect.height, rect.width]);

  return (
    <pixiContainer x={rect.x} y={rect.y}>
      <pixiGraphics data-testid="stationary-board-graphics" draw={drawStationaryBoard} />
      <pixiGraphics data-testid="board-content-mask" draw={drawBoardMask} ref={captureContentMask} />
      <pixiContainer
        alpha={contentAlpha}
        data-content-alpha={contentAlpha}
        data-content-offset-rows={contentOffsetRows}
        mask={contentMask}
        y={contentOffsetRows * rect.height / 20}
      >
        <pixiGraphics data-testid="board-content-graphics" draw={drawBoardContent} />
        {cellPartition?.textured.map((cell, index) => (
          <pixiSprite
            height={cell.height}
            key={`cell:${index}`}
            texture={textureCache!.resolveImage(cell.texture)}
            width={cell.width}
            x={cell.x}
            y={cell.y}
          />
        ))}
      </pixiContainer>
      {textured.map(({ effect, group, index, placement, textures }) => {
        const anchor = BATTLE_ANIMATIONS[group].anchor;
        const position = {
          x: (placement.x + placement.width * anchor[0]) * rect.width / 10,
          y: (placement.y + placement.height * anchor[1]) * rect.height / 20,
        };
        return <pixiAnimatedSprite
          anchor={{ x: BATTLE_ANIMATIONS[group].anchor[0], y: BATTLE_ANIMATIONS[group].anchor[1] }}
          animationSpeed={BATTLE_ANIMATIONS[group].fps / 60}
          autoPlay
          key={`${effect.id}:${index}`}
          loop={BATTLE_ANIMATIONS[group].loop}
          textures={textures}
          x={position.x}
          y={position.y}
        />
      })}
    </pixiContainer>
  );
}
