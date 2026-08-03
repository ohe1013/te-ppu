// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AssetManager } from '../assets';
import type { ProgressLoadResult, ProgressRepository, ProgressState } from '../progression';
import { PlatformError } from '../platform/apps-in-toss-platform';
import type { PlatformPort } from '../platform/platform-port';
import type { AppServices } from './app-services';
import { useBoot } from './use-boot';

const progress: ProgressState = {
  schemaVersion: 2,
  highestUnlockedFloor: 2,
  clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

function createPlatform(
  getIdentity: PlatformPort['getIdentity'],
  lockPortrait: PlatformPort['lockPortrait'] = async () => undefined,
): PlatformPort {
  return {
    kind: 'browser',
    getIdentity,
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    subscribeSafeArea: () => () => undefined,
    lockPortrait,
    haptic: async () => undefined,
    close: async () => undefined,
  };
}

function createRepository(load: () => Promise<ProgressLoadResult>): ProgressRepository {
  return {
    load,
    save: async () => ({ ok: true }),
  };
}

function createAssetManager(
  loadCommon: AssetManager['loadCommon'] = async () => 'fallback',
): AssetManager {
  return {
    loadCommon,
    loadFloor: async () => 'fallback',
    prefetchFloor: () => undefined,
    releaseFloor: () => undefined,
    getCommonAssets: () => null,
    getFloorAssets: () => null,
    destroy: () => undefined,
  };
}

const defaultAssetManager = createAssetManager();

function services(
  platform: PlatformPort,
  progressRepository: ProgressRepository,
  assetManager: AssetManager = defaultAssetManager,
): AppServices {
  return { platform, progressRepository, assetManager };
}

describe('useBoot', () => {
  it('starts portrait lock, identity, and progress loading concurrently', async () => {
    const calls: string[] = [];
    let finishPortraitLock: (() => void) | undefined;
    const portraitLock = new Promise<void>((resolve) => {
      finishPortraitLock = resolve;
    });
    const platform = createPlatform(
      async () => {
        calls.push('identity');
        return { kind: 'local', key: 'local-browser' };
      },
      () => {
        calls.push('portrait');
        return portraitLock;
      },
    );
    const repository = createRepository(async () => {
      calls.push('progress');
      return { ok: true, state: progress, recoveredFromCorruption: false };
    });

    const { result } = renderHook(() => useBoot(services(platform, repository)));

    expect(calls).toEqual(['portrait', 'identity', 'progress']);
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => finishPortraitLock?.());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({
      status: 'ready',
      identity: { kind: 'local', key: 'local-browser' },
      progress,
      notice: null,
    });
  });

  it.each([
    {
      name: 'continues with in-memory progress after a load failure',
      loadResult: {
        ok: false,
        state: progress,
        error: { code: 'READ_FAILED', message: 'Progress could not be read.' },
      } satisfies ProgressLoadResult,
    },
    {
      name: 'reports recovery after corrupt progress was backed up and reset',
      loadResult: {
        ok: true,
        state: progress,
        recoveredFromCorruption: true,
      } satisfies ProgressLoadResult,
    },
  ])('$name', async ({ loadResult }) => {
    const platform = createPlatform(async () => ({
      kind: 'local',
      key: 'local-browser',
    }));
    const repository = createRepository(async () => loadResult);
    const { result } = renderHook(() => useBoot(services(platform, repository)));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', progress });
    if (result.current.status !== 'ready') throw new Error('Expected ready boot state.');
    expect(result.current.notice).toEqual(expect.any(String));
    expect(result.current.notice).not.toHaveLength(0);
  });

  it.each([
    ['UPDATE_REQUIRED', 'UPDATE_REQUIRED'],
    ['INVALID_CATEGORY', 'INVALID_CATEGORY'],
  ] as const)('blocks boot for %s', async (errorCode, stateCode) => {
    const platform = createPlatform(async () => {
      throw new PlatformError(errorCode);
    });
    const repository = createRepository(async () => ({
      ok: true,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const { result } = renderHook(() => useBoot(services(platform, repository)));

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(result.current).toMatchObject({ status: 'blocked', code: stateCode });
  });

  it('retries a retryable SDK identity error', async () => {
    let attempt = 0;
    const platform = createPlatform(async () => {
      attempt += 1;
      if (attempt === 1) throw new PlatformError('RETRYABLE_SDK_ERROR');
      return { kind: 'apps-in-toss', key: 'user-7' };
    });
    const repository = createRepository(async () => ({
      ok: true,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const { result } = renderHook(() => useBoot(services(platform, repository)));

    await waitFor(() => expect(result.current.status).toBe('retryable-error'));
    if (result.current.status !== 'retryable-error') {
      throw new Error('Expected retryable boot state.');
    }
    act(() => result.current.status === 'retryable-error' && result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({
      status: 'ready',
      identity: { kind: 'apps-in-toss', key: 'user-7' },
    });
    expect(attempt).toBe(2);
  });

  it.each([
    ['a synchronous asset manager throw', () => {
      throw new Error('asset manager synchronous failure');
    }],
    ['a cached structural asset rejection', () => Promise.reject(new Error('structural manifest failure'))],
  ] as const)('reaches ready boot after %s', async (_name, loadCommon) => {
    const platform = createPlatform(async () => ({ kind: 'local', key: 'local-browser' }));
    const repository = createRepository(async () => ({
      ok: true,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const { result } = renderHook(() => useBoot(
      services(platform, repository, createAssetManager(loadCommon)),
    ));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({
      status: 'ready',
      identity: { kind: 'local', key: 'local-browser' },
      progress,
    });
  });
});
