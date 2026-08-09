// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MatchLoopView,
  UseMatchLoopOptions,
} from '../../app/use-match-loop';
import { createMatch, createPublicMatchView } from '../../core/index';
import type { AudioPort } from '../../platform/audio-port';
import type { PlatformPort } from '../../platform/platform-port';
import type { ProgressState } from '../../progression/index';
import { MatchScreen } from '../screens/MatchScreen';
import { ExitConfirmation } from './ExitConfirmation';
import { ResumeCountdown } from './ResumeCountdown';
import { SettingsPanel } from './SettingsPanel';

const useMatchLoopMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/use-match-loop', () => ({
  useMatchLoop: useMatchLoopMock,
}));

vi.mock('../../render/BattleCanvas', () => ({
  BattleCanvas: ({
    eventBatches,
    playerBoardOverlay,
  }: {
    readonly eventBatches?: readonly { readonly tick: number }[];
    readonly playerBoardOverlay?: ReactNode;
  }) => (
    <div
      data-event-batch-ticks={eventBatches?.map(({ tick }) => tick).join(',') ?? 'missing'}
      data-testid="battle-canvas-proxy"
    >
      {playerBoardOverlay}
    </div>
  ),
}));

const enabledSettings: ProgressState['settings'] = {
  hapticsEnabled: true,
  soundEnabled: true,
};

function createAudio(): AudioPort {
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

function createPlatform(): PlatformPort {
  return {
    close: vi.fn(async () => undefined),
    getIdentity: vi.fn(async () => ({
      kind: 'local' as const,
      key: 'local-browser' as const,
    })),
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    haptic: vi.fn(async () => undefined),
    kind: 'browser',
    lockPortrait: vi.fn(async () => undefined),
    subscribeSafeArea: () => () => undefined,
  };
}

function createLoop(
  events: MatchLoopView['events'] = [],
  eventBatches: MatchLoopView['eventBatches'] = [],
): MatchLoopView {
  const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 91 }));
  return {
    commandFeedback: [],
    dispatch: vi.fn(),
    eventBatches,
    events,
    setPaused: vi.fn(),
    stop: vi.fn(),
    view,
  };
}

