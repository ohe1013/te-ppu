// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetManager } from '../assets';
import { COMPLETE_ASSET_MANIFEST } from '../assets/test-fixtures/complete-manifest';
import type { ProgressRepository, ProgressRepositoryFactory } from '../progression';
import type { PlatformPort } from '../platform/platform-port';
import { createAppServices } from './app-services';

function validAtlasJson() {
  return {
    frames: {},
    meta: {
      image: 'battle-atlas.png',
      format: 'RGBA8888',
      scale: '1',
      size: { w: 1, h: 1 },
    },
  };
}

function platform(): PlatformPort {
  return {
    kind: 'browser',
    getIdentity: async () => ({ kind: 'local', key: 'local-browser' }),
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    subscribeSafeArea: () => () => undefined,
    lockPortrait: async () => undefined,
    haptic: async () => undefined,
    close: async () => undefined,
  };
}

function repository(): ProgressRepository {
  return {
    load: async () => ({
      ok: true,
      state: {
        schemaVersion: 2,
        highestUnlockedFloor: 1,
        clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
        settings: { soundEnabled: true, hapticsEnabled: true },
      },
      recoveredFromCorruption: false,
    }),
    save: async () => ({ ok: true }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAppServices asset boundary', () => {
  it('exposes an injected lazy progress repository factory without selecting a repository', () => {
    const progressRepositoryFactory = {
      forIdentity: vi.fn(() => repository()),
    } satisfies ProgressRepositoryFactory;
    const services = createAppServices('browser', window.localStorage, {
      platform: platform(),
      progressRepositoryFactory,
    });

    expect(services.progressRepositoryFactory).toBe(progressRepositoryFactory);
    expect(progressRepositoryFactory.forIdentity).not.toHaveBeenCalled();
    expect('progressRepository' in services).toBe(false);
  });

  it('does not read storage while creating the default lazy progress factory', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    } as unknown as Storage;

    createAppServices('browser', storage, { platform: platform() });

    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('uses successful JSON responses for the manifest and atlas while images decode manager-resolved URLs', async () => {
    const requests: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      requests.push(url);
      if (url === '/assets/manifest.json') {
        return { ok: true, status: 200, json: async () => COMPLETE_ASSET_MANIFEST };
      }
      if (url === '/assets/effects/battle-atlas.json') {
        return { ok: true, status: 200, json: async () => validAtlasJson() };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const images: FakeImage[] = [];
    class FakeImage {
      decoding = '';
      src = '';
      readonly decode = vi.fn(async () => undefined);

      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('Image', FakeImage);
    const services = createAppServices('browser', window.localStorage, {
      platform: platform(), progressRepositoryFactory: { forIdentity: () => repository() },
    });

    await expect(services.assetManager.loadCommon()).resolves.toBe('ready');

    expect(requests).toEqual([
      '/assets/manifest.json',
      '/assets/effects/battle-atlas.json',
    ]);
    expect(images).not.toHaveLength(0);
    expect(images.every((image) => image.src.startsWith('/assets/'))).toBe(true);
    expect(images.every((image) => image.decode.mock.calls.length === 1)).toBe(true);
  });

  it.each([
    ['a non-successful manifest response', async () => ({ ok: false, status: 503, json: async () => COMPLETE_ASSET_MANIFEST })],
    ['a manifest JSON rejection', async () => ({ ok: true, status: 200, json: async () => { throw new Error('json'); } })],
  ])('falls back with no common assets after %s', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn(response));
    vi.stubGlobal('Image', class {});
    const services = createAppServices('browser', window.localStorage, {
      platform: platform(), progressRepositoryFactory: { forIdentity: () => repository() },
    });

    await expect(services.assetManager.loadCommon()).resolves.toBe('fallback');
    expect(services.assetManager.getCommonAssets()).toBeNull();
  });

  it('keeps a partial common bundle when atlas JSON or an image decode fails', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === '/assets/manifest.json') {
        return { ok: true, status: 200, json: async () => COMPLETE_ASSET_MANIFEST };
      }
      return { ok: false, status: 404, json: async () => validAtlasJson() };
    });
    class FailingImage {
      decoding = '';
      src = '';
      async decode() {
        if (this.src.endsWith('app-logo.png')) throw new Error('decode');
      }
    }
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('Image', FailingImage);
    const services = createAppServices('browser', window.localStorage, {
      platform: platform(), progressRepositoryFactory: { forIdentity: () => repository() },
    });

    await expect(services.assetManager.loadCommon()).resolves.toBe('fallback');
    expect(services.assetManager.getCommonAssets()).not.toBeNull();
    expect(services.assetManager.getCommonAssets()?.logo).toBeUndefined();
    expect(services.assetManager.getCommonAssets()?.atlas).toBeUndefined();
  });

  it('returns an injected asset manager without constructing browser loaders', () => {
    const assetManager: AssetManager = {
      loadCommon: async () => 'fallback',
      loadFloor: async () => 'fallback',
      prefetchFloor: () => undefined,
      releaseFloor: () => undefined,
      getCommonAssets: () => null,
      getFloorAssets: () => null,
      destroy: () => undefined,
    };
    const fetch = vi.fn();
    const ImageConstructor = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('Image', ImageConstructor);

    const services = createAppServices('browser', window.localStorage, {
      platform: platform(), progressRepositoryFactory: { forIdentity: () => repository() }, assetManager,
    });

    expect(services.assetManager).toBe(assetManager);
    expect(fetch).not.toHaveBeenCalled();
    expect(ImageConstructor).not.toHaveBeenCalled();
  });
});
