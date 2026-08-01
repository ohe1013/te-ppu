import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  type ActivePiece,
  type Board,
  type Cell,
  type PieceToken,
  type Rotation,
} from '../../src/core/model';
import {
  cellsFor,
  ghostY,
  pieceKindAt,
  spawnPiece,
  tryRotateClockwise,
} from '../../src/core/pieces';

function emptyBoard(): Board {
  return { cells: Array<Cell | null>(BOARD_WIDTH * BOARD_ROWS).fill(null) };
}

function boardWith(cells: readonly { x: number; y: number }[]): Board {
  const board = Array<Cell | null>(BOARD_WIDTH * BOARD_ROWS).fill(null);
  for (const { x, y } of cells) board[y * BOARD_WIDTH + x] = { kind: 'O' };
  return { cells: board };
}

function makeActive(token: PieceToken, x: number, y: number, rotation: Rotation): ActivePiece {
  return { token, x, y, rotation };
}

describe('seven-bag lookup', () => {
  it('emits every kind exactly once in each bag', () => {
    for (let bag = 0; bag < 4; bag += 1) {
      const kinds = Array.from({ length: 7 }, (_, i) => pieceKindAt(91, bag * 7 + i));
      expect(new Set(kinds).size).toBe(7);
    }
  });

  it('returns the same bag regardless of lookup order', () => {
    const serials = [13, 7, 12, 8, 11, 9, 10];
    const outOfOrder = serials.map((serial) => pieceKindAt(0x12345678, serial));
    const inOrder = Array.from({ length: 7 }, (_, i) => pieceKindAt(0x12345678, 7 + i));

    expect(outOfOrder).toEqual(serials.map((serial) => inOrder[serial - 7]));
  });
});

describe('piece geometry', () => {
  it('spawns a canonical T at origin (3,2)', () => {
    const piece = spawnPiece({ serial: 4, kind: 'T', marker: null });

    expect(piece).toEqual({
      token: { serial: 4, kind: 'T', marker: null },
      x: 3,
      y: 2,
      rotation: 0,
    });
    expect(cellsFor(piece)).toEqual([
      { x: 4, y: 2, kind: 'T' },
      { x: 3, y: 3, kind: 'T' },
      { x: 4, y: 3, kind: 'T' },
      { x: 5, y: 3, kind: 'T' },
    ]);
  });

  it('keeps an item marker attached to its ordered mino through rotation', () => {
    const token: PieceToken = {
      serial: 0,
      kind: 'L',
      marker: { item: 'queue-swap', minoIndex: 0 },
    };
    const rotated = tryRotateClockwise(emptyBoard(), spawnPiece(token));

    expect(cellsFor(rotated)).toEqual([
      { x: 5, y: 4, kind: 'L', marker: 'queue-swap' },
      { x: 4, y: 2, kind: 'L' },
      { x: 4, y: 3, kind: 'L' },
      { x: 4, y: 4, kind: 'L' },
    ]);
  });
});

describe('ghost projection', () => {
  it('lands at the board floor without mutating the active piece', () => {
    const piece = spawnPiece({ serial: 0, kind: 'T', marker: null });

    expect(ghostY(emptyBoard(), piece)).toBe(22);
    expect(piece.y).toBe(2);
  });

  it('stops immediately above occupied cells', () => {
    const piece = spawnPiece({ serial: 0, kind: 'T', marker: null });

    expect(ghostY(boardWith([{ x: 4, y: 20 }]), piece)).toBe(18);
  });
});

describe('clockwise SRS rotation', () => {
  it('uses the I 1>2 wall kick and keeps marker identity', () => {
    const piece = makeActive(
      { serial: 0, kind: 'I', marker: { item: 'freeze', minoIndex: 2 } },
      -2,
      4,
      1,
    );

    const rotated = tryRotateClockwise(emptyBoard(), piece);

    expect({ x: rotated.x, y: rotated.y, rotation: rotated.rotation }).toEqual({
      x: 0,
      y: 4,
      rotation: 2,
    });
    expect(cellsFor(rotated)[2]).toEqual(
      expect.objectContaining({ x: 1, y: 6, marker: 'freeze' }),
    );
  });

  it('uses the JLSTZ 1>2 left-wall kick', () => {
    const piece = makeActive({ serial: 0, kind: 'T', marker: null }, -1, 4, 1);

    const rotated = tryRotateClockwise(emptyBoard(), piece);

    expect({ x: rotated.x, y: rotated.y, rotation: rotated.rotation }).toEqual({
      x: 0,
      y: 4,
      rotation: 2,
    });
  });

  it('returns the original piece when every kick candidate is blocked', () => {
    const piece = makeActive({ serial: 0, kind: 'T', marker: null }, 3, 5, 0);
    const board = boardWith([
      { x: 4, y: 7 },
      { x: 3, y: 7 },
      { x: 3, y: 4 },
    ]);

    expect(tryRotateClockwise(board, piece)).toBe(piece);
  });

  it('changes O rotation state without changing its occupied cells', () => {
    const piece = spawnPiece({
      serial: 0,
      kind: 'O',
      marker: { item: 'row-clear', minoIndex: 3 },
    });

    const rotated = tryRotateClockwise(emptyBoard(), piece);

    expect(rotated.rotation).toBe(1);
    expect(cellsFor(rotated)).toEqual(cellsFor(piece));
  });
});
