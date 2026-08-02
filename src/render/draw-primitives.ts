import type { Graphics } from 'pixi.js';
import {
  cellsFor,
  type ItemType,
  type PieceKind,
  type PublicActivePiece,
  type PublicSideView,
  type SideId,
} from '../core/index';
import type { AnimationEffect } from './event-animation-queue';

const BOARD_COLUMNS = 10;
const BOARD_ROWS = 20;

export type BoardPrimitiveRole =
  | 'board-background'
  | 'grid-cell'
  | 'fixed-cell'
  | 'ghost-cell'
  | 'active-cell'
  | 'item-marker'
  | 'selected-row'
  | 'incoming'
  | 'freeze'
  | 'line-clear'
  | 'garbage-drop'
  | 'attack'
  | 'item-pulse'
  | 'top-out';

export interface BoardPrimitive {
  readonly role: BoardPrimitiveRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind?: PieceKind;
  readonly marker?: ItemType;
}

export interface CreateBoardPrimitivesInput {
  readonly effects: readonly AnimationEffect[];
  readonly model: PublicSideView;
  readonly selectedRow: number | null;
  readonly side: SideId;
}

function isVisibleCell(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_COLUMNS && y >= 0 && y < BOARD_ROWS;
}

function publicPieceCells(piece: PublicActivePiece, y: number) {
  return cellsFor({
    rotation: piece.rotation,
    token: { ...piece.token, serial: 0 },
    x: piece.x,
    y,
  });
}

function markerPrimitive(
  x: number,
  y: number,
  marker: ItemType,
): BoardPrimitive {
  return {
    height: 0.5,
    marker,
    role: 'item-marker',
    width: 0.5,
    x: x + 0.25,
    y: y + 0.25,
  };
}

function stableColumn(id: string): number {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % BOARD_COLUMNS;
}

export function createBoardPrimitives({
  effects,
  model,
  selectedRow,
  side,
}: CreateBoardPrimitivesInput): readonly BoardPrimitive[] {
  const primitives: BoardPrimitive[] = [{
    height: BOARD_ROWS,
    role: 'board-background',
    width: BOARD_COLUMNS,
    x: 0,
    y: 0,
  }];

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      primitives.push({ height: 1, role: 'grid-cell', width: 1, x, y });
      const cell = model.board[y * BOARD_COLUMNS + x];
      if (cell === null || cell === undefined) continue;
      primitives.push({
        height: 1,
        kind: cell.kind,
        role: 'fixed-cell',
        width: 1,
        x,
        y,
      });
      if (cell.marker !== undefined) {
        primitives.push(markerPrimitive(x, y, cell.marker));
      }
    }
  }

  if (selectedRow !== null && Number.isInteger(selectedRow)
    && selectedRow >= 0 && selectedRow < BOARD_ROWS) {
    primitives.push({
      height: 1,
      role: 'selected-row',
      width: BOARD_COLUMNS,
      x: 0,
      y: selectedRow,
    });
  }

  if (model.active !== null && model.ghostY !== null) {
    for (const cell of publicPieceCells(model.active, model.ghostY)) {
      if (!isVisibleCell(cell.x, cell.y)) continue;
      primitives.push({
        height: 1,
        kind: cell.kind,
        role: 'ghost-cell',
        width: 1,
        x: cell.x,
        y: cell.y,
      });
    }
  }

  if (model.active !== null) {
    for (const cell of publicPieceCells(model.active, model.active.y)) {
      if (!isVisibleCell(cell.x, cell.y)) continue;
      primitives.push({
        height: 1,
        kind: cell.kind,
        role: 'active-cell',
        width: 1,
        x: cell.x,
        y: cell.y,
      });
      if (cell.marker !== undefined) {
        primitives.push(markerPrimitive(cell.x, cell.y, cell.marker));
      }
    }
  }

  if (model.incoming > 0) {
    const height = Math.min(BOARD_ROWS, Math.max(1, model.incoming));
    primitives.push({
      height,
      role: 'incoming',
      width: 0.35,
      x: BOARD_COLUMNS - 0.35,
      y: BOARD_ROWS - height,
    });
  }

  if (model.freezeTicks > 0) {
    primitives.push({
      height: BOARD_ROWS,
      role: 'freeze',
      width: BOARD_COLUMNS,
      x: 0,
      y: 0,
    });
  }

  if (model.topOut) {
    primitives.push({
      height: BOARD_ROWS,
      role: 'top-out',
      width: BOARD_COLUMNS,
      x: 0,
      y: 0,
    });
  }

  for (const effect of effects) {
    if (effect.event.side !== side) continue;
    const amount = Math.max(1, Math.min(BOARD_ROWS, effect.event.amount ?? 1));
    if (effect.event.type === 'lines-cleared') {
      primitives.push({
        height: amount,
        role: 'line-clear',
        width: BOARD_COLUMNS,
        x: 0,
        y: BOARD_ROWS - amount,
      });
    } else if (effect.event.type === 'garbage-landed') {
      primitives.push({
        height: 1,
        role: 'garbage-drop',
        width: 1,
        x: stableColumn(effect.id),
        y: 0,
      });
    } else if (effect.event.type === 'attack-sent') {
      primitives.push({
        height: 0.35,
        role: 'attack',
        width: BOARD_COLUMNS,
        x: 0,
        y: 0,
      });
    } else if (
      effect.event.type === 'item-acquired'
      || effect.event.type === 'item-used'
    ) {
      primitives.push({
        height: BOARD_ROWS,
        marker: effect.event.item,
        role: 'item-pulse',
        width: BOARD_COLUMNS,
        x: 0,
        y: 0,
      });
    }
  }

  return primitives;
}

