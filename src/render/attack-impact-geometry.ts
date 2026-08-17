import type { SideId } from '../core/index';
import type { AttackFeedbackPresentation } from '../ui/match/attack-feedback';
import type { Rect } from './board-layout';

export interface ImpactOffset {
  readonly x: number;
  readonly y: number;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function boardImpactOffset(
  feedback: AttackFeedbackPresentation | null,
  side: SideId,
  sourceRect: Rect,
  targetRect: Rect,
): ImpactOffset {
  if (feedback === null
    || feedback.phase !== 'impact'
    || feedback.target !== side
    || feedback.displacementPx === 0) return { x: 0, y: 0 };

  const deltaX = targetRect.x + targetRect.width / 2
    - (sourceRect.x + sourceRect.width / 2);
  const deltaY = targetRect.y + targetRect.height / 2
    - (sourceRect.y + sourceRect.height / 2);
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return { x: 0, y: 0 };

  const progress = clampProgress(feedback.phaseProgress);
  const damped = Math.sin(progress * Math.PI * 2)
    * (1 - progress)
    * feedback.displacementPx;
  return {
    x: deltaX / distance * damped,
    y: deltaY / distance * damped,
  };
}
