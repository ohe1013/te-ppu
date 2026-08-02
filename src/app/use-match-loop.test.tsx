// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAiObservation,
  createMatch,
  type GameCommand,
  type GameEvent,
  type MatchState,
  type TimedCommand,
} from '../core/index';
import {
  AI_FLOOR_PROFILES,
  createAiController,
  type AiController,
} from '../ai/index';
import { MatchScreen } from '../ui/screens/MatchScreen';
import { useMatchLoop } from './use-match-loop';

const coreSpies = vi.hoisted(() => ({
  createAiObservation: vi.fn(),
  createMatch: vi.fn(),
  createPublicMatchView: vi.fn(),
  stepMatch: vi.fn(),
}));

const aiSpies = vi.hoisted(() => ({
  createAiController: vi.fn(),
}));

vi.mock('../core/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/index')>();
  coreSpies.createAiObservation.mockImplementation(actual.createAiObservation);
  coreSpies.createMatch.mockImplementation(actual.createMatch);
  coreSpies.createPublicMatchView.mockImplementation(actual.createPublicMatchView);
  coreSpies.stepMatch.mockImplementation(actual.stepMatch);
  return {
    ...actual,
    createAiObservation: coreSpies.createAiObservation,
    createMatch: coreSpies.createMatch,
    createPublicMatchView: coreSpies.createPublicMatchView,
    stepMatch: coreSpies.stepMatch,
  };
});

vi.mock('../ai/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/index')>();
  aiSpies.createAiController.mockImplementation(actual.createAiController);
  return {
    ...actual,
    createAiController: aiSpies.createAiController,
  };
});

// This suite owns the hook/profile/status boundary; WebGL lifecycle lives in
// BattleCanvas.test.tsx and must not load Pixi's renderer into jsdom here.
vi.mock('../render/BattleCanvas', () => ({
  BattleCanvas: () => null,
}));

const STEP_MS = 1000 / 60;

class FrameClock {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;
  private timestamp = 0;

  install(): void {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.callbacks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      this.callbacks.delete(handle);
    });
  }

  advanceBy(milliseconds: number): void {
    this.timestamp += milliseconds;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    act(() => {
      for (const callback of callbacks) callback(this.timestamp);
    });
  }

  get pendingFrames(): number {
    return this.callbacks.size;
  }
}

function fakeAi(commands: readonly TimedCommand[] = []): AiController & {
  readonly update: ReturnType<typeof vi.fn>;
} {
  return {
    side: 'opponent',
    update: vi.fn(() => commands),
  };
}