const PIECE_COLORS: Readonly<Record<PieceKind, number>> = {
  I: 0x43d9ff,
  J: 0x5474ff,
  L: 0xffa13d,
  O: 0xffdc4a,
  S: 0x62d96b,
  T: 0xb86cff,
  Z: 0xff5d73,
};

const ITEM_COLORS: Readonly<Record<ItemType, number>> = {
  freeze: 0x8ee8ff,
  'queue-swap': 0xf19cff,
  'row-clear': 0xffffff,
};

export function drawBoardPrimitives(
  graphics: Graphics,
  primitives: readonly BoardPrimitive[],
  width: number,
  height: number,
): void {
  const cellWidth = width / BOARD_COLUMNS;
  const cellHeight = height / BOARD_ROWS;
  const inset = Math.max(0.5, Math.min(cellWidth, cellHeight) * 0.06);
  graphics.clear();

  for (const primitive of primitives) {
    const x = primitive.x * cellWidth;
    const y = primitive.y * cellHeight;
    const primitiveWidth = primitive.width * cellWidth;
    const primitiveHeight = primitive.height * cellHeight;

    switch (primitive.role) {
      case 'board-background':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ color: 0x15172b });
        break;
      case 'grid-cell':
        graphics
          .rect(x, y, primitiveWidth, primitiveHeight)
          .stroke({ alpha: 0.34, color: 0x4b5277, width: 0.6 });
        break;
      case 'fixed-cell':
      case 'active-cell':
        graphics
          .roundRect(
            x + inset,
            y + inset,
            primitiveWidth - inset * 2,
            primitiveHeight - inset * 2,
            Math.max(1, inset * 1.6),
          )
          .fill({ color: PIECE_COLORS[primitive.kind ?? 'O'] })
          .stroke({ alpha: 0.5, color: 0xffffff, width: 0.8 });
        break;
      case 'ghost-cell':
        graphics
          .roundRect(
            x + inset * 1.5,
            y + inset * 1.5,
            primitiveWidth - inset * 3,
            primitiveHeight - inset * 3,
            Math.max(1, inset),
          )
          .stroke({ alpha: 0.62, color: PIECE_COLORS[primitive.kind ?? 'O'], width: 1.2 });
        break;
      case 'item-marker':
        graphics
          .circle(
            x + primitiveWidth / 2,
            y + primitiveHeight / 2,
            Math.min(primitiveWidth, primitiveHeight) / 2,
          )
          .fill({ color: ITEM_COLORS[primitive.marker ?? 'row-clear'] })
          .stroke({ color: 0x35275d, width: 0.8 });
        break;
      case 'selected-row':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.22, color: 0xffffff });
        break;
      case 'incoming':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.88, color: 0xff4d6d });
        break;
      case 'freeze':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.18, color: 0x8ee8ff });
        graphics.rect(x, y, primitiveWidth, primitiveHeight).stroke({ color: 0x8ee8ff, width: 2 });
        break;
      case 'line-clear':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.82, color: 0xffffff });
        break;
      case 'garbage-drop':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.86, color: 0x9ba4c7 });
        break;
      case 'attack':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.9, color: 0xff9f43 });
        break;
      case 'item-pulse':
        graphics
          .rect(x, y, primitiveWidth, primitiveHeight)
          .stroke({ alpha: 0.8, color: ITEM_COLORS[primitive.marker ?? 'row-clear'], width: 2.5 });
        break;
      case 'top-out':
        graphics.rect(x, y, primitiveWidth, primitiveHeight).fill({ alpha: 0.45, color: 0x2c1022 });
        graphics.rect(x, y, primitiveWidth, primitiveHeight).stroke({ color: 0xff4d6d, width: 3 });
        break;
    }
  }
}
