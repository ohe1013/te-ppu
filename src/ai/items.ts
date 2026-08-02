import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  canPlace,
  cellsFor,
  ghostY,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type GameCommand,
} from '../core/index';
import { scoreCandidates } from './evaluate';
import type { AiFloorProfile, BoardView } from './types';

const VISIBLE_ROWS = 20;

function occupiedInRow(board: BoardView, row: number): number {
  return board
    .slice(row * BOARD_WIDTH, (row + 1) * BOARD_WIDTH)
    .filter((cell) => cell !== null).length;
}

function nonEmptyRows(board: BoardView): readonly number[] {
  return Array.from({ length: VISIBLE_ROWS }, (_, row) => row)
    .filter((row) => occupiedInRow(board, row) > 0);
}

function columnHeights(board: BoardView): readonly number[] {
  return Array.from({ length: BOARD_WIDTH }, (_, x) => {
    for (let row = 0; row < VISIBLE_ROWS; row += 1) {
      if (board[row * BOARD_WIDTH + x] !== null) return VISIBLE_ROWS - row;
    }
    return 0;
  });
}

function maxHeight(board: BoardView): number {
  return Math.max(...columnHeights(board));
}

function countHoles(board: BoardView): number {
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    let occupiedAbove = false;
    for (let row = 0; row < VISIBLE_ROWS; row += 1) {
      const occupied = board[row * BOARD_WIDTH + x] !== null;
      if (occupied) occupiedAbove = true;
      else if (occupiedAbove) holes += 1;
    }
  }
  return holes;
}

function deleteVisibleRow(board: BoardView, row: number): BoardView {
  return [
    ...Array<null>(BOARD_WIDTH).fill(null),
    ...board.slice(0, row * BOARD_WIDTH),
    ...board.slice((row + 1) * BOARD_WIDTH),
  ];
}

function floor2Row(board: BoardView, rows: readonly number[]): number {
  const holesBefore = countHoles(board);
  return [...rows].sort((left, right) => {
    const leftHolesRemoved = holesBefore - countHoles(deleteVisibleRow(board, left));
    const rightHolesRemoved = holesBefore - countHoles(deleteVisibleRow(board, right));
    const leftRank = leftHolesRemoved * 2 + occupiedInRow(board, left);
    const rightRank = rightHolesRemoved * 2 + occupiedInRow(board, right);
    return rightRank - leftRank || right - left;
  })[0]!;
}

export function projectRowClearObservation(
  view: AiObservation,
  row: number,
): AiObservation {
  if (
    !Number.isInteger(row)
    || row < 0
    || row >= VISIBLE_ROWS
    || occupiedInRow(view.self.board, row) === 0
  ) return view;

  const board = deleteVisibleRow(view.self.board, row);
  const active = view.self.active;
  let projectedActive: ActivePiece | null = null;
  let projectedGhost: number | null = null;
  let phase = view.self.phase;
  let topOut = view.self.topOut;
  if (active !== null) {
    const internalBoard: Board = {
      cells: [
        ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
        ...board,
      ],
    };
    const internalActive: ActivePiece = {
      token: { serial: 0, ...active.token },
      x: active.x,
      y: active.y + HIDDEN_ROWS,
      rotation: active.rotation,
    };
    projectedActive = internalActive;
    if (!canPlace(internalBoard, projectedActive)) {
      const maximumLift = Math.min(...cellsFor(internalActive).map(({ y }) => y));
      projectedActive = null;
      for (let lift = 1; lift <= maximumLift; lift += 1) {
        const candidate = { ...internalActive, y: internalActive.y - lift };
        if (canPlace(internalBoard, candidate)) {
          projectedActive = candidate;
          break;
        }
      }
    }
    if (projectedActive === null) {
      phase = 'top-out';
      topOut = true;
    } else {
      projectedGhost = ghostY(internalBoard, projectedActive) - HIDDEN_ROWS;
    }
  }
  return {
    ...view,
    self: {
      ...view.self,
      board,
      active: projectedActive === null
        ? null
        : {
            token: { ...active!.token },
            x: projectedActive.x,
            y: projectedActive.y - HIDDEN_ROWS,
            rotation: projectedActive.rotation,
          },
      ghostY: projectedGhost,
      incoming: Math.max(0, view.self.incoming - 1),
      phase,
      topOut,
    },
  };
}

