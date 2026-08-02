// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_WIDTH,
  VISIBLE_ROWS,
  type Cell,
  type GameCommand,
  type PublicSideView,
} from '../../core/index';
import { ItemControls } from './ItemControls';
import { RowSelector } from './RowSelector';

afterEach(cleanup);

const EMPTY_BOARD: readonly (Cell | null)[] = Array<Cell | null>(
  BOARD_WIDTH * VISIBLE_ROWS,
).fill(null);

function playerView(
  overrides: Partial<PublicSideView> = {},
): PublicSideView {
  return {
    board: EMPTY_BOARD,
    active: null,
    ghostY: null,
    next: [
      { kind: 'I', marker: null },
      { kind: 'O', marker: null },
    ],
    combo: 0,
    incoming: 0,
    inventory: { rowClear: 2, freeze: 2, queueSwap: 3 },
    freezeTicks: 0,
    phase: 'active',
    topOut: false,
    ...overrides,
  };
}

describe('ItemControls', () => {
  it('enters and explicitly cancels row selection without dispatching or consuming', () => {
    const dispatch = vi.fn<(command: GameCommand) => void>();
    const onRowSelectionChange = vi.fn<(active: boolean) => void>();
    const player = playerView();
    const view = render(
      <ItemControls
        dispatch={dispatch}
        onRowSelectionChange={onRowSelectionChange}
        player={player}
        rowSelectionActive={false}
      />,
    );

    const rowClear = screen.getByRole('button', { name: /행 제거/ });
    expect(rowClear).toHaveTextContent('2회');
    fireEvent.click(rowClear);

    expect(onRowSelectionChange).toHaveBeenCalledWith(true);
    expect(dispatch).not.toHaveBeenCalled();
    expect(rowClear).toHaveTextContent('2회');

    view.rerender(
      <ItemControls
        dispatch={dispatch}
        onRowSelectionChange={onRowSelectionChange}
        player={player}
        rowSelectionActive
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /취소/ }));

    expect(onRowSelectionChange).toHaveBeenLastCalledWith(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches freeze and queue swap immediately but changes counts only from a new view', () => {
    const dispatch = vi.fn<(command: GameCommand) => void>();
    const props = {
      dispatch,
      onRowSelectionChange: vi.fn<(active: boolean) => void>(),
      rowSelectionActive: false,
    };
    const view = render(<ItemControls {...props} player={playerView()} />);

    const freeze = screen.getByRole('button', { name: /상대 정지/ });
    const queueSwap = screen.getByRole('button', { name: /다음 교환/ });
    fireEvent.click(freeze);
    fireEvent.click(queueSwap);

    expect(dispatch.mock.calls.map(([command]) => command)).toEqual([
      { type: 'use-freeze' },
      { type: 'use-queue-swap' },
    ]);
    expect(freeze).toHaveTextContent('2회');
    expect(queueSwap).toHaveTextContent('3회');

    view.rerender(
      <ItemControls
        {...props}
        player={playerView({
          inventory: { rowClear: 2, freeze: 1, queueSwap: 2 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /상대 정지/ })).toHaveTextContent('1회');
    expect(screen.getByRole('button', { name: /다음 교환/ })).toHaveTextContent('2회');
  });

  it('gates every item by active phase and its corresponding inventory', () => {
    const props = {
      dispatch: vi.fn<(command: GameCommand) => void>(),
      onRowSelectionChange: vi.fn<(active: boolean) => void>(),
      rowSelectionActive: false,
    };
    const view = render(
      <ItemControls {...props} player={playerView({ phase: 'lock' })} />,
    );

    expect(screen.getByRole('button', { name: /행 제거/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /상대 정지/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /다음 교환/ })).toBeDisabled();

    view.rerender(
      <ItemControls
        {...props}
        player={playerView({
          inventory: { rowClear: 0, freeze: 1, queueSwap: 0 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /행 제거/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /상대 정지/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /다음 교환/ })).toBeDisabled();
  });
});

const SELECTOR_RECT: DOMRect = {
  bottom: 420,
  height: 320,
  left: 20,
  right: 180,
  top: 100,
  width: 160,
  x: 20,
  y: 100,
  toJSON: () => ({}),
};

function boardWithFixedCell(row: number): readonly (Cell | null)[] {
  const board = [...EMPTY_BOARD];
  board[row * BOARD_WIDTH + 3] = { kind: 'T' };
  return board;
}

function setupSelector(board = boardWithFixedCell(5)) {
  const dispatch = vi.fn<(command: GameCommand) => void>();
  const onClose = vi.fn<() => void>();
  const onSelectedRowChange = vi.fn<(row: number | null) => void>();
  render(
    <RowSelector
      board={board}
      dispatch={dispatch}
      onClose={onClose}
      onSelectedRowChange={onSelectedRowChange}
    />,
  );
  const selector = screen.getByRole('group', { name: '행 제거 대상 선택' });
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.defineProperties(selector, {
    getBoundingClientRect: { configurable: true, value: () => SELECTOR_RECT },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
    setPointerCapture: { configurable: true, value: setPointerCapture },
  });
  return {
    dispatch,
    onClose,
    onSelectedRowChange,
    releasePointerCapture,
    selector,
    setPointerCapture,
  };
}

function pointerDown(selector: HTMLElement, row: number, pointerId = 7) {
  fireEvent.pointerDown(selector, {
    button: 0,
    clientX: 80,
    clientY: SELECTOR_RECT.top + (row + 0.5) * (SELECTOR_RECT.height / VISIBLE_ROWS),
    pointerId,
  });
}

describe('RowSelector', () => {
  it('dispatches one row-clear command for a valid visible row and closes', () => {
    const {
      dispatch,
      onClose,
      onSelectedRowChange,
      releasePointerCapture,
      selector,
      setPointerCapture,
    } = setupSelector();
    pointerDown(selector, 5);
    fireEvent.pointerUp(selector, {
      clientX: 80,
      clientY: 188,
      pointerId: 7,
    });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'use-row-clear', row: 5 });
    expect(onSelectedRowChange).toHaveBeenLastCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps selection active after a blank-row release and can confirm a later row', () => {
    const { dispatch, onClose, onSelectedRowChange, selector } = setupSelector();
    pointerDown(selector, 3);
    fireEvent.pointerMove(selector, {
      clientX: 80,
      clientY: 172,
      pointerId: 7,
    });
    expect(onSelectedRowChange).toHaveBeenLastCalledWith(4);
    fireEvent.pointerUp(selector, {
      clientX: 80,
      clientY: 172,
      pointerId: 7,
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    pointerDown(selector, 5, 8);
    fireEvent.pointerUp(selector, {
      clientX: 80,
      clientY: 188,
      pointerId: 8,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'use-row-clear', row: 5 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['below', 80, SELECTOR_RECT.bottom],
    ['beside', SELECTOR_RECT.right, 188],
  ] as const)('cancels without dispatching when released %s the board', (
    _direction,
    clientX,
    clientY,
  ) => {
    const { dispatch, onClose, onSelectedRowChange, selector } = setupSelector();
    pointerDown(selector, 5);
    fireEvent.pointerMove(selector, {
      clientX,
      clientY,
      pointerId: 7,
    });
    fireEvent.pointerUp(selector, {
      clientX,
      clientY,
      pointerId: 7,
    });

    expect(onSelectedRowChange).toHaveBeenLastCalledWith(null);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
