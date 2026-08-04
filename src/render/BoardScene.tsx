import { useCallback } from 'react';
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
import type { AnimationEffect } from './event-animation-queue';
import { animationEffectGroup, animationEffectSide } from './event-animation-queue';
import {
  BATTLE_ANIMATIONS,
  resolveBattleAnimationFrames,
  type BattleAtlasTextures,
} from './battle-animation-registry';

export interface BoardSceneProps {
  readonly atlas?: BattleAtlasTextures | null;
  readonly effectProgress: number;
  readonly effects: readonly AnimationEffect[];
  readonly model: PublicSideView;
  readonly rect: Rect;
  readonly selectedRow: number | null;
  readonly side: SideId;
}

export function BoardScene({
  atlas,
  effectProgress,
  effects,
  model,
  rect,
  selectedRow,
  side,
}: BoardSceneProps) {
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
  const draw = useCallback((graphics: Parameters<typeof drawBoardPrimitives>[0]) => {
    const primitives = createBoardPrimitives({
      effectProgress,
      effects: fallbackEffects,
      model: texturedFreeze ? { ...model, freezeTicks: 0 } : model,
      selectedRow,
      side,
    });
    drawBoardPrimitives(graphics, primitives, rect.width, rect.height);
  }, [effectProgress, fallbackEffects, model, rect.height, rect.width, selectedRow, side, texturedFreeze]);

  return (
    <pixiContainer x={rect.x} y={rect.y}>
      <pixiGraphics draw={draw} />
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