function renderLoop({
  ai = fakeAi(),
  onEvents,
  onFinished = vi.fn(),
}: {
  readonly ai?: AiController;
  readonly onEvents?: Parameters<typeof useMatchLoop>[0]['onEvents'];
  readonly onFinished?: (result: 'win' | 'loss' | 'draw') => void | Promise<void>;
} = {}) {
  const clock = new FrameClock();
  clock.install();
  const hook = renderHook(() => useMatchLoop({
    ai,
    config: { matchSeed: 17, countdownTicks: 0 },
    onEvents,
    onFinished,
  }));
  clock.advanceBy(0);
  return { ...hook, clock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMatchLoop', () => {
  it('queues player commands in dispatch order for the next tick before AI commands', () => {
    const aiCommands: readonly TimedCommand[] = [{
      tick: 1,
      side: 'opponent',
      command: { type: 'hard-drop' },
    }];
    const ai = fakeAi(aiCommands);
    const { clock, result } = renderLoop({ ai });
    const move: GameCommand = { type: 'move', dx: -1 };
    const rotate: GameCommand = { type: 'rotate-clockwise' };

    act(() => {
      result.current.dispatch(move);
      result.current.dispatch(rotate);
    });
    clock.advanceBy(STEP_MS);

    expect(coreSpies.stepMatch).toHaveBeenCalledTimes(1);
    expect(coreSpies.stepMatch).toHaveBeenCalledWith(expect.anything(), [
      { tick: 1, side: 'player', command: move },
      { tick: 1, side: 'player', command: rotate },
      ...aiCommands,
    ]);
    const steppedState = coreSpies.stepMatch.mock.results[0]?.value.state;
    const publishedView = coreSpies.createPublicMatchView.mock.results.at(-1)?.value;
    expect(result.current.view).toBe(publishedView);
    expect(result.current.view.tick).toBe(steppedState.tick);
  });

  it('passes only the opponent observation to the AI controller', () => {
    const ai = fakeAi();
    const { clock } = renderLoop({ ai });

    clock.advanceBy(STEP_MS);

    const steppedState = coreSpies.stepMatch.mock.calls[0]?.[0];
    expect(coreSpies.createAiObservation).toHaveBeenCalledWith(steppedState, 'opponent');
    const observation = coreSpies.createAiObservation.mock.results.at(-1)?.value;
    expect(ai.update).toHaveBeenCalledWith(observation, 1);
    expect(observation).not.toHaveProperty('matchSeed');
    expect(observation).not.toHaveProperty('sides');
  });

  it('retains accumulator time beyond the eight-step per-frame catch-up cap', () => {
    const ai = fakeAi();
    const { clock, result } = renderLoop({ ai });

    clock.advanceBy(STEP_MS * 10);
    expect(result.current.view.tick).toBe(8);
    expect(coreSpies.stepMatch).toHaveBeenCalledTimes(8);
    expect(ai.update).toHaveBeenCalledTimes(8);

    clock.advanceBy(0);
    expect(result.current.view.tick).toBe(10);
    expect(coreSpies.stepMatch).toHaveBeenCalledTimes(10);
    expect(ai.update).toHaveBeenCalledTimes(10);
  });

  it('preserves early catch-up events in step order when later ticks emit none', () => {
    const earlyEvents: readonly GameEvent[] = [
      { type: 'lines-cleared', side: 'player', amount: 2 },
      { type: 'attack-sent', side: 'player', amount: 1 },
    ];
    coreSpies.stepMatch
      .mockImplementationOnce((state: MatchState) => ({
        events: earlyEvents,
        state: { ...state, tick: state.tick + 1 },
      }))
      .mockImplementationOnce((state: MatchState) => ({
        events: [],
        state: { ...state, tick: state.tick + 1 },
      }))
      .mockImplementationOnce((state: MatchState) => ({
        events: [],
        state: { ...state, tick: state.tick + 1 },
      }));
    const { clock, result } = renderLoop();

    clock.advanceBy(STEP_MS * 3);

    expect(result.current.view.tick).toBe(3);
    expect(result.current.events).toEqual(earlyEvents);
  });

  it('composes pause reasons and resets the timestamp before resuming', () => {
    const { clock, result } = renderLoop();

    act(() => result.current.setPaused('background', true));
    clock.advanceBy(5_000);
    act(() => {
      result.current.setPaused('exit-confirmation', true);
      result.current.setPaused('background', false);
    });
    clock.advanceBy(5_000);
    expect(result.current.view.tick).toBe(0);

    act(() => result.current.setPaused('exit-confirmation', false));
    clock.advanceBy(STEP_MS);
    expect(result.current.view.tick).toBe(0);
    clock.advanceBy(STEP_MS);
    expect(result.current.view.tick).toBe(1);
  });

  it.each([
    ['player-won', 'win'],
    ['opponent-won', 'loss'],
    ['draw', 'draw'],
  ] as const)('stops and reports terminal status %s exactly once', (status, resultName) => {
    const onFinished = vi.fn();
    const onEvents = vi.fn();
    const terminalEvent: GameEvent = {
      type: 'match-ended',
      side: status === 'player-won' ? 'player' : 'opponent',
    };
    coreSpies.stepMatch.mockImplementationOnce((state: MatchState) => ({
      events: [terminalEvent],
      state: { ...state, status, tick: state.tick + 1 },
    }));
    const { clock, result } = renderLoop({ onEvents, onFinished });

    clock.advanceBy(STEP_MS);

    expect(result.current.view.status).toBe(status);
    expect(result.current.events).toEqual([terminalEvent]);
    expect(onEvents).toHaveBeenCalledWith([terminalEvent], result.current.view);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith(resultName);
    expect(onEvents.mock.invocationCallOrder[0])
      .toBeLessThan(onFinished.mock.invocationCallOrder[0]!);
    expect(clock.pendingFrames).toBe(0);

    act(() => result.current.dispatch({ type: 'hard-drop' }));
    clock.advanceBy(STEP_MS * 20);
    expect(coreSpies.stepMatch).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('cancels animation work and ignores retained dispatchers after unmount', () => {
    const { clock, result, unmount } = renderLoop();
    const dispatch = result.current.dispatch;

    unmount();
    expect(clock.pendingFrames).toBe(0);
    act(() => dispatch({ type: 'hard-drop' }));
    clock.advanceBy(STEP_MS);

    expect(coreSpies.stepMatch).not.toHaveBeenCalled();
  });

  it('manual stop cancels animation work and queued input', () => {
    const { clock, result } = renderLoop();

    act(() => {
      result.current.dispatch({ type: 'hard-drop' });
      result.current.stop();
    });
    expect(clock.pendingFrames).toBe(0);
    clock.advanceBy(STEP_MS);

    expect(coreSpies.stepMatch).not.toHaveBeenCalled();
  });
});

describe('runtime information boundary', () => {
  it('produces equal AI commands when states differ only in hidden data', () => {
    const state = createMatch({ matchSeed: 29, countdownTicks: 0 });
    const opponent = state.sides.opponent;
    const hiddenVariant: MatchState = {
      ...state,
      matchSeed: 9_999,
      sides: {
        ...state.sides,
        opponent: {
          ...opponent,
          garbageDrawIndex: opponent.garbageDrawIndex + 7,
          next: [
            { ...opponent.next[0], serial: opponent.next[0].serial + 100 },
            { ...opponent.next[1], serial: opponent.next[1].serial + 100 },
          ],
          nextSerial: opponent.nextSerial + 100,
        },
      },
    };
    const firstObservation = createAiObservation(state, 'opponent');
    const secondObservation = createAiObservation(hiddenVariant, 'opponent');
    expect(firstObservation).toEqual(secondObservation);
    const firstAi = createAiController(AI_FLOOR_PROFILES[0]!, 41);
    const secondAi = createAiController(AI_FLOOR_PROFILES[0]!, 41);
    const firstCommands: TimedCommand[] = [];
    const secondCommands: TimedCommand[] = [];

    for (let tick = 1; tick <= AI_FLOOR_PROFILES[0]!.reactionTicks; tick += 1) {
      firstCommands.push(...firstAi.update(firstObservation, tick));
      secondCommands.push(...secondAi.update(secondObservation, tick));
    }

    expect(firstCommands).toEqual(secondCommands);
  });
});

describe('MatchScreen', () => {
  it('selects the floor AI profile and renders the public loop view', () => {
    const clock = new FrameClock();
    clock.install();

    const { unmount } = render(
      <MatchScreen
        floor={2}
        onFinished={vi.fn()}
        onRetrySettingsSave={async () => true}
        onSettingsChange={async () => true}
        platform={{
          close: async () => undefined,
          getIdentity: async () => ({ kind: 'local', key: 'local-browser' }),
          getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
          haptic: async () => undefined,
          kind: 'browser',
          lockPortrait: async () => undefined,
          subscribeSafeArea: () => () => undefined,
        }}
        seed={73}
        settings={{ hapticsEnabled: true, soundEnabled: true }}
        settingsSaveFailed={false}
      />,
    );

    expect(aiSpies.createAiController).toHaveBeenCalledWith(AI_FLOOR_PROFILES[1], 73);
    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-floor', '2');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');

    unmount();
    expect(clock.pendingFrames).toBe(0);
  });
});
