import { VISIBLE_ROWS } from '../../core/index';

export function rowAtPointer(
  clientY: number,
  boardRect: DOMRect,
): number | null {
  if (
    !Number.isFinite(clientY)
    || !Number.isFinite(boardRect.top)
    || !Number.isFinite(boardRect.height)
    || boardRect.height <= 0
  ) {
    return null;
  }

  const offset = clientY - boardRect.top;
  if (offset < 0 || offset >= boardRect.height) return null;
  return Math.floor((offset / boardRect.height) * VISIBLE_ROWS);
}
