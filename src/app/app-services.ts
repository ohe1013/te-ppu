import {
  createLocalProgressRepository,
  type ProgressRepository,
} from '../progression';
import { createAssetManager, type AssetManager } from '../assets';
import { createPlatform } from '../platform/create-platform';
import type { PlatformPort } from '../platform/platform-port';
import type { RuntimeMode } from './runtime-mode';

export interface AppServices {
  readonly platform: PlatformPort;
  readonly progressRepository: ProgressRepository;
  readonly assetManager: AssetManager;
}

export interface AppServiceOverrides {
  readonly platform?: PlatformPort;
  readonly progressRepository?: ProgressRepository;
  readonly assetManager?: AssetManager;
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
): AppServices {
  const assetManager = overrides.assetManager ?? createAssetManager({
    fetchManifest: fetchAssetJson,
    loadImage: loadAssetImage,
    loadAtlasJson: fetchAssetJson,
  });
  return {
    platform: overrides.platform ?? createPlatform(runtimeMode),
    progressRepository:
      overrides.progressRepository ?? createLocalProgressRepository(storage),
    assetManager,
  };
}
