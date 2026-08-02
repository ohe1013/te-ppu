import type { PlatformPort, SafeArea } from '../platform/platform-port';
import type { E2EDriverController } from './e2e-driver';

const E2E_SAFE_AREA: SafeArea = {
  top: 2,
  right: 6,
  bottom: 8,
  left: 4,
};

export function createE2EPlatform(
  controller: E2EDriverController,
): PlatformPort {
  return {
    kind: 'browser',
    async getIdentity() {
      return { kind: 'local', key: 'local-browser' };
    },
    getInitialSafeArea() {
      return E2E_SAFE_AREA;
    },
    subscribeSafeArea() {
      return () => undefined;
    },
    async lockPortrait() {},
    async haptic() {},
    async close() {
      controller.recordClose();
    },
  };
}
