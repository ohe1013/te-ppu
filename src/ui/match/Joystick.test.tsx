// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCommand } from '../../core/index';
import { InputResetBus } from './input-reset-bus';
import { Joystick } from './Joystick';

const POINTER_ID = 7;
const RECT: DOMRect = {
  bottom: 200,
  height: 200,
  left: 0,
  right: 200,
  top: 0,
  width: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function setup() {
  const commands: GameCommand[] = [];
  const resetBus = new InputResetBus();
  const view = render(
    <Joystick onCommand={(command) => commands.push(command)} resetBus={resetBus} />,
  );
  const control = screen.getByRole('group', { name: '이동 조이스틱' });
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  Object.defineProperties(control, {
    getBoundingClientRect: { configurable: true, value: () => RECT },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
    setPointerCapture: { configurable: true, value: setPointerCapture },
  });
  return { commands, control, releasePointerCapture, resetBus, setPointerCapture, ...view };
}

function pointerDown(control: HTMLElement, clientX: number, clientY: number) {
  fireEvent.pointerDown(control, {
    button: 0,
    clientX,
    clientY,
    isPrimary: true,
    pointerId: POINTER_ID,
  });
}

describe('Joystick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('uses one captured pointer path for immediate movement and releases on pointerup', () => {
    const { commands, control, releasePointerCapture, setPointerCapture } = setup();

    pointerDown(control, 121, 100);
    fireEvent.pointerMove(control, {
      clientX: 79,
      clientY: 100,
      pointerId: POINTER_ID,
    });
    fireEvent.pointerUp(control, { pointerId: POINTER_ID });
    act(() => vi.advanceTimersByTime(500));

    expect(setPointerCapture).toHaveBeenCalledWith(POINTER_ID);
    expect(releasePointerCapture).toHaveBeenCalledWith(POINTER_ID);
    expect(commands).toEqual([
      { type: 'move', dx: 1 },
      { type: 'move', dx: -1 },
    ]);
  });

  it.each([
    ['pointercancel', (control: HTMLElement) => fireEvent.pointerCancel(control, { pointerId: POINTER_ID })],
    ['lostpointercapture', (control: HTMLElement) => fireEvent.lostPointerCapture(control, { pointerId: POINTER_ID })],
    ['window blur', () => window.dispatchEvent(new Event('blur'))],
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
  ] as const)('releases soft drop on %s', (_name, cancel) => {
    const { commands, control } = setup();
    pointerDown(control, 100, 121);

    act(() => cancel(control));

    expect(commands).toEqual([
      { type: 'soft-drop', active: true },
      { type: 'soft-drop', active: false },
    ]);
  });

  it('lets the shared reset bus stop a held repeat', () => {
    const { commands, control, resetBus } = setup();
    pointerDown(control, 121, 100);

    act(() => resetBus.resetAll());
    act(() => vi.advanceTimersByTime(500));

    expect(commands).toEqual([{ type: 'move', dx: 1 }]);
  });

  it('releases held input during unmount cleanup', () => {
    const { commands, control, unmount } = setup();
    pointerDown(control, 100, 121);

    unmount();

    expect(commands).toEqual([
      { type: 'soft-drop', active: true },
      { type: 'soft-drop', active: false },
    ]);
  });
});
