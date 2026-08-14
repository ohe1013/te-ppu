import {
  createDevClearedProgressRepositoryFactory,
  createLocalProgressRepositoryFactory,
  type ProgressRepositoryFactory,
} from '../progression';
import { createAssetManager, type AssetManager } from '../assets';
import {
  createLeaderboardRepository,
  type LeaderboardRepository,
} from '../leaderboard';
import { createPlatform } from '../platform/create-platform';
import type { AudioPort } from '../platform/audio-port';
import type { PlatformPort } from '../platform/platform-port';
import { createWebAudioPort } from '../platform/web-audio-port';
import type { RuntimeMode } from './runtime-mode';

export interface AppServices {
  readonly audioPort: AudioPort;
  readonly platform: PlatformPort;
  readonly progressRepositoryFactory: ProgressRepositoryFactory;
  readonly assetManager: AssetManager;
  readonly leaderboardRepository?: LeaderboardRepository;
}

export interface AppServiceOverrides {
  readonly audioPort?: AudioPort;
  readonly platform?: PlatformPort;
  readonly progressRepositoryFactory?: ProgressRepositoryFactory;
  readonly assetManager?: AssetManager;
  readonly leaderboardRepository?: LeaderboardRepository;
  readonly firebaseEnv?: Record<string, string | boolean | undefined>;
}

export interface AppServiceOptions {
  readonly devClearedProgress?: boolean;
}

async function fetchAssetJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Asset request failed with status ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

async function loadAssetImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  return image;
}

export function createAppServices(
  runtimeMode: RuntimeMode,
  storage: Storage = window.localStorage,
  overrides: AppServiceOverrides = {},
  options: AppServiceOptions = {},
): AppServices & { readonly leaderboardRepository: LeaderboardRepository } {
  const assetManager = overrides.assetManager ?? createAssetManager({
    fetchManifest: fetchAssetJson,
    loadImage: loadAssetImage,
    loadAtlasJson: fetchAssetJson,
  });
  const audioPort = overrides.audioPort ?? createWebAudioPort({
    resolveSources: () => assetManager.getCommonAssets()?.audio ?? null,
  });
  return {
    audioPort,
    platform: overrides.platform ?? createPlatform(runtimeMode),
    progressRepositoryFactory: overrides.progressRepositoryFactory
      ?? (options.devClearedProgress
        ? createDevClearedProgressRepositoryFactory(storage)
        : createLocalProgressRepositoryFactory(storage)),
    assetManager,
    leaderboardRepository: overrides.leaderboardRepository
      ?? createLeaderboardRepository(overrides.firebaseEnv ?? import.meta.env),
  };
}
