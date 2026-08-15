import type { PlatformPort, SafeArea, UserIdentity } from './platform-port';

const ZERO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

export interface BrowserPlatform extends PlatformPort {
  readonly kind: 'browser';
  readonly closeRequestCount: number;
}

export function createBrowserPlatform(): BrowserPlatform {
  let closeRequestCount = 0;

  return {
    kind: 'browser',

    get closeRequestCount() {
      return closeRequestCount;
    },

    async getIdentity(): Promise<UserIdentity> {
      return { kind: 'local', key: 'local-browser' };
    },

    getInitialSafeArea(): SafeArea {
      return ZERO_SAFE_AREA;
    },

    subscribeSafeArea(): () => void {
      return () => undefined;
    },

    async lockPortrait(): Promise<void> {},

    async haptic(): Promise<void> {},

    async close(): Promise<void> {
      closeRequestCount += 1;
    },
  };
}
