import {
  createLocalProgressRepository,
  type ProgressRepository,
} from '../progression';
import { createPlatform } from '../platform/create-platform';
import type { PlatformPort } from '../platform/platform-port';
import type { RuntimeMode } from './runtime-mode';

export interface AppServices {
  readonly platform: PlatformPort;
  readonly progressRepository: ProgressRepository;
}

export interface AppServiceOverrides {
  readonly platform?: PlatformPort;
  readonly progressRepository?: ProgressRepository;
}

export function createAppServices(
  runtimeMode: RuntimeMode,
  storage: Storage = window.localStorage,
  overrides: AppServiceOverrides = {},
): AppServices {
  return {
    platform: overrides.platform ?? createPlatform(runtimeMode),
    progressRepository:
      overrides.progressRepository ?? createLocalProgressRepository(storage),
  };
}
