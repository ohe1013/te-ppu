// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type GameEvent,
  type SideId,
} from '../core/index';
import type { AnimationEffect } from './event-animation-queue';

interface FakeApplicationProps {
  readonly children?: ReactNode;
  readonly height?: number;
  readonly preference?: string;
  readonly resolution?: number;
  readonly width?: number;
}

vi.mock('@pixi/react', () => ({
  Application: ({ children, height, preference, resolution, width }: FakeApplicationProps) => (
    <div
      data-height={height}
      data-preference={preference}
      data-resolution={resolution}
      data-testid="pixi-application"
      data-width={width}
    >
      {children}
    </div>
  ),
  extend: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Container: class Container {},
  Graphics: class Graphics {},
  Text: class Text {},
}));

vi.mock('./BoardScene', () => ({
  BoardScene: ({
    effectProgress,
    effects,
    side,
  }: {
    readonly effectProgress: number;
    readonly effects: readonly AnimationEffect[];
    readonly side: SideId;
  }) => (
    <div
      data-effect-ids={effects.map(({ id }) => id).join(',')}
      data-effect-progress={effectProgress}
      data-testid={`${side}-board-scene`}
    />
  ),
}));

import { BattleCanvas } from './BattleCanvas';

let notifyResize: ResizeObserverCallback;
const disconnect = vi.fn();
const observe = vi.fn();
const removeResolutionListener = vi.fn();

class TestResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = callback;
  }

  disconnect = disconnect;
  observe = observe;
  unobserve = vi.fn();
}

class EffectClock {
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;
  private timestamp = 0;

  install(): void {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => this.timestamp);
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
    act(() => {
      vi.advanceTimersByTime(milliseconds);
      const callbacks = [...this.callbacks.values()];
      this.callbacks.clear();
      for (const callback of callbacks) callback(this.timestamp);
    });
  }

  advanceTimersOnlyBy(milliseconds: number): void {
    this.timestamp += milliseconds;
    act(() => vi.advanceTimersByTime(milliseconds));
  }

  get pendingFrames(): number {
    return this.callbacks.size;
  }
}

beforeEach(() => {
  disconnect.mockClear();
  observe.mockClear();
  removeResolutionListener.mockClear();
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: '(resolution: 3dppx)',
    onchange: null,
    removeEventListener: removeResolutionListener,
    removeListener: vi.fn(),
  })));
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: 3,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BattleCanvas', () => {
  it('uses one WebGL application and publishes exact equal board metrics', () => {
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const result = render(
      <BattleCanvas eventBatches={[]} selectedRow={null} view={view} />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320,
      height: 320,
      left: 0,
      right: 328,
      toJSON: () => ({}),
      top: 0,
      width: 328,
      x: 0,
      y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    expect(screen.getAllByTestId('pixi-application')).toHaveLength(1);
    expect(screen.getByTestId('pixi-application')).toHaveAttribute(
      'data-preference',
      'webgl',
    );
    expect(screen.getByTestId('pixi-application')).toHaveAttribute(
      'data-resolution',
      '2',
    );
    expect(host).toHaveAttribute('data-player-width', '160');
    expect(host).toHaveAttribute('data-player-height', '320');
    expect(host).toHaveAttribute('data-opponent-width', '160');
    expect(host).toHaveAttribute('data-opponent-height', '320');

    result.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeWindowListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
    expect(removeResolutionListener).toHaveBeenCalledOnce();
  });

  it('mounts the player row selector exactly over the player board', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 9 }));
    render(
      <BattleCanvas
        eventBatches={[]}
        playerBoardOverlay={<div data-testid="player-board-overlay-content" />}
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320,
      height: 320,
      left: 0,
      right: 328,
      toJSON: () => ({}),
      top: 0,
      width: 328,
      x: 0,
      y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    const overlay = screen.getByTestId('player-board-overlay');
    expect(overlay).toHaveStyle({
      height: '320px',
      left: '0px',
      top: '0px',
      width: '160px',
    });
    expect(screen.getByTestId('player-board-overlay-content')).toBeVisible();
  });

  it('animates queued garbage events one at a time in FIFO slots', () => {
    const clock = new EffectClock();
    clock.install();
    const events: readonly GameEvent[] = [
      {
        amount: 1,
        column: 2,
        landingRow: 12,
        side: 'player',
        type: 'garbage-landed',
      },
      {
        amount: 1,
        column: 7,
        landingRow: 18,
        side: 'player',
        type: 'garbage-landed',
      },
    ];

    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );
    const playerScene = screen.getByTestId('player-board-scene');

    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-landed',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');

    clock.advanceBy(70);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-landed',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0.5');

    clock.advanceBy(70);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-landed',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '1');

    clock.advanceBy(16);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:1:garbage-landed',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');

    clock.advanceBy(70);
    expect(playerScene).toHaveAttribute('data-effect-progress', '0.5');

    clock.advanceBy(70);
    expect(playerScene).toHaveAttribute('data-effect-progress', '1');

    clock.advanceBy(16);
    expect(playerScene).toHaveAttribute('data-effect-ids', '');
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');
  });

  it('queues separate catch-up batches with the tick attached to each batch', () => {
    const clock = new EffectClock();
    clock.install();
    const latest = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const firstView = { ...latest, tick: 18 };
    const secondView = { ...latest, tick: 19 };
    render(
      <BattleCanvas
        eventBatches={[
          {
            events: [{ type: 'attack-sent', side: 'player', amount: 1 }],
            tick: 18,
            view: firstView,
          },
          {
            events: [{ type: 'item-used', side: 'opponent', item: 'queue-swap' }],
            tick: 19,
            view: secondView,
          },
        ]}
        selectedRow={null}
        view={secondView}
      />,
    );
    const playerScene = screen.getByTestId('player-board-scene');

    expect(playerScene).toHaveAttribute('data-effect-ids', 'tick-18:0:attack-sent');
    clock.advanceTimersOnlyBy(140);
    expect(playerScene).toHaveAttribute('data-effect-ids', 'tick-19:0:item-used');
  });

  it.each([
    { elapsed: 0, pending: 'progress' },
    { elapsed: 140, pending: 'dequeue' },
  ])('cancels the pending $pending frame and slot timer on unmount', ({ elapsed }) => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const events: readonly GameEvent[] = [{
      amount: 1,
      column: 4,
      landingRow: 18,
      side: 'player',
      type: 'garbage-landed',
    }];
    const result = render(
      <BattleCanvas
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );

    if (elapsed > 0) clock.advanceBy(elapsed);

    expect(clock.pendingFrames).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    result.unmount();

    expect(clock.pendingFrames).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('advances FIFO through the timer fallback when animation frames stall', () => {
    const clock = new EffectClock();
    clock.install();
    const events: readonly GameEvent[] = [
      {
        amount: 1,
        column: 2,
        landingRow: 12,
        side: 'player',
        type: 'garbage-landed',
      },
      {
        amount: 1,
        column: 7,
        landingRow: 18,
        side: 'player',
        type: 'garbage-landed',
      },
    ];

    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );
    const playerScene = screen.getByTestId('player-board-scene');

    clock.advanceTimersOnlyBy(190);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:1:garbage-landed',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');

    clock.advanceTimersOnlyBy(190);
    expect(playerScene).toHaveAttribute('data-effect-ids', '');
    expect(clock.pendingFrames).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
