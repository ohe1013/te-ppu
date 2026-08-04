import {
  createLocalProgressRepository,
  type ProgressRepository,
} from '../progression';
import { createAssetManager, type AssetManager } from '../assets';
import { createPlatform } from '../platform/create-platform';
import type { AudioPort } from '../platform/audio-port';
import type { PlatformPort } from '../platform/platform-port';
import { createWebAudioPort } from '../platform/web-audio-port';
import type { RuntimeMode } from './runtime-mode';

export interface AppServices {
  readonly audioPort: AudioPort;
  readonly platform: PlatformPort;
  readonly progressRepository: ProgressRepository;
  readonly assetManager: AssetManager;
}

export interface AppServiceOverrides {
  readonly audioPort?: AudioPort;
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
  const audioPort = overrides.audioPort ?? createWebAudioPort({
    resolveSources: () => assetManager.getCommonAssets()?.audio ?? null,
  });
  return {
    audioPort,
    platform: overrides.platform ?? createPlatform(runtimeMode),
    progressRepository:
      overrides.progressRepository ?? createLocalProgressRepository(storage),
    assetManager,
  };
}
