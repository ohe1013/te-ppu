// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { PLAYER_CHARACTERS } from '../../player';
import type { ProgressState } from '../../progression/index';
import { MatchScreen } from '../screens/MatchScreen';
import { AppExitConfirmation } from './AppExitConfirmation';
import { ModalOverlay } from './ModalOverlay';
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
  bgmVolume: 70,
  sfxVolume: 100,
};

const defaultPlayer = PLAYER_CHARACTERS['hero-engineer'];

function createAudio(): AudioPort {
  return {
    destroy: vi.fn(async () => undefined),
    play: vi.fn(),
    resume: vi.fn(async () => undefined),
    setEnabled: vi.fn(),
    setMusic: vi.fn(async () => undefined),
    setVolumes: vi.fn(),
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

  it('portals an overlay into the app modal host when one exists', () => {
    const host = document.createElement('div');
    host.id = 'modal-root';
    host.dataset.modalRoot = '';
    document.body.append(host);

    const view = render(
      <ModalOverlay testId="test-overlay">
        <div>overlay content</div>
      </ModalOverlay>,
    );

    try {
      expect(screen.getByTestId('test-overlay').parentElement).toBe(host);
    } finally {
      view.unmount();
      host.remove();
    }
  });

  it('renders an overlay inline when no app modal host exists', () => {
    const view = render(
      <ModalOverlay testId="test-overlay">
        <div>overlay content</div>
      </ModalOverlay>,
    );

    expect(screen.getByTestId('test-overlay').parentElement).toBe(view.container);
  });

  it('renders only the current resume countdown value', () => {
    const result = render(<ResumeCountdown count={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    result.rerender(<ResumeCountdown count={3} />);
    const countdown = screen.getByRole('status');
    expect(countdown).toHaveTextContent('3');
    expect(countdown).toHaveClass('modal-overlay');
    expect(countdown.querySelector('.modal-overlay__surface')).toBeInTheDocument();
    result.rerender(<ResumeCountdown count={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('1');
  });

  it('renders settings in a centered modal overlay', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        onSfxPreview={vi.fn()}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );

    await user.click(screen.getByRole('button'));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('modal-overlay__surface');
    expect(dialog.parentElement).toHaveClass('modal-overlay');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
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
      <AppExitConfirmation
        description="게임 화면을 닫습니다."
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const cancel = screen.getByRole('button', { name: '계속하기' });
    const confirm = screen.getByRole('button', { name: '게임 종료 확인' });
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
    expect(screen.getByRole('status')).toHaveTextContent('게임을 종료하는 중입니다.');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    result.rerender(
      <AppExitConfirmation
        description="게임 화면을 닫습니다."
        open={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
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
    render(
      <AppExitConfirmation
        description="게임 화면을 닫습니다."
        open
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole('button', { name: '게임 종료 확인' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => undefined);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'closing');
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'failed');
    expect(screen.getByRole('status')).toHaveTextContent('게임을 종료하지 못했습니다');
    expect(confirm).toBeEnabled();

    await act(async () => fireEvent.click(confirm));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-close-state', 'closing');
  });

  it('renders ordered master, BGM, SFX, and haptic controls with persisted percentages', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        onSfxPreview={vi.fn()}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );

    await user.click(screen.getByRole('button', { name: '설정' }));

    expect(screen.getByRole('checkbox', { name: '전체 소리' })).toBeChecked();
    expect(screen.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('70');
    expect(screen.getByRole('slider', { name: '효과음 음량' })).toHaveValue('100');
    expect(screen.getByText('70%')).toBeVisible();
    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: '진동' })).toBeChecked();
  });

  it('previews every change but deduplicates pointer-up and blur into one final save', async () => {
    const onSettingsChange = vi.fn(async () => true);
    const onSfxPreview = vi.fn();
    const onVolumePreview = vi.fn();
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={onSettingsChange}
        onSfxPreview={onSfxPreview}
        onVolumePreview={onVolumePreview}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });
    const sfx = screen.getByRole('slider', { name: '효과음 음량' });

    fireEvent.blur(bgm);
    expect(onSettingsChange).not.toHaveBeenCalled();
    fireEvent.change(bgm, { target: { value: '60' } });
    fireEvent.change(bgm, { target: { value: '40' } });
    expect(onVolumePreview).toHaveBeenNthCalledWith(1, {
      bgmVolume: 60,
      sfxVolume: 100,
    });
    expect(onVolumePreview).toHaveBeenNthCalledWith(2, {
      bgmVolume: 40,
      sfxVolume: 100,
    });
    fireEvent.pointerUp(bgm);
    fireEvent.blur(bgm);
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(1));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ bgmVolume: 40 });
    expect(onSfxPreview).not.toHaveBeenCalled();

    fireEvent.change(sfx, { target: { value: '80' } });
    fireEvent.pointerUp(sfx);
    fireEvent.blur(sfx);
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(2));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ sfxVolume: 80 });
    expect(onSfxPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps an immediate volume change non-fatal when audio preview throws', () => {
    const onVolumePreview = vi.fn(() => {
      throw new Error('preview failed');
    });
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        onSfxPreview={vi.fn()}
        onVolumePreview={onVolumePreview}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });

    expect(() => fireEvent.change(bgm, { target: { value: '40' } })).not.toThrow();
    expect(onVolumePreview).toHaveBeenCalledTimes(1);
    expect(bgm).toHaveValue('40');
  });

  it('enqueues one SFX save when its commit preview throws', async () => {
    const onSettingsChange = vi.fn(async () => true);
    const onSfxPreview = vi.fn(() => {
      throw new Error('preview failed');
    });
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={onSettingsChange}
        onSfxPreview={onSfxPreview}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const sfx = screen.getByRole('slider', { name: '효과음 음량' });
    fireEvent.change(sfx, { target: { value: '80' } });

    expect(() => fireEvent.pointerUp(sfx)).not.toThrow();
    expect(() => fireEvent.blur(sfx)).not.toThrow();
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(1));
    expect(onSettingsChange).toHaveBeenCalledWith({ sfxVolume: 80 });
    expect(onSfxPreview).toHaveBeenCalledTimes(1);
  });

  it('finalizes keyboard and modal-close values while serializing durable saves', async () => {
    let resolveFirst!: (saved: boolean) => void;
    const firstSave = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const onSettingsChange = vi.fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(true);
    const onSfxPreview = vi.fn();
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={onSettingsChange}
        onSfxPreview={onSfxPreview}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });
    const sfx = screen.getByRole('slider', { name: '효과음 음량' });

    fireEvent.change(bgm, { target: { value: '40' } });
    fireEvent.keyUp(bgm, { key: 'ArrowLeft' });
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(1));
    fireEvent.change(sfx, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));

    expect(screen.queryByRole('dialog', { name: '게임 설정' })).not.toBeInTheDocument();
    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSfxPreview).toHaveBeenCalledTimes(1);

    await act(async () => resolveFirst(true));
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledTimes(2));
    expect(onSettingsChange).toHaveBeenNthCalledWith(1, { bgmVolume: 40 });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, { sfxVolume: 80 });
  });

  it('keeps the latest local volume and exposes retry when its save fails', async () => {
    const onSettingsChange = vi.fn(async () => false);
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={onSettingsChange}
        onSfxPreview={vi.fn()}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });

    fireEvent.change(bgm, { target: { value: '40' } });
    fireEvent.pointerUp(bgm);

    expect(await screen.findByText('설정은 적용됐지만 저장하지 못했습니다.'))
      .toBeVisible();
    expect(screen.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('40');
    expect(screen.getByText('40%')).toBeVisible();
    expect(screen.getByRole('button', { name: '설정 저장 다시 시도' })).toBeEnabled();
  });

  it('disables muted sliders and suppresses their previews and commits', () => {
    const onSettingsChange = vi.fn(async () => true);
    const onSfxPreview = vi.fn();
    const onVolumePreview = vi.fn();
    render(
      <SettingsPanel
        onRetrySave={vi.fn(async () => true)}
        onSettingsChange={onSettingsChange}
        onSfxPreview={onSfxPreview}
        onVolumePreview={onVolumePreview}
        saveFailed={false}
        settings={{ ...enabledSettings, soundEnabled: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });
    const sfx = screen.getByRole('slider', { name: '효과음 음량' });

    expect(bgm).toBeDisabled();
    expect(sfx).toBeDisabled();
    fireEvent.change(bgm, { target: { value: '40' } });
    fireEvent.change(sfx, { target: { value: '80' } });
    fireEvent.pointerUp(sfx);
    expect(onVolumePreview).not.toHaveBeenCalled();
    expect(onSfxPreview).not.toHaveBeenCalled();
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it('syncs external volume settings only when that slider is not actively dragging', () => {
    const props = {
      onRetrySave: vi.fn(async () => true),
      onSettingsChange: vi.fn(async () => true),
      onSfxPreview: vi.fn(),
      onVolumePreview: vi.fn(),
      saveFailed: false,
    } as const;
    const result = render(<SettingsPanel {...props} settings={enabledSettings} />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });

    fireEvent.pointerDown(bgm);
    fireEvent.change(bgm, { target: { value: '40' } });
    result.rerender(
      <SettingsPanel
        {...props}
        settings={{ ...enabledSettings, bgmVolume: 90, sfxVolume: 80 }}
      />,
    );
    expect(screen.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('40');
    expect(screen.getByRole('slider', { name: '효과음 음량' })).toHaveValue('80');

    fireEvent.pointerUp(screen.getByRole('slider', { name: 'BGM 음량' }));
    result.rerender(
      <SettingsPanel
        {...props}
        settings={{ ...enabledSettings, bgmVolume: 60, sfxVolume: 80 }}
      />,
    );
    expect(screen.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('60');
  });

  it('keeps settings closed on entry and persists explicit sound and haptic changes', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn(async () => true);
    const onRetrySave = vi.fn(async () => true);
    const result = render(
      <SettingsPanel
        onRetrySave={onRetrySave}
        onSettingsChange={onSettingsChange}
        onSfxPreview={vi.fn()}
        onVolumePreview={vi.fn()}
        saveFailed={false}
        settings={enabledSettings}
      />,
    );

    expect(screen.queryByRole('dialog', { name: '게임 설정' }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('dialog', { name: '게임 설정' })).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: '전체 소리' }));
    await user.click(screen.getByRole('checkbox', { name: '진동' }));
    expect(onSettingsChange).toHaveBeenNthCalledWith(1, { soundEnabled: false });
    expect(onSettingsChange).toHaveBeenNthCalledWith(2, { hapticsEnabled: false });

    result.rerender(
      <SettingsPanel
        onRetrySave={onRetrySave}
        onSettingsChange={onSettingsChange}
        onSfxPreview={vi.fn()}
        onVolumePreview={vi.fn()}
        saveFailed
        settings={{ hapticsEnabled: false, soundEnabled: false, bgmVolume: 70, sfxVolume: 100 }}
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
    const onAbandon = vi.fn();
    useMatchLoopMock.mockReturnValue(loop);
    render(
      <MatchScreen
        audioPort={audio}
        floor={1}
        onAbandon={onAbandon}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        player={defaultPlayer}
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

    fireEvent.click(screen.getByRole('button', { name: '타워로 나가기' }));
    expect(loop.setPaused).toHaveBeenCalledWith('exit-confirmation', true);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('이번 상대와 싸우며 얻은 점수와 전투 진행은 사라집니다.'))
      .toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }));
    expect(loop.setPaused).toHaveBeenCalledWith('exit-confirmation', false);
    expect(platform.close).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '타워로 나가기' }));
    fireEvent.click(screen.getByRole('button', { name: '타워로 나가기 확인' }));
    expect(onAbandon).toHaveBeenCalledOnce();
    expect(platform.close).not.toHaveBeenCalled();
  });

  it('does not unlock or destroy borrowed audio during StrictMode or match unmount', async () => {
    vi.useFakeTimers();
    const audio = createAudio();
    const result = render(
      <StrictMode>
        <MatchScreen
          audioPort={audio}
          floor={1}
          onAbandon={vi.fn()}
          onFinished={vi.fn()}
          onRetrySettingsSave={vi.fn(async () => true)}
          onSettingsChange={vi.fn(async () => true)}
          platform={createPlatform()}
          player={defaultPlayer}
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
        onAbandon={vi.fn()}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={createPlatform()}
        player={defaultPlayer}
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
      { type: 'lines-cleared', side: 'player', amount: 1, rows: [19] },
      { type: 'attack-sent', side: 'player', amount: 1 },
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
      onAbandon: vi.fn(),
      onFinished: vi.fn(),
      onRetrySettingsSave: vi.fn(async () => true),
      onSettingsChange: vi.fn(async () => true),
      platform,
      player: defaultPlayer,
      seed: 91,
      settingsSaveFailed: false,
    };

    const result = render(<MatchScreen {...props} settings={enabledSettings} />);
    act(() => loopOptions?.onEvents?.(events, loop.view));
    expect(audio.play).toHaveBeenCalledWith('land', { intensity: 0, duckMusic: false });
    expect(audio.play).toHaveBeenCalledWith('clear', { intensity: 0, duckMusic: false });
    expect(audio.play).toHaveBeenCalledWith('attack', { intensity: 0, duckMusic: false });
    expect(audio.play).toHaveBeenCalledWith('item', { intensity: 0, duckMusic: false });
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
        settings={{ hapticsEnabled: false, soundEnabled: false, bgmVolume: 70, sfxVolume: 100 }}
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
        onAbandon={vi.fn()}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        player={defaultPlayer}
        seed={91}
        settings={enabledSettings}
        settingsSaveFailed={false}
      />,
    );
    act(() => loopOptions?.onEvents?.(events, terminalLoop.view));

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(expectedCue, {
      intensity: 0,
      duckMusic: false,
    });
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
        onAbandon={vi.fn()}
        onFinished={vi.fn()}
        onRetrySettingsSave={vi.fn(async () => true)}
        onSettingsChange={vi.fn(async () => true)}
        platform={platform}
        player={defaultPlayer}
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
