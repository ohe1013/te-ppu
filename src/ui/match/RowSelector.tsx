import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  BOARD_WIDTH,
  type Cell,
  type GameCommand,
} from '../../core/index';
import { rowAtPointer } from './row-selection';
import './items.css';

export interface RowSelectorProps {
  readonly board: readonly (Cell | null)[];
  readonly dispatch: (command: GameCommand) => void;
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

  const selectRow = useCallback((row: number | null) => {
    setSelectedRow(row);
    onSelectedRowChange?.(row);
  }, [onSelectedRowChange]);

  const rowForEvent = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    return rowFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
  }, []);

  const releaseCapture = useCallback((control: HTMLDivElement, pointerId: number) => {
    pointerIdRef.current = null;
    if (control.hasPointerCapture(pointerId)) {
      control.releasePointerCapture(pointerId);
    }
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    selectRow(rowForEvent(event));
  }, [rowForEvent, selectRow]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    selectRow(rowForEvent(event));
  }, [rowForEvent, selectRow]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const row = rowForEvent(event);
    selectRow(row);
    releaseCapture(event.currentTarget, event.pointerId);

    if (row === null) {
      onClose();
      return;
    }
    if (!rowHasFixedCell(board, row)) return;
    dispatch({ type: 'use-row-clear', row });
    selectRow(null);
    onClose();
  }, [board, dispatch, onClose, releaseCapture, rowForEvent, selectRow]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    selectRow(null);
    releaseCapture(event.currentTarget, event.pointerId);
    onClose();
  }, [onClose, releaseCapture, selectRow]);

  const highlightStyle: CSSProperties | undefined = selectedRow === null
    ? undefined
    : {
        height: '5%',
        top: `${selectedRow * 5}%`,
      };

  return (
    <div
      aria-label="행 제거 대상 선택"
      className="row-selector"
      data-selected-row={selectedRow ?? undefined}
      role="group"
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
      <span className="item-controls__sr-only" aria-live="polite">
        {selectedRow === null ? '선택된 행 없음' : `${selectedRow + 1}번째 행 선택`}
      </span>
    </div>
  );
}
