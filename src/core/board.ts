import {
  BOARD_ROWS,
  BOARD_WIDTH,
  HIDDEN_ROWS,
  VISIBLE_ROWS,
  type ActivePiece,
  type Board,
  type Cell,
  type ItemType,
  type PositionedCell,
} from './model';
import { cellsFor } from './pieces';

export type ClearResult = {
  readonly board: Board;
  readonly rows: readonly number[];
  readonly markers: readonly ItemType[];
};

export type DeleteRowResult = {
  readonly board: Board;
  readonly deleted: boolean;
  readonly markers: readonly ItemType[];
};

export type GarbageResult = {
  readonly board: Board;
  readonly landedY: number | null;
  readonly topOut: boolean;
};

export type RaiseGarbageRowResult =
  | { readonly board: Board; readonly status: 'raised' }
  | { readonly board: Board; readonly status: 'top-out' | 'invalid-hole' };

function indexFor(x: number, y: number): number {
  return y * BOARD_WIDTH + x;
}

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_ROWS;
}

function emptyRow(): (Cell | null)[] {
  return Array<Cell | null>(BOARD_WIDTH).fill(null);
}

function markersIn(cells: readonly (Cell | null)[]): ItemType[] {
  const markers: ItemType[] = [];
  for (const cell of cells) {
    if (cell?.marker !== undefined) markers.push(cell.marker);
  }
  return markers;
}

export function emptyBoard(): Board {
  return { cells: Array<Cell | null>(BOARD_WIDTH * BOARD_ROWS).fill(null) };
}

export function canPlace(board: Board, piece: ActivePiece): boolean {
  return cellsFor(piece).every(({ x, y }) => isInBounds(x, y) && board.cells[indexFor(x, y)] === null);
}

export function lockPiece(board: Board, piece: ActivePiece): Board {
  if (!canPlace(board, piece)) throw new RangeError('cannot lock a piece outside or overlapping the board');

  const cells = [...board.cells];
  for (const { x, y, kind, marker } of cellsFor(piece)) {
    cells[indexFor(x, y)] = marker === undefined ? { kind } : { kind, marker };
  }
  return { cells };
}

export function clearFullRows(board: Board): ClearResult {
  const rows: number[] = [];
  const retainedRows: (Cell | null)[][] = [];
  const markers: ItemType[] = [];

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    const row = board.cells.slice(y * BOARD_WIDTH, (y + 1) * BOARD_WIDTH);
    if (row.every((cell) => cell !== null)) {
      rows.push(y);
      markers.push(...markersIn(row));
    } else {
      retainedRows.push(row);
    }
  }

  if (rows.length === 0) return { board, rows, markers };
  return {
    board: { cells: [...Array.from({ length: rows.length }, emptyRow).flat(), ...retainedRows.flat()] },
    rows,
    markers,
  };
}

export function deleteVisibleRow(board: Board, row: number): DeleteRowResult {
  if (!Number.isInteger(row) || row < 0 || row >= VISIBLE_ROWS) {
    return { board, deleted: false, markers: [] };
  }

  const storedRow = row + HIDDEN_ROWS;
  const start = storedRow * BOARD_WIDTH;
  const removedRow = board.cells.slice(start, start + BOARD_WIDTH);
  if (removedRow.every((cell) => cell === null)) return { board, deleted: false, markers: [] };

  return {
    board: { cells: [...emptyRow(), ...board.cells.slice(0, start), ...board.cells.slice(start + BOARD_WIDTH)] },
    deleted: true,
    markers: markersIn(removedRow),
  };
}

export function dropGarbageCell(board: Board, x: number): GarbageResult {
  if (!Number.isInteger(x) || x < 0 || x >= BOARD_WIDTH) throw new RangeError('garbage column is outside the board');

  let topmostOccupiedY: number | null = null;
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    if (board.cells[indexFor(x, y)] !== null) {
      topmostOccupiedY = y;
      break;
    }
  }

  const landingY = topmostOccupiedY === null ? BOARD_ROWS - 1 : topmostOccupiedY - 1;
  if (landingY < 0) return { board, landedY: null, topOut: true };

  const cells = [...board.cells];
  cells[indexFor(x, landingY)] = { kind: 'O', garbage: true };
  return { board: { cells }, landedY: landingY, topOut: false };
}

export function raiseGarbageRow(board: Board, holeColumn: number): RaiseGarbageRowResult {
  if (!Number.isInteger(holeColumn) || holeColumn < 0 || holeColumn >= BOARD_WIDTH) {
    return { board, status: 'invalid-hole' };
  }
  if (board.cells.slice(0, BOARD_WIDTH).some((cell) => cell !== null)) {
    return { board, status: 'top-out' };
  }

  const garbageRow = Array.from({ length: BOARD_WIDTH }, (_, x): Cell | null => (
    x === holeColumn ? null : { kind: 'O', garbage: true }
  ));
  return {
    board: { cells: [...board.cells.slice(BOARD_WIDTH), ...garbageRow] },
    status: 'raised',
  };
}

export function occupiedCells(board: Board): readonly PositionedCell[] {
  const occupied: PositionedCell[] = [];
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board.cells[indexFor(x, y)];
      if (cell !== null && cell !== undefined) occupied.push({ x, y, ...cell });
    }
  }
  return occupied;
}
