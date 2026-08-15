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
import { battleAnimationFrameNames } from './battle-animation-registry';
import type { Rect } from './board-layout';
import type { AttackFeedbackPresentation } from '../ui/match/attack-feedback';

const pixiSpies = vi.hoisted(() => ({
  baseDestroy: vi.fn(),
  boardScene: vi.fn(),
  from: vi.fn(),
  textureDestroy: vi.fn(),
}));

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
  AnimatedSprite: class AnimatedSprite {},
  Container: class Container {},
  Graphics: class Graphics {},
  Rectangle: class Rectangle {
    constructor(_: number, __: number, ___: number, ____: number) {}
  },
  Sprite: class Sprite {},
  Text: class Text {},
  Texture: class Texture {
    static from = pixiSpies.from;
    source = {};
    destroy = pixiSpies.textureDestroy;
  },
}));

vi.mock('./BoardScene', () => ({
  BoardScene: ({
    atlas,
    effectProgress,
    effects,
    rect,
    reducedMotion,
    side,
  }: {
    readonly atlas?: Readonly<Record<string, unknown>> | null;
    readonly effectProgress: number;
    readonly effects: readonly AnimationEffect[];
    readonly rect: Rect;
    readonly reducedMotion?: boolean;
    readonly side: SideId;
  }) => {
    pixiSpies.boardScene({ atlas, effectProgress, effects, rect, reducedMotion, side });
    return (
      <div
        data-effect-ids={effects.map(({ id }) => id).join(',')}
        data-effect-progress={effectProgress}
        data-atlas-frame-count={Object.keys(atlas ?? {}).length}
        data-effect-snapshots={effects.map((effect) => (
          `${'tick' in effect ? effect.tick : 'missing'}/${
            'view' in effect ? effect.view.tick : 'missing'
          }`
        )).join(',')}
        data-reduced-motion={String(reducedMotion ?? false)}
        data-x={rect.x}
        data-y={rect.y}
        data-testid={`${side}-board-scene`}
      />
    );
  },
}));

import { BattleCanvas } from './BattleCanvas';

const launchFeedback: AttackFeedbackPresentation = {
  amount: 2,
  combo: 0,
  comboLabel: null,
  displacementPx: 4,
  id: 'attack:0:0',
  intensity: 'medium',
  phase: 'launch',
  phaseProgress: 0.5,
  reducedMotion: false,
  source: 'player',
  target: 'opponent',
};

