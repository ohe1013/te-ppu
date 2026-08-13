// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommonAssets, PlayerCharacterAssets } from '../../assets';
import { createMatch, createPublicMatchView, type GameEvent } from '../../core/index';
import type { MatchLoopView } from '../../app/use-match-loop';
import type { AudioPort } from '../../platform/audio-port';
import type { PlayerCharacterDefinition } from '../../player';
import type { MatchScreenProps } from './MatchScreen';
import { MatchScreen } from './MatchScreen';

const useMatchLoopMock = vi.hoisted(() => vi.fn());
const canvasPropsSpy = vi.hoisted(() => vi.fn());

const lifecycleProps: Pick<
  MatchScreenProps,
  | 'audioPort'
  | 'onAbandon'
  | 'onRetrySettingsSave'
  | 'onScoreEvents'
  | 'onSettingsChange'
  | 'platform'
  | 'player'
  | 'playerAssets'
  | 'settings'
  | 'settingsSaveFailed'
  | 'runScore'
> = {
  audioPort: createAudioPort(),
  onAbandon: vi.fn(),
  onRetrySettingsSave: async () => true,
  onScoreEvents: vi.fn(),
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
  player: {
    id: 'hero-engineer',
    name: '리벳',
    role: '견습 마도공학자',
    title: '별빛 수리공',
    story: '고장 난 별빛 동력핵을 수리한다.',
    palette: ['#35c8c2', '#fff4cf', '#b86f3c'],
  },
  playerAssets: undefined,
  settings: { hapticsEnabled: true, soundEnabled: true, bgmVolume: 70, sfxVolume: 100 },
  settingsSaveFailed: false,
  runScore: 0,
};

