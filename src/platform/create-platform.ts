import type { RuntimeMode } from '../app/runtime-mode';
import { createAppsInTossPlatform } from './apps-in-toss-platform';
import { createBrowserPlatform } from './browser-platform';
import type { PlatformPort } from './platform-port';

export function createPlatform(runtimeMode: RuntimeMode): PlatformPort {
  if (runtimeMode === 'browser') return createBrowserPlatform();
  return createAppsInTossPlatform();
}
