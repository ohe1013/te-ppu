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

export interface BoardSceneProps {
  readonly effects: readonly AnimationEffect[];
  readonly model: PublicSideView;
  readonly rect: Rect;
  readonly selectedRow: number | null;
  readonly side: SideId;
}

export function BoardScene({
  effects,
  model,
  rect,
  selectedRow,
  side,
}: BoardSceneProps) {
  const draw = useCallback((graphics: Parameters<typeof drawBoardPrimitives>[0]) => {
    const primitives = createBoardPrimitives({ effects, model, selectedRow, side });
    drawBoardPrimitives(graphics, primitives, rect.width, rect.height);
  }, [effects, model, rect.height, rect.width, selectedRow, side]);

  return (
    <pixiContainer x={rect.x} y={rect.y}>
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
}
