import {
  BOARD_ROWS,
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type PieceKind,
  type PieceToken,
  type PositionedCell,
  type Rotation,
} from './model';
import { RandomStream, randomInt } from './random';

type Offset = readonly [x: number, y: number];
type MinoOffsets = readonly [Offset, Offset, Offset, Offset];
type PieceOrientations = readonly [MinoOffsets, MinoOffsets, MinoOffsets, MinoOffsets];
type RotationTransition = '0>1' | '1>2' | '2>3' | '3>0';

const PIECE_KINDS: readonly PieceKind[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const SPAWN_OFFSETS: Readonly<Record<PieceKind, MinoOffsets>> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

function rotateOffsets(offsets: MinoOffsets, pivotX: number, pivotY: number): MinoOffsets {
  return offsets.map(([x, y]) => [pivotX - (y - pivotY), pivotY + (x - pivotX)]) as unknown as MinoOffsets;
}

function orientationsFor(kind: PieceKind): PieceOrientations {
  const spawn = SPAWN_OFFSETS[kind];
  if (kind === 'O') return [spawn, spawn, spawn, spawn];

  const pivot = kind === 'I' ? 1.5 : 1;
  const one = rotateOffsets(spawn, pivot, pivot);
  const two = rotateOffsets(one, pivot, pivot);
  const three = rotateOffsets(two, pivot, pivot);
  return [spawn, one, two, three];
}

const PIECE_ORIENTATIONS: Readonly<Record<PieceKind, PieceOrientations>> = {
  I: orientationsFor('I'),
  J: orientationsFor('J'),
  L: orientationsFor('L'),
  O: orientationsFor('O'),
  S: orientationsFor('S'),
  T: orientationsFor('T'),
  Z: orientationsFor('Z'),
};

const JLSTZ_CW_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
} as const;

const I_CW_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
} as const;

const O_CW_KICKS = [[0, 0]] as const;

export function pieceKindAt(seed: number, serial: number): PieceKind {
  const bagIndex = Math.floor(serial / PIECE_KINDS.length);
  const position = serial % PIECE_KINDS.length;
  const bag = [...PIECE_KINDS];

  for (let i = bag.length - 1, lane = 0; i > 0; i -= 1, lane += 1) {
    const swapIndex = randomInt(seed, RandomStream.PIECE_BAG, bagIndex, i + 1, lane);
    [bag[i], bag[swapIndex]] = [bag[swapIndex]!, bag[i]!];
  }

  return bag[position]!;
}

export function spawnPiece(token: PieceToken): ActivePiece {
  return { token, x: 3, y: 2, rotation: 0 };
}

export function cellsFor(piece: ActivePiece): readonly PositionedCell[] {
  const offsets = PIECE_ORIENTATIONS[piece.token.kind][piece.rotation];
  return offsets.map(([offsetX, offsetY], minoIndex) => {
    const cell: PositionedCell = {
      x: piece.x + offsetX,
      y: piece.y + offsetY,
      kind: piece.token.kind,
    };
    if (piece.token.marker?.minoIndex !== minoIndex) return cell;
    return { ...cell, marker: piece.token.marker.item };
  });
}

function isCollisionFree(board: Board, piece: ActivePiece): boolean {
  return cellsFor(piece).every(({ x, y }) => {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_ROWS) return false;
    return board.cells[y * BOARD_WIDTH + x] === null;
  });
}

export function tryRotateClockwise(board: Board, piece: ActivePiece): ActivePiece {
  const rotation = ((piece.rotation + 1) % 4) as Rotation;
  const transition = `${piece.rotation}>${rotation}` as RotationTransition;
  const kicks = piece.token.kind === 'I'
    ? I_CW_KICKS[transition]
    : piece.token.kind === 'O'
      ? O_CW_KICKS
      : JLSTZ_CW_KICKS[transition];

  for (const [offsetX, offsetY] of kicks) {
    const candidate: ActivePiece = {
      ...piece,
      x: piece.x + offsetX,
      y: piece.y + offsetY,
      rotation,
    };
    if (isCollisionFree(board, candidate)) return candidate;
  }

  return piece;
}

export function ghostY(board: Board, piece: ActivePiece): number {
  let y = piece.y;
  while (isCollisionFree(board, { ...piece, y: y + 1 })) y += 1;
  return y;
}
