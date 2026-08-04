// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetManager, FloorAssetBundle } from './types';
import type { Floor } from '../progression';
import { useFloorAssets } from './use-floor-assets';

function bundle(floor: 1 | 2 | 3 | 4 | 5): FloorAssetBundle {
  return { floor, generation: floor, music: 'early-floors', opponent: 'quartermaster', portraits: {} };
}

function Probe({ floor, manager }: { readonly floor: 1 | 2 | 3 | 4 | 5 | null; readonly manager: AssetManager }) {
  const assets = useFloorAssets(manager, floor);
  return <output data-testid="bundle">{assets === null ? 'none' : `${assets.floor}:${assets.generation}`}</output>;
}

function managerFor(overrides: Partial<AssetManager> = {}): AssetManager {
  return {
    destroy: vi.fn(),
    getCommonAssets: vi.fn(() => null),
    getFloorAssets: vi.fn((floor) => bundle(floor)),
    loadCommon: vi.fn(async () => 'fallback' as const),
    loadFloor: vi.fn(async () => 'ready' as const),
    prefetchFloor: vi.fn(),
    releaseFloor: vi.fn(),
    ...overrides,
  };
}

afterEach(() => document.body.replaceChildren());

describe('useFloorAssets', () => {
  it('loads the requested floor, prefetches one valid next floor, and releases the obsolete request', async () => {
    const manager = managerFor();
    const result = render(<Probe floor={3} manager={manager} />);

    await waitFor(() => expect(manager.loadFloor).toHaveBeenCalledWith(3));
    expect(manager.prefetchFloor).toHaveBeenCalledWith(4);
    await waitFor(() => expect(result.getByTestId('bundle')).toHaveTextContent('3'));

    result.rerender(<Probe floor={4} manager={manager} />);
    expect(result.getByTestId('bundle')).toHaveTextContent('none');
    await waitFor(() => expect(manager.releaseFloor).toHaveBeenCalledWith(3));
  });

  it('does no work for null and ignores a stale completion after the route changes', async () => {
    let complete!: () => void;
    const pending = new Promise<'ready'>((resolve) => { complete = () => resolve('ready'); });
    const manager = managerFor({ loadFloor: vi.fn(() => pending) });
    const result = render(<Probe floor={2} manager={manager} />);

    expect(manager.loadFloor).toHaveBeenCalledWith(2);
    result.rerender(<Probe floor={null} manager={manager} />);
    expect(result.getByTestId('bundle')).toHaveTextContent('none');
    await act(async () => complete());

    expect(result.getByTestId('bundle')).toHaveTextContent('none');
    expect(manager.loadFloor).toHaveBeenCalledTimes(1);
    expect(manager.prefetchFloor).toHaveBeenCalledTimes(1);
  });

  it('does not re-expose a released bundle when returning to the same floor before its new load settles', async () => {
    let finishReentry!: () => void;
    const reentry = new Promise<'ready'>((resolve) => { finishReentry = () => resolve('ready'); });
    const released = bundle(2);
    const reloaded = { ...bundle(2), generation: 22 };
    const manager = managerFor({
      getFloorAssets: vi.fn()
        .mockReturnValueOnce(released)
        .mockReturnValue(reloaded),
      loadFloor: vi.fn()
        .mockResolvedValueOnce('ready' as const)
        .mockImplementationOnce(() => reentry),
    });
    const result = render(<Probe floor={2} manager={manager} />);

    await waitFor(() => expect(result.getByTestId('bundle')).toHaveTextContent('2:2'));
    result.rerender(<Probe floor={null} manager={manager} />);
    await waitFor(() => expect(manager.releaseFloor).toHaveBeenCalledWith(2));

    result.rerender(<Probe floor={2} manager={manager} />);
    expect(result.getByTestId('bundle')).toHaveTextContent('none');

    await act(async () => finishReentry());
    await waitFor(() => expect(result.getByTestId('bundle')).toHaveTextContent('2:22'));
  });

  it('publishes successful cached references after fallback and locally catches structural rejection', async () => {
    const manager = managerFor({
      getFloorAssets: (floor) => floor === 2 ? bundle(2) : null,
      loadFloor: vi.fn(async (floor: Floor) => {
        if (floor === 3) throw new Error('invalid cached manifest');
        return 'fallback' as const;
      }),
    });
    const result = render(<Probe floor={2} manager={manager} />);

    await waitFor(() => expect(result.getByTestId('bundle')).toHaveTextContent('2'));
    result.rerender(<Probe floor={3} manager={manager} />);
    await waitFor(() => expect(manager.loadFloor).toHaveBeenCalledWith(3));
    expect(result.getByTestId('bundle')).toHaveTextContent('none');
  });
});
