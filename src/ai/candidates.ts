import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  canPlace,
  cellsFor,
  clearFullRows,
  ghostY,
  lockPiece,
  resolveNormalClear,
  tryRotateClockwise,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type GameCommand,
  type ItemType,
  type Rotation,
} from '../core/index';
import type { BoardView, CellPoint } from './types';

export interface PlacementCandidate {
  readonly rotation: Rotation;
  readonly column: number;
  readonly landingCells: readonly CellPoint[];
  readonly commands: readonly GameCommand[];
  readonly resultingBoard: BoardView;
  readonly clearedLines: number;
  readonly acquiredItems: readonly ItemType[];
  readonly attack: number;
  readonly topOut: boolean | 'unknown';
}

interface RotationRoute {
  readonly piece: ActivePiece;
  readonly commands: readonly GameCommand[];
}

function internalBoard(board: BoardView): Board {
  return {
    cells: [
      ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
      ...board,
    ],
  };
}

function internalActive(view: AiObservation): ActivePiece | null {
  const active = view.self.active;
  if (active === null) return null;
  return {
    token: { serial: 0, ...active.token },
    x: active.x,
    y: active.y + HIDDEN_ROWS,
    rotation: active.rotation,
  };
}

function sortedPoints(piece: ActivePiece): readonly CellPoint[] {
  return cellsFor(piece)
    .map(({ x, y }) => ({ x, y: y - HIDDEN_ROWS }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
}

function pointKey(points: readonly CellPoint[]): string {
  return points.map(({ x, y }) => `${x}:${y}`).join('|');
}

function orientationKey(piece: ActivePiece): string {
  const cells = cellsFor({ ...piece, x: 0, y: 0 });
  const minimumX = Math.min(...cells.map(({ x }) => x));
  const minimumY = Math.min(...cells.map(({ y }) => y));
  return cells
    .map(({ x, y }) => `${x - minimumX}:${y - minimumY}`)
    .sort()
    .join('|');
}

function uniqueRotationRoutes(board: Board, active: ActivePiece): readonly RotationRoute[] {
  const routes: RotationRoute[] = [];
  const seen = new Set<string>();
  let piece = active;
  const commands: GameCommand[] = [];

  for (let turn = 0; turn < 4; turn += 1) {
    const key = orientationKey(piece);
    if (!seen.has(key)) {
      seen.add(key);
      routes.push({ piece, commands: [...commands] });
    }

    const rotated = tryRotateClockwise(board, piece);
    if (rotated === piece) break;
    piece = rotated;
    commands.push({ type: 'rotate-clockwise' });
  }

  return routes;
}

function horizontalCommands(from: number, to: number): readonly GameCommand[] {
  const dx: -1 | 1 = to < from ? -1 : 1;
  return Array.from({ length: Math.abs(to - from) }, () => ({ type: 'move', dx } as const));
}

function replayPlacement(
  board: Board,
  active: ActivePiece,
  commands: readonly GameCommand[],
): ActivePiece | null {
  let current = active;
  for (const command of commands) {
    if (command.type === 'rotate-clockwise') {
      const rotated = tryRotateClockwise(board, current);
      if (rotated === current) return null;
      current = rotated;
      continue;
    }
    if (command.type === 'move') {
      const moved = { ...current, x: current.x + command.dx };
      if (!canPlace(board, moved)) return null;
      current = moved;
      continue;
    }
    if (command.type === 'hard-drop') {
      current = { ...current, y: ghostY(board, current) };
      continue;
    }
    return null;
  }
  return commands.at(-1)?.type === 'hard-drop' ? current : null;
}

function visibleBoard(board: Board): BoardView {
  return board.cells.slice(BOARD_WIDTH * HIDDEN_ROWS);
}

export function enumerateCandidates(view: AiObservation): readonly PlacementCandidate[] {
  const active = internalActive(view);
  if (active === null) return [];

  const board = internalBoard(view.self.board);
  if (!canPlace(board, active)) return [];

  const candidates: PlacementCandidate[] = [];
  const seenLandings = new Set<string>();

  for (const rotationRoute of uniqueRotationRoutes(board, active)) {
    const offsets = cellsFor({ ...rotationRoute.piece, x: 0, y: 0 });
    const minimumX = Math.min(...offsets.map(({ x }) => x));
    const maximumX = Math.max(...offsets.map(({ x }) => x));
    const firstColumn = -minimumX;
    const lastColumn = BOARD_WIDTH - 1 - maximumX;

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const intendedAtColumn = { ...rotationRoute.piece, x: column };
      if (!canPlace(board, intendedAtColumn)) continue;
      const unchangedRoute = rotationRoute.commands.length === 0
        && column === active.x
        && view.self.ghostY !== null;
      const intendedLanding = {
        ...intendedAtColumn,
        y: unchangedRoute
          ? view.self.ghostY! + HIDDEN_ROWS
          : ghostY(board, intendedAtColumn),
      };
      const commands: readonly GameCommand[] = [
        ...rotationRoute.commands,
        ...horizontalCommands(rotationRoute.piece.x, column),
        { type: 'hard-drop' },
      ];
      // The current route can trust core's observed ghost. Routes that rotate or move
      // remain visible-state optimistic; Task 3 must emit one command and validate the
      // next observation before continuing the stored route.
      const replayedLanding = unchangedRoute
        ? intendedLanding
        : replayPlacement(board, active, commands);
      if (replayedLanding === null) continue;

      const intendedCells = sortedPoints(intendedLanding);
      const landingCells = sortedPoints(replayedLanding);
      if (pointKey(intendedCells) !== pointKey(landingCells)) continue;

      const landingKey = pointKey(landingCells);
      if (seenLandings.has(landingKey)) continue;
      seenLandings.add(landingKey);

      const clear = clearFullRows(lockPiece(board, replayedLanding));
      const clearedLines = clear.rows.length;
      candidates.push({
        rotation: replayedLanding.rotation,
        column,
        landingCells,
        commands,
        resultingBoard: visibleBoard(clear.board),
        clearedLines,
        acquiredItems: clear.markers,
        attack: resolveNormalClear(view.self.combo, clearedLines).attack,
        topOut: 'unknown',
      });
    }
  }

  return candidates;
}