function createAudioPort(): AudioPort {
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

const cloudCourier = {
  id: 'cloud-courier',
  name: '루미',
  role: '구름 우편기사',
  title: '바람길의 전령',
  story: '멈춘 바람길을 되찾는다.',
  palette: ['#4d8fff', '#ffd84d', '#f8fbff'],
} satisfies PlayerCharacterDefinition;

const cloudCourierAssets = {
  fullArt: { url: '/cloud-courier/full.webp' },
  portraits: {
    idle: { url: '/cloud-courier/portrait-idle.webp' },
    focus: { url: '/cloud-courier/portrait-focus.webp' },
    attack: { url: '/cloud-courier/portrait-attack.webp' },
    hit: { url: '/cloud-courier/portrait-hit.webp' },
    win: { url: '/cloud-courier/portrait-win.webp' },
    loss: { url: '/cloud-courier/portrait-loss.webp' },
  },
} as PlayerCharacterAssets;

const owlCommonAssets = {
  audio: { bgm: {}, sfx: {} },
  generation: 1,
  icons: {},
  items: {},
  owl: {
    portraits: {
      cheer: { url: '/owl/portrait-cheer.webp' },
      idle: { url: '/owl/portrait-idle.webp' },
      worry: { url: '/owl/portrait-worry.webp' },
    },
  },
  players: {},
  rivals: {},
  tiles: {},
} as unknown as CommonAssets;

function portraitLoop(
  event: GameEvent | null,
  status: MatchLoopView['view']['status'] = 'playing',
): MatchLoopView {
  const loop = activeLoop();
  const view = {
    ...loop.view,
    status,
    tick: 10,
    sides: {
      ...loop.view.sides,
      player: {
        ...loop.view.sides.player,
        combo: event?.type === 'lines-cleared' ? 2 : loop.view.sides.player.combo,
      },
    },
  };
  const eventBatches = event === null ? [] : [{ events: [event], tick: 10, view }];
  return {
    ...loop,
    eventBatches,
    events: event === null ? [] : [event],
    view,
  };
}

function owlPortraitLoop(
  state: 'idle' | 'attack' | 'hit' | 'rage' | 'defeat',
): MatchLoopView {
  const loop = activeLoop();
  const event = state === 'attack'
    ? { amount: 2, side: 'opponent' as const, type: 'attack-sent' as const }
    : state === 'hit'
      ? { amount: 2, side: 'opponent' as const, type: 'garbage-landed' as const }
      : null;
  const view = {
    ...loop.view,
    status: state === 'defeat' ? 'player-won' as const : 'playing' as const,
    tick: 10,
    sides: {
      ...loop.view.sides,
      opponent: {
        ...loop.view.sides.opponent,
        incoming: state === 'rage' ? 4 : loop.view.sides.opponent.incoming,
      },
    },
  };
  return {
    ...loop,
    eventBatches: event === null ? [] : [{ events: [event], tick: 10, view }],
    events: event === null ? [] : [event],
    view,
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
  it.each([
    ['countdown', '대전 준비'],
    ['playing', '대전 진행 중'],
    ['player-won', '플레이어 승리'],
    ['opponent-won', '상대 승리'],
    ['draw', '무승부'],
  ] as const)('announces the Korean player-facing label for %s', (status, label) => {
    const loop = activeLoop();
    useMatchLoopMock.mockReturnValue({
      ...loop,
      view: { ...loop.view, status },
    });

    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    expect(screen.getByTestId('match-status')).toHaveTextContent(label);
    expect(screen.getByTestId('match-status')).not.toHaveTextContent(status);
  });

  it('composes two symmetric public HUDs around the single battle canvas', () => {
    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    expect(screen.getByRole('region', { name: '리벳 대전 상태' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: '거품 연금술사 대전 상태' }))
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
    expect(screen.getByTestId('match-status')).toHaveTextContent('대전 준비');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
    expect(screen.getByText('2층 · 1/3')).toBeInTheDocument();
    expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
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

    expect(screen.getByRole('region', { name: 'Owl Architect 대전 상태' }))
      .toHaveAttribute('data-character-id', 'owl-companion');
    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-encounter-kind', 'owl');
    expect(screen.getByText('숨겨진 보스')).toBeInTheDocument();
    expect(screen.getByText('부엉이')).toBeInTheDocument();
  });

  it.each([
    ['idle', '/owl/portrait-idle.webp'],
    ['attack', '/owl/portrait-cheer.webp'],
    ['hit', '/owl/portrait-worry.webp'],
    ['rage', '/owl/portrait-worry.webp'],
    ['defeat', '/owl/portrait-worry.webp'],
  ] as const)('renders the owl %s state with its mapped authored portrait URL', (
    portraitState,
    expectedUrl,
  ) => {
    useMatchLoopMock.mockReturnValue(owlPortraitLoop(portraitState));

    render(
      <MatchScreen
        {...lifecycleProps}
        commonAssets={owlCommonAssets}
        floor={5}
        onFinished={vi.fn()}
        seed={17}
        specialEncounter={{
          characterId: 'owl-companion',
          displayName: 'Owl Architect',
          intro: 'The tower architect reveals the truth.',
          lossLine: 'The tower resets.',
          title: 'Tower Architect',
          winLine: 'The tower opens.',
        }}
      />,
    );

    const opponentHud = screen.getByRole('region', {
      name: 'Owl Architect 대전 상태',
    });
    expect(opponentHud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      portraitState,
    );
    expect(screen.getByAltText('Owl Architect 기본 표정')).toHaveAttribute(
      'src',
      expectedUrl,
    );
  });

  it.each([
    ['idle', null, 'playing', '/cloud-courier/portrait-idle.webp'],
    ['focus', { type: 'lines-cleared', side: 'player', amount: 2 }, 'playing', '/cloud-courier/portrait-focus.webp'],
    ['attack', { type: 'attack-sent', side: 'player', amount: 2 }, 'playing', '/cloud-courier/portrait-attack.webp'],
    ['hit', { type: 'garbage-landed', side: 'player', amount: 2 }, 'playing', '/cloud-courier/portrait-hit.webp'],
    ['win', null, 'player-won', '/cloud-courier/portrait-win.webp'],
    ['loss', null, 'opponent-won', '/cloud-courier/portrait-loss.webp'],
  ] as const)('uses the selected player %s portrait source and identity', (
    portraitState,
    event,
    status,
    expectedUrl,
  ) => {
    useMatchLoopMock.mockReturnValue(portraitLoop(event, status));

    render(
      <MatchScreen
        {...lifecycleProps}
        floor={2}
        onFinished={vi.fn()}
        player={cloudCourier}
        playerAssets={cloudCourierAssets}
        seed={17}
      />,
    );

    const playerHud = screen.getByRole('region', { name: '루미 대전 상태' });
    expect(playerHud).toHaveAttribute('data-character-id', 'cloud-courier');
    expect(playerHud).toHaveTextContent('바람길의 전령');
    expect(playerHud.querySelector('[data-portrait-state]')).toHaveAttribute(
      'data-portrait-state',
      portraitState,
    );
    expect(screen.getByAltText('루미 기본 표정')).toHaveAttribute(
      'src',
      expectedUrl,
    );
  });

  it('connects item actions, row highlighting, joystick, and rotation to the match loop', () => {
    const loop = activeLoop();
    useMatchLoopMock.mockReturnValue(loop);
    render(<MatchScreen {...lifecycleProps} floor={2} seed={17} onFinished={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '빙결 · 1회' }));
    fireEvent.click(screen.getByRole('button', { name: '교체 · 3회' }));
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

  it('forwards each exact frame event list once after audiovisual feedback without replaying on rerender', () => {
    const loop = activeLoop();
    const play = vi.fn();
    const audioPort = { ...createAudioPort(), play };
    const onScoreEvents = vi.fn();
    useMatchLoopMock.mockReturnValue(loop);
    const rendered = render(
      <MatchScreen
        {...lifecycleProps}
        audioPort={audioPort}
        floor={2}
        onFinished={vi.fn()}
        onScoreEvents={onScoreEvents}
        runScore={12_450}
        seed={17}
      />,
    );
    const options = useMatchLoopMock.mock.calls.at(-1)?.[0];
    const events = [
      { type: 'lines-cleared' as const, side: 'player' as const, amount: 4, rows: [16, 17, 18, 19] },
      { type: 'attack-sent' as const, side: 'player' as const, amount: 4 },
    ] as const;

    act(() => options.onEvents(events, loop.view));

    expect(onScoreEvents).toHaveBeenCalledOnce();
    expect(onScoreEvents.mock.calls[0]?.[0]).toBe(events);
    expect(play).toHaveBeenCalledWith('clear', { intensity: 3, duckMusic: true });
    expect(play).toHaveBeenCalledWith('attack', { intensity: 3, duckMusic: true });
    expect(play.mock.invocationCallOrder[0])
      .toBeLessThan(onScoreEvents.mock.invocationCallOrder[0]!);

    rendered.rerender(
      <MatchScreen
        {...lifecycleProps}
        audioPort={audioPort}
        floor={2}
        onFinished={vi.fn()}
        onScoreEvents={onScoreEvents}
        runScore={12_450}
        seed={17}
      />,
    );
    expect(onScoreEvents).toHaveBeenCalledOnce();
  });

  it('adapts immediate volume previews and commits one SFX preview cue without owning audio', async () => {
    const audioPort = createAudioPort();
    const onSettingsChange = vi.fn(async () => true);
    useMatchLoopMock.mockReturnValue(activeLoop());
    render(
      <MatchScreen
        {...lifecycleProps}
        audioPort={audioPort}
        floor={2}
        onFinished={vi.fn()}
        onSettingsChange={onSettingsChange}
        seed={17}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const bgm = screen.getByRole('slider', { name: 'BGM 음량' });
    const sfx = screen.getByRole('slider', { name: '효과음 음량' });

    fireEvent.change(bgm, { target: { value: '40' } });
    expect(audioPort.setVolumes).toHaveBeenLastCalledWith({ bgm: 0.4, sfx: 1 });
    fireEvent.pointerUp(bgm);
    await act(async () => undefined);
    expect(audioPort.play).not.toHaveBeenCalled();

    fireEvent.change(sfx, { target: { value: '80' } });
    expect(audioPort.setVolumes).toHaveBeenLastCalledWith({ bgm: 0.4, sfx: 0.8 });
    fireEvent.pointerUp(sfx);
    await act(async () => undefined);
    expect(audioPort.play).toHaveBeenCalledTimes(1);
    expect(audioPort.play).toHaveBeenCalledWith('rotate');
    expect(audioPort.unlock).not.toHaveBeenCalled();
    expect(audioPort.suspend).not.toHaveBeenCalled();
    expect(audioPort.resume).not.toHaveBeenCalled();
    expect(audioPort.destroy).not.toHaveBeenCalled();
  });

  it.each([
    [0, '점수 000000'],
    [12_450, '점수 012450'],
    [1_234_567, '점수 1234567'],
  ] as const)('renders score %i in one compact fixed-width header', (runScore, label) => {
    render(
      <MatchScreen
        {...lifecycleProps}
        floor={2}
        onFinished={vi.fn()}
        runScore={runScore}
        seed={17}
      />,
    );

    expect(screen.getAllByTestId('run-score')).toHaveLength(1);
    expect(screen.getByTestId('run-score')).toHaveTextContent(label);
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
