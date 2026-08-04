import type { LoadedImageRef } from '../assets';
import type { ItemType, PieceKind } from '../core';
import type { BoardPrimitive } from './draw-primitives';

const BOARD_COLUMNS = 10;
const BOARD_ROWS = 20;

export type BoardSkin = {
  readonly blocks: Partial<Record<PieceKind, LoadedImageRef>>;
  readonly garbage?: LoadedImageRef;
  readonly items: Partial<Record<ItemType, LoadedImageRef>>;
};

export type TexturedBoardPrimitive = {
  readonly texture: LoadedImageRef;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type BoardPrimitivePartition = {
  readonly textured: readonly TexturedBoardPrimitive[];
  readonly fallback: readonly BoardPrimitive[];
};

function textureFor(primitive: BoardPrimitive, skin: BoardSkin): LoadedImageRef | undefined {
  if (primitive.marker !== undefined) return skin.items[primitive.marker];
  if (primitive.garbage === true) return skin.garbage;
  return primitive.kind === undefined ? undefined : skin.blocks[primitive.kind];
}

function isTexturableCell(primitive: BoardPrimitive): boolean {
  return primitive.role === 'fixed-cell' || primitive.role === 'active-cell';
}

function matchingMarker(cell: BoardPrimitive, marker: BoardPrimitive): boolean {
  return marker.role === 'item-marker'
    && cell.marker === marker.marker
    && marker.x === cell.x + 0.25
    && marker.y === cell.y + 0.25;
}

export function partitionBoardPrimitives(
  primitives: readonly BoardPrimitive[],
  skin: BoardSkin,
  width: number,
  height: number,
): BoardPrimitivePartition {
  const cellWidth = width / BOARD_COLUMNS;
  const cellHeight = height / BOARD_ROWS;
  const textured: TexturedBoardPrimitive[] = [];
  const resolvedItemMarkers = new Set<BoardPrimitive>();

  for (const primitive of primitives) {
    if (!isTexturableCell(primitive)) continue;
    const texture = textureFor(primitive, skin);
    if (texture === undefined) continue;
    textured.push({
      texture,
      x: primitive.x * cellWidth,
      y: primitive.y * cellHeight,
      width: primitive.width * cellWidth,
      height: primitive.height * cellHeight,
    });
    if (primitive.marker !== undefined) {
      for (const candidate of primitives) {
        if (matchingMarker(primitive, candidate)) resolvedItemMarkers.add(candidate);
      }
    }
  }

  return {
    textured,
    fallback: primitives.filter((primitive) => {
      if (resolvedItemMarkers.has(primitive)) return false;
      return !isTexturableCell(primitive) || textureFor(primitive, skin) === undefined;
    }),
  };
}
