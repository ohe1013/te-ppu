import { describe, expect, it, vi } from 'vitest';
import {
  createAndroidPlatform,
  type AndroidAppSdk,
  type AndroidBackListenerHandle,
} from './android-platform';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createFakeApp(options: { deferListener?: boolean } = {}) {
  let backListener: (() => void) | undefined;
  let exitCount = 0;
  let removeCount = 0;
  const pendingHandle = deferred<AndroidBackListenerHandle>();
  const handle: AndroidBackListenerHandle = {
    async remove() {
      removeCount += 1;
      backListener = undefined;
    },
  };

  const sdk: AndroidAppSdk = {
    async addListener(eventName, listener) {
      expect(eventName).toBe('backButton');
      backListener = listener;
      if (options.deferListener) return pendingHandle.promise;
      return handle;
    },
    async exitApp() {
      exitCount += 1;
    },
  };

  return {
    sdk,
    emitBack() {
      backListener?.();
    },
    resolveListener() {
      pendingHandle.resolve(handle);
    },
    get exitCount() {
      return exitCount;
    },
    get removeCount() {
      return removeCount;
    },
  };
}

describe('createAndroidPlatform', () => {
  it('provides the local Android fallback behavior without device-only side effects', async () => {
    const app = createFakeApp();
    const platform = createAndroidPlatform(app.sdk);

    expect(platform.kind).toBe('android');
    await expect(platform.getIdentity()).resolves.toEqual({
      kind: 'local',
      key: 'local-browser',
    });
    expect(platform.getInitialSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(platform.subscribeSafeArea(() => undefined)).toEqual(expect.any(Function));
    await expect(platform.lockPortrait()).resolves.toBeUndefined();
    await expect(platform.haptic('success')).resolves.toBeUndefined();
  });

  it('delivers back requests until cleanup and delegates confirmed app exit', async () => {
    const app = createFakeApp();
    const platform = createAndroidPlatform(app.sdk);
    const requests: number[] = [];

    const unsubscribe = platform.subscribeBackRequest?.(() => {
      requests.push(requests.length + 1);
    });
    await Promise.resolve();
    app.emitBack();
    unsubscribe?.();
    await Promise.resolve();
    app.emitBack();
    await platform.close();

    expect(requests).toEqual([1]);
    expect(app.removeCount).toBe(1);
    expect(app.exitCount).toBe(1);
  });

  it('removes a listener that resolves after its subscriber already cleaned up', async () => {
    const app = createFakeApp({ deferListener: true });
    const platform = createAndroidPlatform(app.sdk);
    const requests: number[] = [];

    const unsubscribe = platform.subscribeBackRequest?.(() => requests.push(1));
    unsubscribe?.();
    app.emitBack();
    app.resolveListener();
    await vi.waitFor(() => expect(app.removeCount).toBe(1));
    app.emitBack();

    expect(requests).toEqual([]);
  });
});