function bestVisibleScore(view: AiObservation, profile: AiFloorProfile): number {
  return scoreCandidates(view, profile)[0]?.score ?? Number.NEGATIVE_INFINITY;
}

export function shouldUseTacticalRowClear(
  currentScore: number,
  deletedScore: number,
  incoming: number,
): boolean {
  if (incoming > 0) return true;
  if (currentScore === Number.NEGATIVE_INFINITY && Number.isFinite(deletedScore)) return true;
  return Number.isFinite(currentScore)
    && Number.isFinite(deletedScore)
    && deletedScore - currentScore >= 4;
}

function tacticalRow(
  view: AiObservation,
  profile: AiFloorProfile,
  rows: readonly number[],
): number | null {
  const currentScore = bestVisibleScore(view, profile);
  const ranked = rows
    .map((row) => ({
      row,
      score: bestVisibleScore(projectRowClearObservation(view, row), profile),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score > right.score ? -1 : 1;
      return right.row - left.row;
    });
  const best = ranked[0];
  return best !== undefined
    && shouldUseTacticalRowClear(currentScore, best.score, view.self.incoming)
    ? best.row
    : null;
}

function rowClearCommand(
  view: AiObservation,
  profile: AiFloorProfile,
): GameCommand | null {
  if (view.self.inventory.rowClear <= 0) return null;
  const rows = nonEmptyRows(view.self.board);
  if (rows.length === 0) return null;

  if (profile.itemPolicy === 'FIRST_VALID') {
    return { type: 'use-row-clear', row: rows.at(-1)! };
  }
  if (profile.itemPolicy === 'RISK_AWARE') {
    if (
      maxHeight(view.self.board) < 14
      && countHoles(view.self.board) < 6
      && view.self.incoming < 6
    ) return null;
    return { type: 'use-row-clear', row: floor2Row(view.self.board, rows) };
  }
  const row = tacticalRow(view, profile, rows);
  return row === null ? null : { type: 'use-row-clear', row };
}

function freezeCommand(
  view: AiObservation,
  profile: AiFloorProfile,
): GameCommand | null {
  if (view.self.inventory.freeze <= 0) return null;
  if (profile.itemPolicy === 'FIRST_VALID') return { type: 'use-freeze' };
  if (profile.itemPolicy === 'RISK_AWARE') {
    return maxHeight(view.opponent.board) >= 14 || view.opponent.combo >= 2
      ? { type: 'use-freeze' }
      : null;
  }
  return view.self.combo >= 2 || maxHeight(view.opponent.board) >= 13
    ? { type: 'use-freeze' }
    : null;
}

function queueSwapCommand(
  view: AiObservation,
  profile: AiFloorProfile,
): GameCommand | null {
  if (view.self.inventory.queueSwap <= 0) return null;
  if (profile.itemPolicy === 'FIRST_VALID') return { type: 'use-queue-swap' };

  const currentScore = bestVisibleScore(view, profile);
  const swapped: AiObservation = {
    ...view,
    self: {
      ...view.self,
      next: [view.self.next[1], view.self.next[0]],
    },
  };
  const swappedScore = bestVisibleScore(swapped, profile);
  return shouldUseQueueSwap(profile, currentScore, swappedScore)
    ? { type: 'use-queue-swap' }
    : null;
}

export function shouldUseQueueSwap(
  profile: AiFloorProfile,
  currentScore: number,
  swappedScore: number,
): boolean {
  if (profile.itemPolicy === 'FIRST_VALID') return true;
  if (
    profile.itemPolicy === 'TACTICAL'
    && currentScore === Number.NEGATIVE_INFINITY
    && Number.isFinite(swappedScore)
  ) return true;
  if (!Number.isFinite(currentScore) || !Number.isFinite(swappedScore)) return false;
  const threshold = profile.itemPolicy === 'RISK_AWARE' ? 3 : 2.5;
  return swappedScore - currentScore >= threshold;
}

export function planItemCommands(
  view: AiObservation,
  profile: AiFloorProfile,
): readonly GameCommand[] {
  if (
    view.status !== 'playing'
    || view.self.phase !== 'active'
    || view.self.freezeTicks > 0
  ) return [];

  const command = rowClearCommand(view, profile)
    ?? freezeCommand(view, profile)
    ?? queueSwapCommand(view, profile);
  return command === null ? [] : [command];
}
