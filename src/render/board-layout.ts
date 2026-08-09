export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BoardLayout {
  readonly player: Rect;
  readonly opponent: Rect;
  readonly gap: number;
}

const BOARD_COLUMNS = 10;
const BOARD_ROWS = 20;
const BOARD_GAP = 8;

function dimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function computeBoardLayout(width: number, height: number): BoardLayout {
  const availableWidth = dimension(width);
  const availableHeight = dimension(height);
  const gap = Math.min(BOARD_GAP, availableWidth);
  const cellSize = Math.max(0, Math.min(
    availableHeight / BOARD_ROWS,
    (availableWidth - gap) / (BOARD_COLUMNS * 2),
  ));
  const boardWidth = cellSize * BOARD_COLUMNS;
  const boardHeight = cellSize * BOARD_ROWS;
  const occupiedWidth = boardWidth * 2 + gap;
  const x = (availableWidth - occupiedWidth) / 2;
  const y = (availableHeight - boardHeight) / 2;

  return {
    gap,
    player: { x, y, width: boardWidth, height: boardHeight },
    opponent: {
      x: x + boardWidth + gap,
      y,
      width: boardWidth,
      height: boardHeight,
    },
  };
}
