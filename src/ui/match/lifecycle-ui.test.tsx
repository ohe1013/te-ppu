// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchLoopView } from '../../app/use-match-loop';
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
  BattleCanvas: ({ playerBoardOverlay }: { readonly playerBoardOverlay?: ReactNode }) => (
    <div data-testid="battle-canvas-proxy">{playerBoardOverlay}</div>
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

function createLoop(events: MatchLoopView['events'] = []): MatchLoopView {
  const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 91 }));
  return {
    dispatch: vi.fn(),
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
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => finishClose?.());

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    result.rerender(
      <ExitConfirmation open={false} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    expect(opener).toHaveFocus();
    opener.remove();
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

  it('pauses for background and exit, counts down, and closes only after confirmation', async () => {
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
    expect(audio.suspend).toHaveBeenCalledTimes(1);

    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('status', { name: '게임 재개 카운트다운' }))
      .toHaveTextContent('3');
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByRole('status', { name: '게임 재개 카운트다운' }))
      .toHaveTextContent('1');
    expect(loop.setPaused).not.toHaveBeenCalledWith('background', false);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(loop.setPaused).toHaveBeenCalledWith('background', false);

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
    useMatchLoopMock.mockReturnValue(loop);
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
    useMatchLoopMock.mockReturnValue({ ...loop, events: [...events] });
    result.rerender(
      <MatchScreen
        {...props}
        settings={{ hapticsEnabled: false, soundEnabled: false }}
      />,
    );
    expect(audio.play).not.toHaveBeenCalled();
    expect(platform.haptic).not.toHaveBeenCalled();
  });

  it('coalesces terminal top-out and match-end feedback within one event batch', () => {
    const loop = createLoop([
      { type: 'top-out', side: 'player' },
      { type: 'match-ended', side: 'opponent' },
    ]);
    const platform = createPlatform();
    const audio = createAudio();
    useMatchLoopMock.mockReturnValue({
      ...loop,
      view: { ...loop.view, status: 'opponent-won' },
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

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith('loss');
    expect(platform.haptic).toHaveBeenCalledTimes(1);
    expect(platform.haptic).toHaveBeenCalledWith('error');
  });
});
