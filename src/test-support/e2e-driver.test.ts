// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '../app/app-route';
import { E2EDriverController } from './e2e-driver';
import { createE2EPlatform } from './e2e-platform';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe('E2E driver', () => {
  it('installs a typed global and binds only the active match finisher', async () => {
    const controller = new E2EDriverController();
    cleanups.push(controller.install());
    const first = vi.fn<(result: MatchResult) => Promise<void>>(
      async () => undefined,
    );
    const second = vi.fn<(result: MatchResult) => Promise<void>>(
      async () => undefined,
    );
    const unbindFirst = controller.bindFinish(first);
    const unbindSecond = controller.bindFinish(second);

    unbindFirst();
    await window.__TE_PPU_E2E__.finish('draw');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith('draw');
    unbindSecond();
    await expect(window.__TE_PPU_E2E__.finish('win')).rejects.toThrow(
      'No E2E match is currently active.',
    );
  });

  it('copies dispatched commands and counts platform close requests', async () => {
    const controller = new E2EDriverController();
    cleanups.push(controller.install());
    const platform = createE2EPlatform(controller);
    controller.recordCommand({ type: 'move', dx: -1 });

    const snapshot = window.__TE_PPU_E2E__.dispatchedCommands as {
      type: string;
      dx?: number;
    }[];
    snapshot[0]!.dx = 1;
    await platform.close();
    await platform.close();

    expect(window.__TE_PPU_E2E__.dispatchedCommands).toEqual([
      { type: 'move', dx: -1 },
    ]);
    expect(window.__TE_PPU_E2E__.closeCount).toBe(2);
  });

  it('signals hidden and visible lifecycle states through visibilitychange', () => {
    const controller = new E2EDriverController();
    cleanups.push(controller.install());
    const seen: string[] = [];
    document.addEventListener('visibilitychange', () => {
      seen.push(document.visibilityState);
    });

    window.__TE_PPU_E2E__.setLifecycle('hidden');
    window.__TE_PPU_E2E__.setLifecycle('visible');

    expect(seen).toEqual(['hidden', 'visible']);
  });
});
