// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchOutcome } from '../app/app-route';
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
    const first = vi.fn<(outcome: MatchOutcome) => Promise<void>>(
      async () => undefined,
    );
    const second = vi.fn<(outcome: MatchOutcome) => Promise<void>>(
      async () => undefined,
    );
    const unbindFirst = controller.bindFinish(first);
    const unbindSecond = controller.bindFinish(second, {
      floor: 2,
      encounterIndex: 1,
      wins: 1,
    });

    unbindFirst();
    expect(window.__TE_PPU_E2E__.currentMatch).toEqual({
      floor: 2,
      encounterIndex: 1,
      wins: 1,
    });
    await window.__TE_PPU_E2E__.finish('draw');
    await window.__TE_PPU_E2E__.finish('win', 321);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenNthCalledWith(1, { result: 'draw', durationTicks: 600 });
    expect(second).toHaveBeenNthCalledWith(2, { result: 'win', durationTicks: 321 });
    unbindSecond();
    expect(window.__TE_PPU_E2E__.currentMatch).toBeNull();
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

  it('lets browser tests choose a resolving or hanging close implementation', async () => {
    const controller = new E2EDriverController();
    cleanups.push(controller.install());
    const platform = createE2EPlatform(controller);

    window.__TE_PPU_E2E__.setCloseMode('hang');
    const pendingClose = platform.close();
    expect(window.__TE_PPU_E2E__.closeCount).toBe(1);
    expect(pendingClose).toBeInstanceOf(Promise);

    window.__TE_PPU_E2E__.setCloseMode('resolve');
    await platform.close();
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
