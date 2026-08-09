// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../../core/index';
import type { MatchLoopView } from '../../app/use-match-loop';
import type { AudioPort } from '../../platform/audio-port';
import type { MatchScreenProps } from './MatchScreen';
import { MatchScreen } from './MatchScreen';

const useMatchLoopMock = vi.hoisted(() => vi.fn());
const canvasPropsSpy = vi.hoisted(() => vi.fn());

const lifecycleProps: Pick<
  MatchScreenProps,
  | 'audioPort'
  | 'onRetrySettingsSave'
  | 'onSettingsChange'
  | 'platform'
  | 'settings'
  | 'settingsSaveFailed'
> = {
  audioPort: createAudioPort(),
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

function createAudioPort(): AudioPort {
  return {
    destroy: vi.fn(async () => undefined),
    play: vi.fn(),
    resume: vi.fn(async () => undefined),
    setEnabled: vi.fn(),
    setMusic: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
  };
}

vi.mock('../../app/use-match-loop', () => ({
  useMatchLoop: useMatchLoopMock,
}));

vi.mock('../../render/BattleCanvas', () => ({
  BattleCanvas: ({
    commandFeedback,
    eventBatches,
    playerBoardOverlay,
    selectedRow,
  }: {
    readonly commandFeedback: readonly { readonly tick: number }[];
    readonly eventBatches?: readonly { readonly tick: number }[];
    readonly playerBoardOverlay?: ReactNode;
    readonly selectedRow: number | null;
  }) => {
    canvasPropsSpy({ commandFeedback, eventBatches, playerBoardOverlay, selectedRow });
    return (
      <div
        data-event-batches={eventBatches?.map(({ tick }) => tick).join(',') ?? 'missing'}
        data-selected-row={selectedRow === null ? 'none' : selectedRow}
        data-testid="battle-canvas-proxy"
      >
        {playerBoardOverlay}
      </div>
    );
  },
}));

function activeLoop(): MatchLoopView {
  const view = createPublicMatchView(createMatch({
    countdownTicks: 0,
    matchSeed: 17,
  }));
  return {
    dispatch: vi.fn(),
    commandFeedback: [],
    eventBatches: [],
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
    commandFeedback: [],
    eventBatches: [],
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

    expect(screen.getByRole('region', { name: '견습 마도공학자 battle status' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: '거품 연금술사 battle status' }))
      .toBeInTheDocument();
    expect(screen.getAllByTestId('battle-canvas-proxy')).toHaveLength(1);
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-selected-row',
      'none',
    );
    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-event-batches',
      '',
    );
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });

  it('renders the hidden owl encounter as the opponent instead of a floor rival', () => {
    render(
      <MatchScreen
        {...lifecycleProps}
        difficulty="hard"
        floor={5}
        seed={17}
        specialEncounter={{
          characterId: 'owl-companion',
          displayName: 'Owl Architect',
          title: 'Tower Architect',
          intro: 'The tower architect reveals the truth.',
          winLine: 'The tower opens.',
          lossLine: 'The tower resets.',
        }}
        onFinished={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Owl Architect battle status' }))
      .toHaveAttribute('data-character-id', 'owl-companion');
    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-encounter-kind', 'owl');
    expect(screen.getByText('HIDDEN BOSS')).toBeInTheDocument();
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

  it('passes each event batch unchanged to the battle canvas in a catch-up frame', () => {
    const baseView = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 17 }));
    const first = {
      events: [{ type: 'attack-sent' as const, side: 'player' as const, amount: 1 }],
      tick: 18,
      view: { ...baseView, tick: 18 },
    };
    const second = {
      events: [{ type: 'garbage-landed' as const, side: 'opponent' as const, amount: 1 }],
      tick: 19,
      view: { ...baseView, tick: 19 },
    };
    const batches = [first, second] as const;
    useMatchLoopMock.mockReturnValue({
      ...activeLoop(),
      eventBatches: batches,
      events: [...first.events, ...second.events],
      view: { ...baseView, tick: 19 },
    });

    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    expect(screen.getByTestId('battle-canvas-proxy')).toHaveAttribute(
      'data-event-batches',
      '18,19',
    );
    const received = canvasPropsSpy.mock.calls.at(-1)?.[0]?.eventBatches;
    expect(received).toBe(batches);
    expect(received?.[0]).toBe(first);
    expect(received?.[1]).toBe(second);
  });

  it('passes the frame-owned command feedback array unchanged to the battle canvas', () => {
    const feedback = [{
      command: { type: 'move' as const, dx: -1 }, sequence: 9, side: 'player' as const, tick: 18,
    }] as const;
    useMatchLoopMock.mockReturnValue({ ...activeLoop(), commandFeedback: feedback });

    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    expect(canvasPropsSpy.mock.calls.at(-1)?.[0]?.commandFeedback).toBe(feedback);
  });

  it('keeps borrowed audio cue-only while match lifecycle still pauses and counts down', async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibilityState,
    );
    const loop = activeLoop();
    const audioPort = createAudioPort();
    useMatchLoopMock.mockReturnValue(loop);
    const result = render(
      <MatchScreen
        {...lifecycleProps}
        audioPort={audioPort}
        floor={2}
        seed={17}
        onFinished={vi.fn()}
      />,
    );

    expect(audioPort.setEnabled).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('match-screen'));
    expect(audioPort.unlock).not.toHaveBeenCalled();

    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(loop.setPaused).toHaveBeenCalledWith('background', true);
    expect(audioPort.suspend).not.toHaveBeenCalled();

    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(loop.setPaused).toHaveBeenLastCalledWith('background', false);
    expect(audioPort.resume).not.toHaveBeenCalled();

    result.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(audioPort.destroy).not.toHaveBeenCalled();
  });
});
