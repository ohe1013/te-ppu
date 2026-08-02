import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCommand } from '../../core/index';
import { InputResetBus } from './input-reset-bus';
import { JoystickController } from './joystick-controller';

describe('JoystickController', () => {
  let commands: GameCommand[];
  let controller: JoystickController;

  beforeEach(() => {
    vi.useFakeTimers();
    commands = [];
    controller = new JoystickController((command) => commands.push(command));
  });

  afterEach(() => {
    controller.release();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps the inner 20 percent neutral, then repeats horizontal movement at 160/50 ms', () => {
    controller.update(20, 0, 100);
    expect(commands).toEqual([]);

    controller.update(21, 0, 100);
    expect(commands).toEqual([{ type: 'move', dx: 1 }]);

    vi.advanceTimersByTime(159);
    expect(commands).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(commands).toEqual([
      { type: 'move', dx: 1 },
      { type: 'move', dx: 1 },
    ]);
    vi.advanceTimersByTime(49);
    expect(commands).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(commands.at(-1)).toEqual({ type: 'move', dx: 1 });

    controller.update(0, 0, 100);
    vi.advanceTimersByTime(250);
    expect(commands).toHaveLength(3);
  });

  it('chooses horizontal movement when the absolute axes tie', () => {
    controller.update(21, 21, 100);
    expect(commands).toEqual([{ type: 'move', dx: 1 }]);

    controller.update(-21, 21, 100);
    expect(commands).toEqual([
      { type: 'move', dx: 1 },
      { type: 'move', dx: -1 },
    ]);
  });

  it('activates soft drop once past the down threshold and deactivates it before leaving', () => {
    controller.update(0, 20, 100);
    expect(commands).toEqual([]);

    controller.update(0, 21, 100);
    controller.update(0, 70, 100);
    expect(commands).toEqual([{ type: 'soft-drop', active: true }]);

    controller.update(21, 0, 100);
    expect(commands).toEqual([
      { type: 'soft-drop', active: true },
      { type: 'soft-drop', active: false },
      { type: 'move', dx: 1 },
    ]);
  });

  it('hard drops once above 80 percent and rearms only after neutral or release', () => {
    controller.update(0, -80, 100);
    expect(commands).toEqual([]);

    controller.update(0, -81, 100);
    controller.update(0, -95, 100);
    controller.update(30, 0, 100);
    controller.update(0, -90, 100);
    expect(commands.filter(({ type }) => type === 'hard-drop')).toHaveLength(1);

    controller.update(0, -20, 100);
    controller.update(0, -81, 100);
    expect(commands.filter(({ type }) => type === 'hard-drop')).toHaveLength(2);

    controller.release();
    controller.update(0, -81, 100);
    expect(commands.filter(({ type }) => type === 'hard-drop')).toHaveLength(3);
  });

  it('reverses immediately and restarts the repeat delay for the new direction', () => {
    controller.update(21, 0, 100);
    vi.advanceTimersByTime(100);
    controller.update(-21, 0, 100);

    expect(commands).toEqual([
      { type: 'move', dx: 1 },
      { type: 'move', dx: -1 },
    ]);
    vi.advanceTimersByTime(159);
    expect(commands).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(commands.at(-1)).toEqual({ type: 'move', dx: -1 });
    vi.advanceTimersByTime(50);
    expect(commands.at(-1)).toEqual({ type: 'move', dx: -1 });
    expect(commands.filter((command) => command.type === 'move' && command.dx === 1)).toHaveLength(1);
  });

  it('release cancels repeats and emits one soft-drop release', () => {
    controller.update(0, 21, 100);
    controller.release();
    controller.release();
    vi.advanceTimersByTime(250);

    expect(commands).toEqual([
      { type: 'soft-drop', active: true },
      { type: 'soft-drop', active: false },
    ]);
  });
});

describe('InputResetBus', () => {
  it('resets every registered input and honors unregister cleanup', () => {
    const bus = new InputResetBus();
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = bus.register(first);
    bus.register(second);

    bus.resetAll();
    unregisterFirst();
    bus.resetAll();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
