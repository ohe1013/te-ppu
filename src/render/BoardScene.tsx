import { useCallback } from 'react';
import type {
  PublicSideView,
  SideId,
} from '../core/index';
import type { Rect } from './board-layout';
import {
  createBoardPrimitives,
  drawBoardPrimitives,
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
    return textures === null ? [] : [{ effect, group, textures }];
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
      {textured.map(({ effect, group, textures }) => (
        <pixiAnimatedSprite
          anchor={{ x: BATTLE_ANIMATIONS[group].anchor[0], y: BATTLE_ANIMATIONS[group].anchor[1] }}
          animationSpeed={BATTLE_ANIMATIONS[group].fps / 60}
          autoPlay
          key={effect.id}
          loop={BATTLE_ANIMATIONS[group].loop}
          textures={[...textures]}
          x={rect.width / 2}
          y={rect.height / 2}
        />
      ))}
    </pixiContainer>
  );
}
