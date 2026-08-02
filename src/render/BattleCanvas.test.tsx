// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../core/index';

interface FakeApplicationProps {
  readonly children?: ReactNode;
  readonly height?: number;
  readonly preference?: string;
  readonly resolution?: number;
  readonly width?: number;
}

vi.mock('@pixi/react', () => ({
  Application: ({ height, preference, resolution, width }: FakeApplicationProps) => (
    <canvas
      data-height={height}
      data-preference={preference}
      data-resolution={resolution}
      data-testid="pixi-application"
      data-width={width}
    />
  ),
  extend: vi.fn(),
}));

vi.mock('pixi.js', () => ({
  Container: class Container {},
  Graphics: class Graphics {},
  Text: class Text {},
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

beforeEach(() => {
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BattleCanvas', () => {
  it('uses one WebGL application and publishes exact equal board metrics', () => {
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const view = createPublicMatchView(createMatch({ matchSeed: 7 }));
    const result = render(
      <BattleCanvas events={[]} selectedRow={null} view={view} />,
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
        events={[]}
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
});
