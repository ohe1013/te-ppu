// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../../core/index';
import type { MatchLoopView } from '../../app/use-match-loop';
import type { MatchScreenProps } from './MatchScreen';
import { MatchScreen } from './MatchScreen';

const useMatchLoopMock = vi.hoisted(() => vi.fn());

const lifecycleProps: Pick<
  MatchScreenProps,
  | 'onRetrySettingsSave'
  | 'onSettingsChange'
  | 'platform'
  | 'settings'
  | 'settingsSaveFailed'
> = {
  onRetrySettingsSave: async () => true,
  onSettingsChange: async () => true,
  platform: {
    close: async () => undefined,
    getIdentity: async () => ({ kind: 'local', key: 'local-browser' }),
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    haptic: async () => undefined,
    kind: 'browser',
    lockPortrait: async () => undefined,
    subscribeSafeArea: () => () => undefined,
  },
  settings: { hapticsEnabled: true, soundEnabled: true },
  settingsSaveFailed: false,
};

vi.mock('../../app/use-match-loop', () => ({
  useMatchLoop: useMatchLoopMock,
}));

vi.mock('../../render/BattleCanvas', () => ({
  BattleCanvas: ({
    playerBoardOverlay,
    selectedRow,
  }: {
    readonly playerBoardOverlay?: ReactNode;
    readonly selectedRow: number | null;
  }) => (
    <div
      data-selected-row={selectedRow === null ? 'none' : selectedRow}
      data-testid="battle-canvas-proxy"
    >
      {playerBoardOverlay}
    </div>
  ),
}));

function activeLoop(): MatchLoopView {
  const view = createPublicMatchView(createMatch({
    countdownTicks: 0,
    matchSeed: 17,
  }));
  return {
    dispatch: vi.fn(),
    events: [],
    setPaused: vi.fn(),
    stop: vi.fn(),
    view: {
      ...view,
      sides: {
        ...view.sides,
        player: {
          ...view.sides.player,
          board: view.sides.player.board.map((cell, index) => (
            index === 19 * 10 ? { kind: 'I' as const } : cell
          )),
          inventory: { freeze: 1, queueSwap: 3, rowClear: 1 },
        },
      },
    },
  };
}

beforeEach(() => {
  const loop: MatchLoopView = {
    dispatch: vi.fn(),
    events: [],
    setPaused: vi.fn(),
    stop: vi.fn(),
    view: createPublicMatchView(createMatch({ matchSeed: 17 })),
  };
  useMatchLoopMock.mockReturnValue(loop);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MatchScreen', () => {
  it('composes two symmetric public HUDs around the single battle canvas', () => {
    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'PLAYER battle status' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'RIVAL battle status' }))
      .toBeInTheDocument();
    expect(screen.getAllByTestId('battle-canvas-proxy')).toHaveLength(1);
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-selected-row',
      'none',
    );
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });

  it('connects item actions, row highlighting, joystick, and rotation to the match loop', () => {
    const loop = activeLoop();
    useMatchLoopMock.mockReturnValue(loop);
    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '상대 정지 · 1회' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 교환 · 3회' }));
    fireEvent.click(screen.getByRole('button', { name: '행 제거 · 1회' }));

    const bottomRow = screen.getByRole('button', {
      name: '20번째 행, 제거 가능',
    });
    fireEvent.focus(bottomRow);
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-selected-row',
      '19',
    );
    fireEvent.click(bottomRow, { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: '시계 방향 회전' }), {
      detail: 0,
    });

    expect(loop.dispatch).toHaveBeenNthCalledWith(1, { type: 'use-freeze' });
    expect(loop.dispatch).toHaveBeenNthCalledWith(2, { type: 'use-queue-swap' });
    expect(loop.dispatch).toHaveBeenNthCalledWith(3, {
      row: 19,
      type: 'use-row-clear',
    });
    expect(loop.dispatch).toHaveBeenNthCalledWith(4, {
      type: 'rotate-clockwise',
    });
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-selected-row',
      'none',
    );
    expect(screen.getByRole('group', { name: '이동 조이스틱' })).toBeVisible();
  });

  it('resets held input and closes row selection when player controls become inactive', () => {
    const loop = activeLoop();
    useMatchLoopMock.mockReturnValue(loop);
    const result = render(
      <MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '행 제거 · 1회' }));
    expect(screen.getByRole('group', { name: '행 제거 대상 선택' })).toBeVisible();

    useMatchLoopMock.mockReturnValue({
      ...loop,
      view: {
        ...loop.view,
        sides: {
          ...loop.view.sides,
          player: { ...loop.view.sides.player, phase: 'lock' },
        },
      },
    });
    result.rerender(
      <MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />,
    );

    expect(screen.queryByRole('group', { name: '행 제거 대상 선택' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '게임 조작' })).toBeDisabled();
  });
});
