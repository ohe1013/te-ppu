// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AssetManager } from '../assets';
import type { AudioPort } from '../platform/audio-port';
import type {
  ProgressLoadResult,
  ProgressRepository,
  ProgressRepositoryFactory,
  ProgressState,
} from '../progression';
import { PlatformError } from '../platform/apps-in-toss-platform';
import type { PlatformPort, UserIdentity } from '../platform/platform-port';
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
const defaultAudioPort: AudioPort = {
  destroy: async () => undefined,
  play: () => undefined,
  resume: async () => undefined,
  setEnabled: () => undefined,
  setMusic: async () => undefined,
  suspend: async () => undefined,
  unlock: async () => undefined,
};

const factories = new WeakMap<ProgressRepository, ProgressRepositoryFactory>();

function factoryFor(repository: ProgressRepository): ProgressRepositoryFactory {
  const cached = factories.get(repository);
  if (cached !== undefined) return cached;
  const factory = { forIdentity: () => repository };
  factories.set(repository, factory);
  return factory;
}

function services(
  platform: PlatformPort,
  progressRepository: ProgressRepository,
  assetManager: AssetManager = defaultAssetManager,
  audioPort: AudioPort = defaultAudioPort,
): AppServices {
  return {
    audioPort,
    platform,
    progressRepositoryFactory: factoryFor(progressRepository),
    assetManager,
  };
}

function servicesWithFactory(
  platform: PlatformPort,
  progressRepositoryFactory: ProgressRepositoryFactory,
  assetManager: AssetManager = defaultAssetManager,
  audioPort: AudioPort = defaultAudioPort,
): AppServices {
  return {
    audioPort,
    platform,
    progressRepositoryFactory,
    assetManager,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useBoot', () => {
  it('starts portrait and common assets before selecting progress after identity resolves', async () => {
    const identity = deferred<UserIdentity>();
    const load = vi.fn(async () => ({
      ok: true as const,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const repository = createRepository(load);
    const forIdentity = vi.fn(() => repository);
    const progressRepositoryFactory = { forIdentity };
    const lockPortrait = vi.fn(async () => undefined);
    const platform = createPlatform(() => identity.promise, lockPortrait);
    const assetManager = createAssetManager(vi.fn(async () => 'fallback' as const));

    const { result } = renderHook(() => useBoot(servicesWithFactory(
      platform,
      progressRepositoryFactory,
      assetManager,
    )));

    expect(lockPortrait).toHaveBeenCalledOnce();
    await act(async () => { await Promise.resolve(); });
    expect(assetManager.loadCommon).toHaveBeenCalledOnce();
    expect(forIdentity).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();

    await act(async () => identity.resolve({ kind: 'apps-in-toss', key: 'user-7' }));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(forIdentity).toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-7' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('Expected ready boot state.');
    expect(result.current.progressRepository).toBe(repository);
  });

  it('does not select progress for a retryable identity failure before retry succeeds', async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const repository = createRepository(load);
    const forIdentity = vi.fn(() => repository);
    let progressRepositoryFactory = { forIdentity };
    let attempt = 0;
    const platform = createPlatform(async () => {
      attempt += 1;
      if (attempt === 1) throw new PlatformError('RETRYABLE_SDK_ERROR');
      return { kind: 'apps-in-toss', key: 'user-7' };
    });
    const { result } = renderHook(() => useBoot(servicesWithFactory(
      platform,
      progressRepositoryFactory,
    )));

    await waitFor(() => expect(result.current.status).toBe('retryable-error'));
    expect(forIdentity).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    if (result.current.status !== 'retryable-error') throw new Error('Expected retryable boot state.');
    const retry = result.current.retry;
    act(() => retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(forIdentity).toHaveBeenCalledTimes(1);
    expect(forIdentity).toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-7' });
  });

  it('rejects a stale identity completion before repository selection in StrictMode', async () => {
    const firstIdentity = deferred<UserIdentity>();
    const secondIdentity = deferred<UserIdentity>();
    const getIdentity = vi.fn()
      .mockImplementationOnce(() => firstIdentity.promise)
      .mockImplementationOnce(() => secondIdentity.promise);
    const currentLoad = vi.fn(async () => ({
      ok: true as const,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const staleLoad = vi.fn(async () => ({
      ok: true as const,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const currentRepository = createRepository(currentLoad);
    const staleRepository = createRepository(staleLoad);
    const forIdentity = vi.fn((identity: UserIdentity) => (
      identity.key === 'user-current' ? currentRepository : staleRepository
    ));
    let progressRepositoryFactory = { forIdentity };
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

    const platform = createPlatform(getIdentity);
    const { rerender } = renderHook(() => useBoot(servicesWithFactory(
      platform,
      progressRepositoryFactory,
    )), { wrapper });

    await waitFor(() => expect(getIdentity).toHaveBeenCalledOnce());
    progressRepositoryFactory = { forIdentity };
    rerender();
    await waitFor(() => expect(getIdentity).toHaveBeenCalledTimes(2));
    await act(async () => secondIdentity.resolve({ kind: 'apps-in-toss', key: 'user-current' }));
    await waitFor(() => expect(forIdentity).toHaveBeenCalledOnce());
    await act(async () => firstIdentity.resolve({ kind: 'apps-in-toss', key: 'user-stale' }));
    await act(async () => { await Promise.resolve(); });

    expect(forIdentity).toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-current' });
    expect(forIdentity).not.toHaveBeenCalledWith({ kind: 'apps-in-toss', key: 'user-stale' });
    expect(currentLoad).toHaveBeenCalledOnce();
    expect(staleLoad).not.toHaveBeenCalled();
  });

  it('starts portrait lock and identity before progress loading after identity resolves', async () => {
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

    expect(calls).toEqual(['portrait', 'identity']);
    expect(result.current).toEqual({ status: 'loading' });
    await act(async () => { await Promise.resolve(); });
    expect(calls).toEqual(['portrait', 'identity', 'progress']);
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
  ] as const)('blocks boot for %s without selecting progress', async (errorCode, stateCode) => {
    const platform = createPlatform(async () => {
      throw new PlatformError(errorCode);
    });
    const load = vi.fn(async () => ({
      ok: true as const,
      state: progress,
      recoveredFromCorruption: false,
    }));
    const repository = createRepository(load);
    const forIdentity = vi.fn(() => repository);
    const progressRepositoryFactory = { forIdentity };
    const { result } = renderHook(() => useBoot(servicesWithFactory(
      platform,
      progressRepositoryFactory,
    )));

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(result.current).toMatchObject({ status: 'blocked', code: stateCode });
    expect(forIdentity).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
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
    const forIdentity = vi.fn(() => repository);
    const progressRepositoryFactory = { forIdentity };
    const assetManager = createAssetManager(loadCommon);
    const { result } = renderHook(() => useBoot(
      servicesWithFactory(platform, progressRepositoryFactory, assetManager),
    ));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({
      status: 'ready',
      identity: { kind: 'local', key: 'local-browser' },
      progress,
    });
    expect(forIdentity).toHaveBeenCalledOnce();
  });
});
