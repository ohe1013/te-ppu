import type { PlatformPort, SafeArea } from '../platform/platform-port';
import type { E2EDriverController } from './e2e-driver';

const E2E_SAFE_AREA: SafeArea = {
  top: 2,
  right: 6,
  bottom: 8,
  left: 4,
};

function configuredSafeArea(): SafeArea {
  const configured = (globalThis as typeof globalThis & {
    __TE_PPU_E2E_SAFE_AREA__?: SafeArea;
  }).__TE_PPU_E2E_SAFE_AREA__;
  return configured ?? E2E_SAFE_AREA;
}

export function createE2EPlatform(
  controller: E2EDriverController,
): PlatformPort {
  return {
    kind: 'browser',
    async getIdentity() {
      return { kind: 'local', key: 'local-browser' };
    },
    getInitialSafeArea() {
      return configuredSafeArea();
    },
    subscribeSafeArea() {
      return () => undefined;
    },
    async lockPortrait() {},
    async haptic() {},
    async close() {
      await controller.close();
    },
  };
}
