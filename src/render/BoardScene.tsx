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

function effectPosition(
  effect: AnimationEffect,
  group: Exclude<ReturnType<typeof animationEffectGroup>, null>,
  side: SideId,
  rect: Rect,
): { readonly x: number; readonly y: number } {
  const model = effect.view.sides[side];
  const cellWidth = rect.width / 10;
  const cellHeight = rect.height / 20;
  if ((group === 'move-dust' || group === 'rotate-spark') && model.active !== null) {
    return {
      x: (model.active.x + 2) * cellWidth,
      y: (model.active.y + 2) * cellHeight,
    };
  }
  if (group === 'line-clear' && effect.event?.type === 'lines-cleared') {
    const row = effect.event.rows?.[0] ?? 10;
    return { x: rect.width / 2, y: (row + .5) * cellHeight };
  }
  if (group === 'garbage-land' && effect.event?.type === 'garbage-landed') {
    return {
      x: ((effect.event.column ?? 5) + .5) * cellWidth,
      y: ((effect.event.landingRow ?? 19) + .5) * cellHeight,
    };
  }
  return { x: rect.width / 2, y: rect.height / 2 };
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
      {textured.map(({ effect, group, textures }) => {
        const position = effectPosition(effect, group, side, rect);
        return <pixiAnimatedSprite
          anchor={{ x: BATTLE_ANIMATIONS[group].anchor[0], y: BATTLE_ANIMATIONS[group].anchor[1] }}
          animationSpeed={BATTLE_ANIMATIONS[group].fps / 60}
          autoPlay
          key={effect.id}
          loop={BATTLE_ANIMATIONS[group].loop}
          textures={textures}
          x={position.x}
          y={position.y}
        />
      })}
    </pixiContainer>
  );
}
