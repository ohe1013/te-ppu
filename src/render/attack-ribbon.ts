import type { Rect } from './board-layout';

export interface AttackRibbonGeometry {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function computeAttackRibbon(
  from: Rect,
  to: Rect,
  progress: number,
): AttackRibbonGeometry {
  const clamped = clampProgress(progress);
  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height / 2;
  const toX = to.x + to.width / 2;
  const toY = to.y + to.height / 2;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  return {
    angle: Math.atan2(deltaY, deltaX),
    length: Math.max(24, Math.hypot(deltaX, deltaY)),
    x: fromX + deltaX * clamped,
    y: fromY + deltaY * clamped,
  };
}
