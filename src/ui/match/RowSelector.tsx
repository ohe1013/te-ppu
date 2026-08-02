import {
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  BOARD_WIDTH,
  VISIBLE_ROWS,
  type Cell,
  type GameCommand,
} from '../../core/index';
import { rowAtPointer } from './row-selection';
import './items.css';

export interface RowSelectorProps {
  readonly board: readonly (Cell | null)[];
  readonly dispatch: (command: GameCommand) => void;
  /** The parent must clear controlled selected-row state when this closes. */
  readonly onClose: () => void;
  readonly onSelectedRowChange?: (row: number | null) => void;
}

function rowHasFixedCell(
  board: readonly (Cell | null)[],
  row: number,
): boolean {
  const start = row * BOARD_WIDTH;
  return board.slice(start, start + BOARD_WIDTH).some((cell) => cell !== null);
}

function rowFromPointer(
  clientX: number,
  clientY: number,
  boardRect: DOMRect,
): number | null {
  if (
    !Number.isFinite(clientX)
    || clientX < boardRect.left
    || clientX >= boardRect.right
  ) {
    return null;
  }
  return rowAtPointer(clientY, boardRect);
}

export function RowSelector({
  board,
  dispatch,
  onClose,
  onSelectedRowChange,
}: RowSelectorProps) {
  const pointerIdRef = useRef<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const statusId = useId();

  const selectRow = useCallback((row: number | null) => {
    setConfirmationMessage(null);
    setSelectedRow(row);
    onSelectedRowChange?.(row);
  }, [onSelectedRowChange]);

  const rowForEvent = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    return rowFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
  }, []);

  const releaseCapture = useCallback((control: HTMLButtonElement, pointerId: number) => {
    pointerIdRef.current = null;
    if (control.hasPointerCapture(pointerId)) {
      control.releasePointerCapture(pointerId);
    }
  }, []);

  const confirmRow = useCallback((row: number | null) => {
    if (row === null) {
      setConfirmationMessage('위아래 화살표로 제거할 행을 먼저 선택하세요.');
      return;
    }
    if (!rowHasFixedCell(board, row)) {
      setConfirmationMessage(`${row + 1}번째 행은 빈 행이라 제거할 수 없습니다.`);
      return;
    }
    dispatch({ type: 'use-row-clear', row });
    selectRow(null);
    onClose();
  }, [board, dispatch, onClose, selectRow]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    selectRow(rowForEvent(event));
  }, [rowForEvent, selectRow]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    selectRow(rowForEvent(event));
  }, [rowForEvent, selectRow]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const row = rowForEvent(event);
    selectRow(row);
    releaseCapture(event.currentTarget, event.pointerId);

    if (row === null) {
      onClose();
      return;
    }
    confirmRow(row);
  }, [confirmRow, onClose, releaseCapture, rowForEvent, selectRow]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    selectRow(null);
    releaseCapture(event.currentTarget, event.pointerId);
    onClose();
  }, [onClose, releaseCapture, selectRow]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    let nextRow: number | null = null;
    switch (event.key) {
      case 'ArrowUp':
        nextRow = selectedRow === null ? 0 : Math.max(0, selectedRow - 1);
        break;
      case 'ArrowDown':
        nextRow = selectedRow === null
          ? 0
          : Math.min(VISIBLE_ROWS - 1, selectedRow + 1);
        break;
      case 'Home':
        nextRow = 0;
        break;
      case 'End':
        nextRow = VISIBLE_ROWS - 1;
        break;
      case 'Escape': {
        event.preventDefault();
        const pointerId = pointerIdRef.current;
        if (pointerId !== null) releaseCapture(event.currentTarget, pointerId);
        selectRow(null);
        onClose();
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    selectRow(nextRow);
  }, [onClose, releaseCapture, selectRow, selectedRow]);

  const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    event.preventDefault();
    confirmRow(selectedRow);
  }, [confirmRow, selectedRow]);

  const highlightStyle: CSSProperties | undefined = selectedRow === null
    ? undefined
    : {
        height: '5%',
        top: `${selectedRow * 5}%`,
      };

  const selectionStatus = confirmationMessage
    ?? (selectedRow === null
      ? '선택된 행 없음. 위아래 화살표로 행을 선택하세요.'
      : `${selectedRow + 1}번째 행 선택. ${
          rowHasFixedCell(board, selectedRow) ? '제거 가능' : '빈 행'
        }.`);

  return (
    <button
      aria-describedby={statusId}
      aria-keyshortcuts="ArrowUp ArrowDown Home End Enter Space Escape"
      aria-label="행 제거 대상 선택"
      className="row-selector"
      data-selected-row={selectedRow ?? undefined}
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {selectedRow !== null && (
        <span
          aria-hidden="true"
          className="row-selector__highlight"
          style={highlightStyle}
        />
      )}
      <span
        aria-atomic="true"
        aria-live="polite"
        className="item-controls__sr-only"
        id={statusId}
        role="status"
      >
        {selectionStatus}
      </span>
    </button>
  );
}