const impactFeedback: AttackFeedbackPresentation = {
  ...launchFeedback,
  phase: 'impact',
  phaseProgress: 0.25,
};

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
  pixiSpies.baseDestroy.mockClear();
  pixiSpies.boardScene.mockClear();
  pixiSpies.from.mockReset();
  pixiSpies.from.mockReturnValue({ destroy: pixiSpies.baseDestroy, source: {} });
  pixiSpies.textureDestroy.mockClear();
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
      <BattleCanvas commandFeedback={[]} eventBatches={[]} selectedRow={null} view={view} />,
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
        commandFeedback={[]}
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

  it('animates queued garbage batches one at a time in FIFO slots', () => {
    const clock = new EffectClock();
    clock.install();
    const events: readonly GameEvent[] = [
      {
        amount: 2,
        holeColumns: [2, 4],
        side: 'player',
        type: 'garbage-raised',
      },
      {
        amount: 1,
        holeColumns: [7],
        side: 'player',
        type: 'garbage-raised',
      },
    ];

    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        commandFeedback={[]}
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );
    const playerScene = screen.getByTestId('player-board-scene');

    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-land',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');

    clock.advanceBy(5 / 24 * 1000 / 2);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-land',
    );
    expect(Number(playerScene.getAttribute('data-effect-progress'))).toBeCloseTo(0.5);

    clock.advanceBy(5 / 24 * 1000 / 2);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:1:garbage-land',
    );
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');

    clock.advanceBy(5 / 24 * 1000 / 2);
    expect(Number(playerScene.getAttribute('data-effect-progress'))).toBeCloseTo(0.5);

    clock.advanceBy(5 / 24 * 1000 / 2);
    expect(playerScene).toHaveAttribute('data-effect-ids', '');
    expect(playerScene).toHaveAttribute('data-effect-progress', '0');
  });

  it('does not create a projectile from an attack-sent event alone', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        commandFeedback={[]}
        eventBatches={[{ events: [{ amount: 1, side: 'player', type: 'attack-sent' }], tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );

    expect(screen.queryByTestId('attack-ribbon')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attack-shot-sprite')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attack-impact-ring')).not.toBeInTheDocument();
  });

  it.each([
    ['without an atlas', undefined],
    ['with an incomplete atlas', { 'attack-shot/00.png': {} }],
  ] as const)('renders exactly one procedural launch cue %s', (_name, atlas) => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        atlas={atlas as never}
        attackFeedback={launchFeedback}
        commandFeedback={[]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );

    expect(screen.getAllByTestId('attack-ribbon')).toHaveLength(1);
    expect(screen.queryByTestId('attack-shot-sprite')).not.toBeInTheDocument();
  });

  it('renders exactly one atlas sprite for the shared launch cue', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const atlas = Object.fromEntries(battleAnimationFrameNames('attack-shot').map((name) => [name, {}]));
    render(
      <BattleCanvas
        atlas={atlas as never}
        attackFeedback={launchFeedback}
        commandFeedback={[]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );

    expect(screen.getAllByTestId('attack-shot-sprite')).toHaveLength(1);
    expect(screen.queryByTestId('attack-ribbon')).not.toBeInTheDocument();
  });

  it('eases normal launch progress toward the target', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        attackFeedback={launchFeedback}
        commandFeedback={[]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320, height: 320, left: 0, right: 328, toJSON: () => ({}),
      top: 0, width: 328, x: 0, y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    expect(screen.getByTestId('attack-ribbon')).toHaveAttribute('x', '227');
  });

  it('keeps a reduced-motion launch cue at the target and changes only alpha', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const result = render(
      <BattleCanvas
        attackFeedback={{
          ...launchFeedback,
          displacementPx: 0,
          phaseProgress: 0.2,
          reducedMotion: true,
        }}
        commandFeedback={[]}
        eventBatches={[]}
        reducedMotion
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320, height: 320, left: 0, right: 328, toJSON: () => ({}),
      top: 0, width: 328, x: 0, y: 0,
    });
    act(() => notifyResize([], {} as ResizeObserver));
    const first = screen.getByTestId('attack-ribbon');
    const firstAlpha = Number(first.getAttribute('alpha'));

    result.rerender(
      <BattleCanvas
        attackFeedback={{
          ...launchFeedback,
          displacementPx: 0,
          phaseProgress: 0.8,
          reducedMotion: true,
        }}
        commandFeedback={[]}
        eventBatches={[]}
        reducedMotion
        selectedRow={null}
        view={view}
      />,
    );
    const second = screen.getByTestId('attack-ribbon');

    expect(first).toHaveAttribute('x', '248');
    expect(second).toHaveAttribute('x', '248');
    expect(Number(second.getAttribute('alpha'))).toBeGreaterThan(firstAlpha);
  });

  it('renders one impact ring and displaces only the target board', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        attackFeedback={impactFeedback}
        commandFeedback={[]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320, height: 320, left: 0, right: 328, toJSON: () => ({}),
      top: 0, width: 328, x: 0, y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    expect(screen.queryByTestId('attack-shot-sprite')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attack-ribbon')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('attack-impact-ring')).toHaveLength(1);
    expect(screen.getByTestId('attack-impact-ring')).toHaveAttribute('x', '248');
    expect(screen.getByTestId('player-board-scene')).toHaveAttribute('data-x', '0');
    expect(screen.getByTestId('opponent-board-scene')).toHaveAttribute('data-x', '171');
  });

  it('keeps the player overlay aligned with a player-target board nudge', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        attackFeedback={{
          ...impactFeedback,
          source: 'opponent',
          target: 'player',
        }}
        commandFeedback={[]}
        eventBatches={[]}
        playerBoardOverlay={<div />}
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320, height: 320, left: 0, right: 328, toJSON: () => ({}),
      top: 0, width: 328, x: 0, y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    expect(screen.getByTestId('player-board-scene')).toHaveAttribute('data-x', '-3');
    expect(screen.getByTestId('opponent-board-scene')).toHaveAttribute('data-x', '168');
    expect(screen.getByTestId('player-board-overlay')).toHaveStyle({ left: '-3px' });
  });

  it('keeps both boards still and forwards reduced motion during garbage rise', () => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        attackFeedback={{
          ...impactFeedback,
          displacementPx: 0,
          reducedMotion: true,
        }}
        commandFeedback={[]}
        eventBatches={[{
          events: [{ amount: 2, holeColumns: [2, 4], side: 'opponent', type: 'garbage-raised' }],
          tick: 0,
          view,
        }]}
        reducedMotion
        selectedRow={null}
        view={view}
      />,
    );
    const host = screen.getByTestId('battle-canvas');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      bottom: 320, height: 320, left: 0, right: 328, toJSON: () => ({}),
      top: 0, width: 328, x: 0, y: 0,
    });

    act(() => notifyResize([], {} as ResizeObserver));

    expect(screen.getByTestId('player-board-scene')).toHaveAttribute('data-x', '0');
    expect(screen.getByTestId('opponent-board-scene')).toHaveAttribute('data-x', '168');
    expect(screen.getByTestId('player-board-scene')).toHaveAttribute('data-reduced-motion', 'true');
    expect(screen.getByTestId('opponent-board-scene')).toHaveAttribute('data-reduced-motion', 'true');
  });

  it('owns Pixi wrappers for consumed AtlasData generations and releases them on replacement and unmount', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const atlas = (generation: number) => ({
      generation,
      image: {
        generation,
        ref: { path: 'effects/battle-atlas.png' },
        source: {} as ImageBitmap,
        url: '/assets/effects/battle-atlas.png',
      },
      json: {
        frames: {
          'attack-shot/00.png': {
            frame: { h: 64, w: 64, x: 0, y: 0 }, rotated: false, trimmed: false,
            sourceSize: { h: 64, w: 64 }, spriteSourceSize: { h: 64, w: 64, x: 0, y: 0 },
          },
        },
        meta: { format: 'RGBA8888' as const, image: 'battle-atlas.png' as const, scale: '1' as const, size: { h: 64, w: 64 } },
      },
    });
    const result = render(
      <BattleCanvas commandFeedback={[]} eventBatches={[]} selectedRow={null} view={view} atlas={atlas(1)} />,
    );
    result.rerender(
      <BattleCanvas commandFeedback={[]} eventBatches={[]} selectedRow={null} view={view} atlas={atlas(2)} />,
    );

    expect(pixiSpies.baseDestroy).toHaveBeenCalledWith(false);
    result.unmount();
    expect(pixiSpies.baseDestroy).toHaveBeenCalledTimes(2);
    expect(pixiSpies.textureDestroy).toHaveBeenCalledWith(false);
  });

  it('keeps independent decorative command effects alive while a later feedback frame arrives', () => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const result = render(
      <BattleCanvas
        commandFeedback={[{ command: { type: 'move', dx: -1 }, sequence: 1, side: 'player', tick: 1 }]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );
    result.rerender(
      <BattleCanvas
        commandFeedback={[{ command: { type: 'rotate-clockwise' }, sequence: 2, side: 'player', tick: 2 }]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );

    expect(screen.getByTestId('player-board-scene')).toHaveAttribute(
      'data-effect-ids', 'command-1:move-dust,command-2:rotate-spark',
    );
    clock.advanceBy(200);
    expect(screen.getByTestId('player-board-scene')).toHaveAttribute(
      'data-effect-ids', 'command-2:rotate-spark',
    );
  });

  it('retains every new command feedback effect from one frame', () => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        commandFeedback={[
          { command: { type: 'move', dx: -1 }, sequence: 1, side: 'player', tick: 1 },
          { command: { type: 'rotate-clockwise' }, sequence: 2, side: 'player', tick: 1 },
        ]}
        eventBatches={[]}
        selectedRow={null}
        view={view}
      />,
    );

    expect(screen.getByTestId('player-board-scene')).toHaveAttribute(
      'data-effect-ids', 'command-1:move-dust,command-2:rotate-spark',
    );
  });

  it('skips passive view refreshes while retaining effect and RAF refreshes', () => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const result = render(
      <BattleCanvas commandFeedback={[]} eventBatches={[]} selectedRow={null} view={view} />,
    );
    pixiSpies.boardScene.mockClear();

    const passiveView = { ...view, tick: view.tick + 1 };
    result.rerender(
      <BattleCanvas
        commandFeedback={[]}
        eventBatches={[]}
        selectedRow={null}
        view={passiveView}
      />,
    );

    expect(pixiSpies.boardScene).toHaveBeenCalledTimes(2);

    pixiSpies.boardScene.mockClear();
    result.rerender(
      <BattleCanvas
        commandFeedback={[{ command: { type: 'move', dx: -1 }, sequence: 1, side: 'player', tick: 1 }]}
        eventBatches={[]}
        selectedRow={null}
        view={passiveView}
      />,
    );

    expect(pixiSpies.boardScene).toHaveBeenCalledTimes(4);
    expect(clock.pendingFrames).toBe(1);

    pixiSpies.boardScene.mockClear();
    clock.advanceBy(16);
    expect(pixiSpies.boardScene).toHaveBeenCalledTimes(2);
    expect(clock.pendingFrames).toBe(1);
  });

  it('queues separate catch-up batches with the tick attached to each batch', () => {
    const clock = new EffectClock();
    clock.install();
    const latest = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const firstView = { ...latest, tick: 18 };
    const secondView = { ...latest, tick: 19 };
    render(
      <BattleCanvas
        commandFeedback={[]}
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

    expect(playerScene).toHaveAttribute('data-effect-ids', '');
    expect(screen.queryByTestId('attack-ribbon')).not.toBeInTheDocument();
    expect(playerScene).toHaveAttribute('data-effect-snapshots', '');
    clock.advanceBy(300);
    expect(playerScene).toHaveAttribute('data-effect-ids', '');
  });

  it.each([
    { elapsed: 0, pending: 'progress' },
    { elapsed: 208, pending: 'dequeue' },
  ])('cancels the pending $pending frame on unmount', ({ elapsed }) => {
    const clock = new EffectClock();
    clock.install();
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const events: readonly GameEvent[] = [{
      amount: 1,
      holeColumns: [4],
      side: 'player',
      type: 'garbage-raised',
    }];
    const result = render(
      <BattleCanvas
        commandFeedback={[]}
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );

    if (elapsed > 0) clock.advanceBy(elapsed);

    expect(clock.pendingFrames).toBe(1);
    expect(vi.getTimerCount()).toBe(0);

    result.unmount();

    expect(clock.pendingFrames).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains FIFO effects until RAF advances their presentation lifetime', () => {
    const clock = new EffectClock();
    clock.install();
    const events: readonly GameEvent[] = [
      {
        amount: 2,
        holeColumns: [2, 4],
        side: 'player',
        type: 'garbage-raised',
      },
      {
        amount: 1,
        holeColumns: [7],
        side: 'player',
        type: 'garbage-raised',
      },
    ];

    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    render(
      <BattleCanvas
        commandFeedback={[]}
        eventBatches={[{ events, tick: 0, view }]}
        selectedRow={null}
        view={view}
      />,
    );
    const playerScene = screen.getByTestId('player-board-scene');

    clock.advanceTimersOnlyBy(5 / 24 * 1000 + 50);
    expect(playerScene).toHaveAttribute(
      'data-effect-ids',
      'tick-0:0:garbage-land',
    );
    clock.advanceBy(5 / 24 * 1000);
    expect(playerScene).toHaveAttribute('data-effect-ids', 'tick-0:1:garbage-land');
    expect(clock.pendingFrames).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
