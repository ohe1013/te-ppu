// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPort } from './audio-port';
import { createAppLifecycleCoordinator } from './app-lifecycle';

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

describe('createAppLifecycleCoordinator', () => {
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibilityState,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pauses, resets held input, and suspends sound once on duplicate background signals', () => {
    const setPaused = vi.fn();
    const resetAll = vi.fn();
    const audio = createAudio();
    const countdowns: Array<number | null> = [];
    const lifecycle = createAppLifecycleCoordinator({
      audio,
      onCountdownChange: (value) => countdowns.push(value),
      resetAll,
      setPaused,
    });

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));

    expect(setPaused).toHaveBeenCalledTimes(1);
    expect(setPaused).toHaveBeenCalledWith('background', true);
    expect(resetAll).toHaveBeenCalledTimes(1);
    expect(audio.suspend).toHaveBeenCalledTimes(1);
    expect(countdowns).toEqual([null]);

    lifecycle.destroy();
  });

  it('shows 3, 2, 1 while paused and resumes audio before clearing the pause', async () => {
    const setPaused = vi.fn();
    const audio = createAudio();
    const countdowns: Array<number | null> = [];
    const lifecycle = createAppLifecycleCoordinator({
      audio,
      onCountdownChange: (value) => countdowns.push(value),
      resetAll: vi.fn(),
      setPaused,
    });

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(countdowns).toEqual([null]);

    window.dispatchEvent(new Event('focus'));
    expect(countdowns).toEqual([null, 3]);
    expect(setPaused).not.toHaveBeenCalledWith('background', false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(countdowns.at(-1)).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(countdowns.at(-1)).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(setPaused).not.toHaveBeenCalledWith('background', false);
    await vi.advanceTimersByTimeAsync(1);

    expect(audio.resume).toHaveBeenCalledTimes(1);
    expect(setPaused).toHaveBeenLastCalledWith('background', false);
    expect(countdowns.at(-1)).toBeNull();
    expect(vi.mocked(audio.resume).mock.invocationCallOrder[0])
      .toBeLessThan(setPaused.mock.invocationCallOrder.at(-1)!);

    lifecycle.destroy();
  });

  it('pairs page and focus signals, cancels a countdown on re-entry, and cleans up listeners', async () => {
    const setPaused = vi.fn();
    const resetAll = vi.fn();
    const audio = createAudio();
    const countdowns: Array<number | null> = [];
    const lifecycle = createAppLifecycleCoordinator({
      audio,
      onCountdownChange: (value) => countdowns.push(value),
      resetAll,
      setPaused,
    });

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('pageshow'));
    expect(countdowns).toEqual([null]);
    window.dispatchEvent(new Event('focus'));
    expect(countdowns.at(-1)).toBe(3);

    await vi.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new Event('blur'));
    expect(countdowns.at(-1)).toBeNull();
    expect(resetAll).toHaveBeenCalledTimes(2);
    expect(audio.suspend).toHaveBeenCalledTimes(2);

    lifecycle.destroy();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(setPaused).not.toHaveBeenCalledWith('background', false);
  });
});
