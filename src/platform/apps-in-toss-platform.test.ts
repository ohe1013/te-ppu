import { describe, expect, it } from 'vitest';
import { PlatformError, createAppsInTossPlatform } from './apps-in-toss-platform';
import { createBrowserPlatform } from './browser-platform';
import { createPlatform } from './create-platform';

type FakeUserKeyResult =
  | undefined
  | 'INVALID_CATEGORY'
  | 'ERROR'
  | { type: 'HASH'; hash: string };

const initialSafeArea = { top: 47, right: 3, bottom: 21, left: 2 };

function fakeSdk(userKeyResult: FakeUserKeyResult) {
  let safeAreaListener: ((value: typeof initialSafeArea) => void) | null = null;
  const orientationCalls: Array<{ type: 'portrait' | 'landscape' }> = [];
  const hapticCalls: string[] = [];
  let closeCount = 0;
  let cleanupCount = 0;

  return {
    sdk: {
      SafeAreaInsets: {
        get: () => initialSafeArea,
        subscribe: ({ onEvent }: { onEvent: (value: typeof initialSafeArea) => void }) => {
          safeAreaListener = onEvent;
          return () => {
            cleanupCount += 1;
            safeAreaListener = null;
          };
        },
      },
      closeView: async () => {
        closeCount += 1;
      },
      generateHapticFeedback: async ({ type }: { type: string }) => {
        hapticCalls.push(type);
      },
      getUserKeyForGame: async () => userKeyResult,
      setDeviceOrientation: async (value: { type: 'portrait' | 'landscape' }) => {
        orientationCalls.push(value);
      },
    },
    state: {
      emitSafeArea(value: typeof initialSafeArea) {
        safeAreaListener?.(value);
      },
      get cleanupCount() {
        return cleanupCount;
      },
      get closeCount() {
        return closeCount;
      },
      hapticCalls,
      orientationCalls,
    },
  };
}

describe('createAppsInTossPlatform', () => {
  it.each([
    [undefined, 'UPDATE_REQUIRED'],
    ['INVALID_CATEGORY', 'INVALID_CATEGORY'],
    ['ERROR', 'RETRYABLE_SDK_ERROR'],
    [{ type: 'HASH', hash: '' }, 'RETRYABLE_SDK_ERROR'],
    [{ type: 'HASH', hash: '   ' }, 'RETRYABLE_SDK_ERROR'],
  ] as const)('maps unusable SDK identity %j without silently creating a local identity', async (sdkResult, code) => {
    const { sdk } = fakeSdk(sdkResult);
    const port = createAppsInTossPlatform(sdk);

    const result = await port.getIdentity().catch((error: unknown) => error);
    expect(result).toBeInstanceOf(PlatformError);
    expect(result).toMatchObject({ code });
    expect(result).not.toMatchObject({ kind: 'local' });
  });

  it('maps a rejected identity SDK call to a retryable platform error without returning local identity', async () => {
    const { sdk } = fakeSdk({ type: 'HASH', hash: 'user-7' });
    sdk.getUserKeyForGame = async () => Promise.reject(new Error('SDK unavailable'));
    const result = await createAppsInTossPlatform(sdk).getIdentity().catch((error: unknown) => error);

    expect(result).toBeInstanceOf(PlatformError);
    expect(result).toMatchObject({ code: 'RETRYABLE_SDK_ERROR' });
    expect(result).not.toMatchObject({ kind: 'local' });
  });

  it('preserves every nonblank hash byte-for-byte', async () => {
    const { sdk } = fakeSdk({ type: 'HASH', hash: ' user/%\uC0AC\uC6A9\uC790 ' });
    const port = createAppsInTossPlatform(sdk);

    await expect(port.getIdentity()).resolves.toEqual({
      kind: 'apps-in-toss',
      key: ' user/%\uC0AC\uC6A9\uC790 ',
    });
  });

  it('forwards safe-area updates and returns the SDK cleanup', () => {
    const { sdk, state } = fakeSdk({ type: 'HASH', hash: 'user-7' });
    const port = createAppsInTossPlatform(sdk);
    const received: typeof initialSafeArea[] = [];

    expect(port.getInitialSafeArea()).toEqual(initialSafeArea);
    const cleanup = port.subscribeSafeArea((value) => received.push(value));
    state.emitSafeArea({ top: 51, right: 4, bottom: 22, left: 3 });
    cleanup();
    state.emitSafeArea({ top: 55, right: 5, bottom: 23, left: 4 });

    expect(received).toEqual([{ top: 51, right: 4, bottom: 22, left: 3 }]);
    expect(state.cleanupCount).toBe(1);
  });

  it('forwards portrait, haptic, and close effects', async () => {
    const { sdk, state } = fakeSdk({ type: 'HASH', hash: 'user-7' });
    const port = createAppsInTossPlatform(sdk);

    await port.lockPortrait();
    await port.haptic('success');
    await port.close();

    expect(state.orientationCalls).toEqual([{ type: 'portrait' }]);
    expect(state.hapticCalls).toEqual(['success']);
    expect(state.closeCount).toBe(1);
  });

});

describe('browser platform selection', () => {
  it('uses a local identity, zero insets, and an in-memory close marker', async () => {
    const port = createBrowserPlatform();

    await expect(port.getIdentity()).resolves.toEqual({
      kind: 'local',
      key: 'local-browser',
    });
    expect(port.getInitialSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(port.closeRequestCount).toBe(0);
    await port.close();
    expect(port.closeRequestCount).toBe(1);
  });

  it('selects a distinct platform port for every runtime mode', () => {
    expect(createPlatform('browser').kind).toBe('browser');
    expect(createPlatform('apps-in-toss').kind).toBe('apps-in-toss');
    expect(createPlatform('android').kind).toBe('android');
  });
});