describe('lifecycle UI', () => {
  beforeEach(() => {
    useMatchLoopMock.mockReturnValue(createLoop());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders only the current resume countdown value', () => {
    const result = render(<ResumeCountdown count={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    result.rerender(<ResumeCountdown count={3} />);
    expect(screen.getByRole('status')).toHaveTextContent('3');
    result.rerender(<ResumeCountdown count={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('traps focus, cancels with Escape, restores focus, and confirms only once', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    let finishClose: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => {
      finishClose = resolve;
    }));
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.append(opener);
    opener.focus();

    const result = render(
      <ExitConfirmation open onCancel={onCancel} onConfirm={onConfirm} />,
    );
    const cancel = screen.getByRole('button', { name: '계속하기' });
    const confirm = screen.getByRole('button', { name: '게임 나가기 확인' });
    expect(cancel).toHaveFocus();

    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => undefined);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'closing');
    await act(async () => finishClose?.());
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('게임을 닫는 중입니다.');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    result.rerender(
      <ExitConfirmation open={false} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('turns a hanging platform close into a retryable bounded failure', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const onConfirm = vi.fn(() => {
      attempts += 1;
      return attempts === 1
        ? new Promise<void>(() => undefined)
        : Promise.resolve();
    });
    render(<ExitConfirmation open onCancel={vi.fn()} onConfirm={onConfirm} />);

    const confirm = screen.getByRole('button', { name: '게임 나가기 확인' });
    fireEvent.click(confirm);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'closing');
    await act(async () => vi.advanceTimersByTimeAsync(1_200));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'failed');
    expect(screen.getByRole('status')).toHaveTextContent('게임을 닫지 못했습니다');
    expect(confirm).toBeEnabled();

    await act(async () => fireEvent.click(confirm));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'closing');
  });

  it('keeps settings closed on entry and persists explicit sound and haptic changes', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn(async () => true);
    const onRetrySave = vi.fn(async () => true);
    const result = render(
      <SettingsPanel
        onRetrySave={onRetrySave}
        onSettingsChange={onSettingsChange}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );

    expect(screen.queryByRole('region', { name: '게임 설정' }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('region', { name: '게임 설정' })).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: '효과음' }));
    await user.click(screen.getByRole('checkbox', { name: '진동' }));
    expect(onSettingsChange).toHaveBeenNthCalledWith(1, { soundEnabled: false });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, { hapticsEnabled: false });

    result.rerender(
      <SettingsPanel
        onRetrySave={onRetrySave}
        onSettingsChange={onSettingsChange}
        saveFailed
        settings={{ hapticsEnabled: false, soundEnabled: false }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '설정 저장 다시 시도' }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
  });

  it('keeps match pause/countdown local while borrowed audio stays root-owned', async () => {
    vi.useFakeTimers();
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibilityState,
    );
    const loop = createLoop();
    const platform = createPlatform();
    const audio = createAudio();
    useMatchLoopMock.mockReturnValue(loop);
    render(
      <MatchScreen
        audioPort={audio}
        floor={1}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        seed={91}
        settings={enabledSettings}
        settingsSaveFailed={false}
      />,
    );

    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(loop.setPaused).toHaveBeenCalledWith('background', true);
    expect(audio.suspend).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('match-screen'));
    expect(audio.unlock).not.toHaveBeenCalled();

    visibilityState = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      fireEvent.pointerDown(screen.getByTestId('match-screen'));
    });
    expect(screen.getByRole('status', { name: '게임 재개 카운트다운' }))
      .toHaveTextContent('3');
    expect(audio.unlock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByRole('status', { name: '게임 재개 카운트다운' }))
      .toHaveTextContent('1');
    expect(loop.setPaused).not.toHaveBeenCalledWith('background', false);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(loop.setPaused).toHaveBeenCalledWith('background', false);
    expect(audio.resume).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('match-screen'));
    expect(audio.unlock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '게임 나가기' }));
    expect(loop.setPaused).toHaveBeenCalledWith('exit-confirmation', true);
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }));
    expect(loop.setPaused).toHaveBeenCalledWith('exit-confirmation', false);
    expect(platform.close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '게임 나가기' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 나가기 확인' }));
    await act(async () => undefined);
    expect(platform.close).toHaveBeenCalledTimes(1);
  });

  it('does not unlock or destroy borrowed audio during StrictMode or match unmount', async () => {
    vi.useFakeTimers();
    const audio = createAudio();
    const result = render(
      <StrictMode>
        <MatchScreen
          audioPort={audio}
          floor={1}
          onFinished={vi.fn()}
          onRetrySettingsSave={vi.fn(async () => true)}
          onSettingsChange={vi.fn(async () => true)}
          platform={createPlatform()}
          seed={91}
          settings={enabledSettings}
          settingsSaveFailed={false}
        />
      </StrictMode>,
    );

    act(() => vi.advanceTimersByTime(300));
    expect(audio.destroy).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('match-screen'));
    expect(audio.unlock).not.toHaveBeenCalled();

    result.unmount();
    act(() => vi.advanceTimersByTime(299));
    expect(audio.destroy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(audio.destroy).not.toHaveBeenCalled();
  });

  it('preserves readonly event batches while lifecycle pause and resume controls run', async () => {
    vi.useFakeTimers();
    const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 91 }));
    const batches = [
      {
        events: [{ type: 'attack-sent' as const, side: 'player' as const, amount: 1 }],
        tick: 18,
        view: { ...view, tick: 18 },
      },
      {
        events: [{ type: 'garbage-landed' as const, side: 'opponent' as const, amount: 1 }],
        tick: 19,
        view: { ...view, tick: 19 },
      },
    ] as const;
    const loop = createLoop(
      [...batches[0].events, ...batches[1].events],
      batches,
    );
    useMatchLoopMock.mockReturnValue(loop);
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    render(
      <MatchScreen
        audioPort={createAudio()}
        floor={1}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={createPlatform()}
        seed={91}
        settings={enabledSettings}
        settingsSaveFailed={false}
      />,
    );

    const canvas = screen.getByTestId('battle-canvas-proxy');
    expect(canvas).toHaveAttribute('data-event-batch-ticks', '18,19');
    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(canvas).toHaveAttribute('data-event-batch-ticks', '18,19');
  });

  it('maps game events only when the matching sound and haptic settings are enabled', () => {
    const events: MatchLoopView['events'] = [
      { type: 'piece-locked', side: 'player' },
      { type: 'lines-cleared', side: 'player', amount: 2, rows: [18, 19] },
      { type: 'attack-sent', side: 'player', amount: 3 },
      { type: 'item-used', side: 'player', item: 'freeze' },
    ];
    const loop = createLoop(events);
    const platform = createPlatform();
    const audio = createAudio();
    let loopOptions: UseMatchLoopOptions | null = null;
    useMatchLoopMock.mockImplementation((options: UseMatchLoopOptions) => {
      loopOptions = options;
      return loop;
    });
    const props = {
      audioPort: audio,
      floor: 1 as const,
      onFinished: vi.fn(),
      onRetrySettingsSave: vi.fn(async () => true),
      onSettingsChange: vi.fn(async () => true),
      platform,
      seed: 91,
      settingsSaveFailed: false,
    };

    const result = render(<MatchScreen {...props} settings={enabledSettings} />);
    act(() => loopOptions?.onEvents?.(events, loop.view));
    expect(audio.play).toHaveBeenCalledWith('land');
    expect(audio.play).toHaveBeenCalledWith('clear');
    expect(audio.play).toHaveBeenCalledWith('attack');
    expect(audio.play).toHaveBeenCalledWith('item');
    expect(platform.haptic).toHaveBeenCalled();

    vi.clearAllMocks();
    result.rerender(
      <MatchScreen {...props} settings={{ ...enabledSettings }} />,
    );
    expect(audio.play).not.toHaveBeenCalled();
    expect(platform.haptic).not.toHaveBeenCalled();

    vi.clearAllMocks();
    result.rerender(
      <MatchScreen
        {...props}
        settings={{ hapticsEnabled: false, soundEnabled: false }}
      />,
    );
    act(() => loopOptions?.onEvents?.([...events], loop.view));
    expect(audio.play).not.toHaveBeenCalled();
    expect(platform.haptic).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedCue: 'loss',
      expectedHaptic: 'error',
      matchEndSide: 'opponent',
      status: 'opponent-won',
      topOutSide: 'player',
    },
    {
      expectedCue: 'win',
      expectedHaptic: 'success',
      matchEndSide: 'player',
      status: 'player-won',
      topOutSide: 'opponent',
    },
  ] as const)('emits only $expectedCue feedback for a terminal batch', ({
    expectedCue,
    expectedHaptic,
    matchEndSide,
    status,
    topOutSide,
  }) => {
    const events: MatchLoopView['events'] = [
      { type: 'top-out', side: topOutSide },
      { type: 'match-ended', side: matchEndSide },
    ];
    const loop = createLoop([
      ...events,
    ]);
    const platform = createPlatform();
    const audio = createAudio();
    const terminalLoop = {
      ...loop,
      view: { ...loop.view, status },
    };
    let loopOptions: UseMatchLoopOptions | null = null;
    useMatchLoopMock.mockImplementation((options: UseMatchLoopOptions) => {
      loopOptions = options;
      return terminalLoop;
    });

    render(
      <MatchScreen
        audioPort={audio}
        floor={1}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        seed={91}
        settings={enabledSettings}
        settingsSaveFailed={false}
      />,
    );
    act(() => loopOptions?.onEvents?.(events, terminalLoop.view));

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(expectedCue);
    expect(platform.haptic).toHaveBeenCalledTimes(1);
    expect(platform.haptic).toHaveBeenCalledWith(expectedHaptic);
  });

  it('does not misreport a draw as a loss', () => {
    const events: MatchLoopView['events'] = [
      { type: 'top-out', side: 'player' },
      { type: 'top-out', side: 'opponent' },
      { type: 'match-ended', side: 'player' },
      { type: 'match-ended', side: 'opponent' },
    ];
    const loop = createLoop(events);
    const drawLoop = { ...loop, view: { ...loop.view, status: 'draw' as const } };
    const platform = createPlatform();
    const audio = createAudio();
    let loopOptions: UseMatchLoopOptions | null = null;
    useMatchLoopMock.mockImplementation((options: UseMatchLoopOptions) => {
      loopOptions = options;
      return drawLoop;
    });

    render(
      <MatchScreen
        audioPort={audio}
        floor={1}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        seed={91}
        settings={enabledSettings}
        settingsSaveFailed={false}
      />,
    );
    act(() => loopOptions?.onEvents?.(events, drawLoop.view));

    expect(audio.play).not.toHaveBeenCalled();
    expect(platform.haptic).not.toHaveBeenCalled();
  });
});
