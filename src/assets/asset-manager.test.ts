import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Floor } from '../progression';
import {
  createAssetManager,
  GAME_ASSET_PATH,
  parseAssetManifest,
  type AssetLoadScheduler,
  type CreateAssetManagerOptions,
} from './index';
import { COMPLETE_ASSET_MANIFEST } from './test-fixtures/complete-manifest';

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function closeableImage() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

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

function cloneManifest(): Record<string, any> {
  return JSON.parse(JSON.stringify(COMPLETE_ASSET_MANIFEST)) as Record<string, any>;
}

function loaders(
  overrides: Partial<CreateAssetManagerOptions> = {},
): CreateAssetManagerOptions {
  return {
    fetchManifest: vi.fn(async () => COMPLETE_ASSET_MANIFEST),
    loadImage: vi.fn(async () => closeableImage()),
    loadAtlasJson: vi.fn(async () => validAtlasJson()),
    ...overrides,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('parseAssetManifest', () => {
  it('keeps the complete authored fixture JSON-serializable and inert', () => {
    const restored = JSON.parse(JSON.stringify(COMPLETE_ASSET_MANIFEST));

    expect(restored).toEqual(COMPLETE_ASSET_MANIFEST);
    expect(parseAssetManifest(restored)).toEqual(COMPLETE_ASSET_MANIFEST);
  });

  it.each([
    '/absolute.png',
    'C:/absolute.png',
    'blocks\\\\tile-i.png',
    './blocks/tile-i.png',
    '../tile-i.png',
    'blocks/../tile-i.png',
    'blocks/tile_i.png',
    'blocks/tile-i.png?x=1',
    'blocks/tile-i.png#x',
    'blocks/TILE-I.png',
    'blocks/tile-í.png',
  ])('rejects unsafe manifest ref path %s before any URL can be constructed', (path) => {
    const manifest = cloneManifest();
    manifest.brand.logo.path = path;

    expect(() => parseAssetManifest(manifest)).toThrow();
  });

  it('accepts the exact lowercase relative runtime asset path grammar', () => {
    const manifest = cloneManifest();
    manifest.brand.logo.path = 'blocks/tile-i.png';

    expect(parseAssetManifest(manifest).mode).toBe('assets');
  });

  it.each([
    ['top-level extra key', (manifest: Record<string, any>) => { manifest.extra = true; }],
    ['missing tile id', (manifest: Record<string, any>) => { delete manifest.common.tiles.I; }],
    ['unknown icon id', (manifest: Record<string, any>) => { manifest.common.icons.extra = { path: 'ui/extra.svg' }; }],
    ['malformed floor opponent id', (manifest: Record<string, any>) => { manifest.floors['1'].opponent = 'unknown'; }],
    ['floor music not assigned to that floor', (manifest: Record<string, any>) => { manifest.floors['1'].music = 'tower'; }],
    ['extra nested ref key', (manifest: Record<string, any>) => { manifest.brand.logo.extra = true; }],
    ['missing required hero portrait', (manifest: Record<string, any>) => { delete manifest.common.characters['hero-engineer'].portraits.win; }],
  ])('rejects an authored manifest with a %s', (_name, mutate) => {
    const manifest = cloneManifest();
    mutate(manifest);

    expect(() => parseAssetManifest(manifest)).toThrow();
  });

  it('accepts only the exact procedural manifest shape', () => {
    expect(parseAssetManifest({ schemaVersion: 1, mode: 'procedural-fallback' }))
      .toEqual({ schemaVersion: 1, mode: 'procedural-fallback' });
    expect(() => parseAssetManifest({
      schemaVersion: 1,
      mode: 'procedural-fallback',
      extra: true,
    })).toThrow();
  });
});

describe('createAssetManager', () => {
  it('coalesces common and per-floor loads and resolves URLs only in the manager', async () => {
    const fetchManifest = vi.fn().mockResolvedValue(COMPLETE_ASSET_MANIFEST);
    const loadImage = vi.fn().mockImplementation(async () => closeableImage());
    const loadAtlasJson = vi.fn().mockResolvedValue(validAtlasJson());
    const manager = createAssetManager({ fetchManifest, loadImage, loadAtlasJson });

    const commonA = manager.loadCommon();
    const commonB = manager.loadCommon();
    expect(commonA).toBe(commonB);
    await expect(Promise.all([commonA, commonB]))
      .resolves.toEqual(['ready', 'ready']);
    const floorA = manager.loadFloor(2);
    const floorB = manager.loadFloor(2);
    expect(floorA).toBe(floorB);
    await expect(Promise.all([floorA, floorB]))
      .resolves.toEqual(['ready', 'ready']);

    expect(fetchManifest).toHaveBeenCalledWith(GAME_ASSET_PATH);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(loadAtlasJson).toHaveBeenCalledWith('/assets/effects/battle-atlas.json');
    expect(loadImage).toHaveBeenCalledWith('/assets/effects/battle-atlas.png');
    expect(loadImage.mock.calls.every(([url]) =>
      typeof url === 'string' && url.startsWith('/assets/'))).toBe(true);
    expect(loadImage.mock.calls.some(([url]) => String(url).endsWith('.mp3'))).toBe(false);
  });

  it('publishes an audio-only authored common bundle after every image loses operationally', async () => {
    const loadImage = vi.fn(async () => {
      throw new Error('decode failed');
    });
    const manager = createAssetManager(loaders({ loadImage }));

    await expect(manager.loadCommon()).resolves.toBe('fallback');
    expect(manager.getCommonAssets()).toMatchObject({
      generation: 1,
      hero: { portraits: {} },
      owl: { portraits: {} },
      tiles: {},
      items: {},
      icons: {},
      audio: {
        bgm: {
          tower: {
            ref: { path: 'audio/bgm/tower.mp3' },
            url: '/assets/audio/bgm/tower.mp3',
            generation: 1,
          },
        },
      },
    });
    expect(Object.keys(manager.getCommonAssets()!.audio.sfx)).toEqual([
      'move', 'rotate', 'land', 'clear', 'attack', 'item', 'win', 'loss',
    ]);
    expect(Object.keys(manager.getCommonAssets()!.audio.bgm)).toEqual([
      'tower', 'early-floors', 'late-floors', 'demon-king', 'ending',
    ]);
  });

  it('treats each synchronous I/O seam failure as operational fallback', async () => {
    const manifestManager = createAssetManager(loaders({
      fetchManifest: () => { throw new Error('manifest'); },
    }));
    await expect(manifestManager.loadCommon()).resolves.toBe('fallback');
    expect(manifestManager.getCommonAssets()).toBeNull();

    const imageManager = createAssetManager(loaders({
      loadImage: () => { throw new Error('image'); },
    }));
    await expect(imageManager.loadFloor(1)).resolves.toBe('fallback');
    expect(imageManager.getFloorAssets(1)).toMatchObject({ floor: 1, portraits: {} });

    const atlasManager = createAssetManager(loaders({
      loadAtlasJson: () => { throw new Error('atlas'); },
    }));
    await expect(atlasManager.loadCommon()).resolves.toBe('fallback');
    expect(atlasManager.getCommonAssets()?.atlas).toBeUndefined();
  });

  it('retains a structural manifest rejection as the exact cached rejected promise', async () => {
    const fetchManifest = vi.fn(async () => ({ schemaVersion: 1, mode: 'assets' }));
    const manager = createAssetManager(loaders({ fetchManifest }));

    const first = manager.loadCommon();
    const error = await first.catch((reason: unknown) => reason);
    const second = manager.loadCommon();

    expect(second).toBe(first);
    await expect(second).rejects.toBe(error);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('evicts only a rejected manifest I/O promise so a later entry can refetch', async () => {
    const fetchManifest = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(COMPLETE_ASSET_MANIFEST);
    const manager = createAssetManager(loaders({ fetchManifest }));

    await expect(manager.loadFloor(1)).resolves.toBe('fallback');
    await expect(manager.loadFloor(2)).resolves.toBe('ready');

    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(manager.getFloorAssets(2)).toMatchObject({ floor: 2, opponent: 'alchemist' });
  });

  it('retries a prefetched floor once through its entry wrapper after manifest I/O rejection', async () => {
    const fetchManifest = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(COMPLETE_ASSET_MANIFEST);
    const manager = createAssetManager(loaders({ fetchManifest }));

    manager.prefetchFloor(1);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const entryA = manager.loadFloor(1);
    const entryB = manager.loadFloor(1);

    expect(entryA).toBe(entryB);
    await expect(entryA).resolves.toBe('ready');
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(manager.getFloorAssets(1)).toMatchObject({ floor: 1, generation: 2 });
  });

  it('propagates a prefetched structural manifest rejection through the entry wrapper without retrying', async () => {
    const fetchManifest = vi.fn().mockResolvedValue({ schemaVersion: 1, mode: 'assets' });
    const manager = createAssetManager(loaders({ fetchManifest }));

    manager.prefetchFloor(1);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const entryA = manager.loadFloor(1);
    const entryB = manager.loadFloor(1);
    const error = await entryA.catch((reason: unknown) => reason);

    expect(entryA).toBe(entryB);
    await expect(entryB).rejects.toBe(error);
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('caches intentional procedural fallback without attempting authored URLs or entry retries', async () => {
    const fetchManifest = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      mode: 'procedural-fallback',
    });
    const loadImage = vi.fn();
    const manager = createAssetManager(loaders({ fetchManifest, loadImage }));

    manager.prefetchFloor(1);
    await flushPromises();
    const entry = manager.loadFloor(1);

    await expect(entry).resolves.toBe('fallback');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(loadImage).not.toHaveBeenCalled();
    expect(manager.getFloorAssets(1)).toBeNull();
  });

  it.each([
    ['null atlas', null],
    ['array atlas', []],
    ['extra atlas envelope key', { ...validAtlasJson(), extra: true }],
    ['wrong metadata literal', { ...validAtlasJson(), meta: { ...validAtlasJson().meta, format: 'RGBA' } }],
    ['non-boolean trim flag', {
      ...validAtlasJson(),
      frames: {
        sprite: {
          frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: false, trimmed: 'false',
          spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 },
        },
      },
    }],
    ['negative geometry', {
      ...validAtlasJson(),
      frames: {
        sprite: {
          frame: { x: -1, y: 0, w: 1, h: 1 }, rotated: false, trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 },
        },
      },
    }],
    ['out of bounds frame', {
      ...validAtlasJson(),
      frames: {
        sprite: {
          frame: { x: 1, y: 0, w: 1, h: 1 }, rotated: false, trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 },
        },
      },
    }],
    ['mismatched source rectangle', {
      ...validAtlasJson(),
      frames: {
        sprite: {
          frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: false, trimmed: true,
          spriteSourceSize: { x: 0, y: 0, w: 2, h: 1 }, sourceSize: { w: 2, h: 1 },
        },
      },
    }],
    ['untrimmed non-full source rectangle', {
      ...validAtlasJson(),
      frames: {
        sprite: {
          frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: false, trimmed: false,
          spriteSourceSize: { x: 1, y: 0, w: 1, h: 1 }, sourceSize: { w: 2, h: 1 },
        },
      },
    }],
  ])('does not publish a partially trusted atlas after %s', async (_name, atlas) => {
    const manager = createAssetManager(loaders({
      loadAtlasJson: vi.fn().mockResolvedValue(atlas),
    }));

    await expect(manager.loadCommon()).resolves.toBe('fallback');
    expect(manager.getCommonAssets()).not.toBeNull();
    expect(manager.getCommonAssets()?.atlas).toBeUndefined();
  });

  it('closes a late atlas image once when JSON fails before the image resolves', async () => {
    const atlasImage = deferred<ImageBitmap>();
    const lateSource = closeableImage();
    const manager = createAssetManager(loaders({
      loadImage: vi.fn((url: string) => url.endsWith('battle-atlas.png')
        ? atlasImage.promise
        : Promise.resolve(closeableImage())),
      loadAtlasJson: vi.fn().mockRejectedValue(new Error('bad json')),
    }));

    await expect(manager.loadCommon()).resolves.toBe('fallback');
    expect(manager.getCommonAssets()?.atlas).toBeUndefined();
    atlasImage.resolve(lateSource);
    await flushPromises();

    expect(lateSource.close).toHaveBeenCalledTimes(1);
  });

  it('closes an atlas image that resolved before its JSON misses the shared deadline', async () => {
    vi.useFakeTimers();
    const atlasJson = deferred<unknown>();
    const atlasImage = closeableImage();
    const loadImage = vi.fn((url: string) => url.endsWith('battle-atlas.png')
      ? Promise.resolve(atlasImage)
      : Promise.resolve(closeableImage()));
    const manager = createAssetManager(loaders({
      loadImage,
      loadAtlasJson: vi.fn(() => atlasJson.promise),
      loadTimeoutMs: 5,
    }));

    const common = manager.loadCommon();
    await flushPromises();
    await flushPromises();
    expect(loadImage).toHaveBeenCalledWith('/assets/effects/battle-atlas.png');
    expect(atlasImage.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);

    await expect(common).resolves.toBe('fallback');
    expect(manager.getCommonAssets()?.atlas).toBeUndefined();
    expect(atlasImage.close).toHaveBeenCalledTimes(1);
    atlasJson.resolve(validAtlasJson());
    await flushPromises();
    expect(atlasImage.close).toHaveBeenCalledTimes(1);
  });

  it('uses one absolute common deadline and closes late image results without publishing them', async () => {
    vi.useFakeTimers();
    const manifest = deferred<unknown>();
    const logo = deferred<ImageBitmap>();
    const lateSource = closeableImage();
    const scheduler: AssetLoadScheduler = {
      setTimeout: vi.fn((callback, delayMs) => setTimeout(callback, delayMs)),
      clearTimeout: vi.fn((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
    const manager = createAssetManager(loaders({
      fetchManifest: vi.fn(() => manifest.promise),
      loadImage: vi.fn((url: string) => url.endsWith('app-logo.png')
        ? logo.promise
        : Promise.reject(new Error('missing'))),
      loadAtlasJson: vi.fn().mockRejectedValue(new Error('missing atlas')),
      loadTimeoutMs: 5,
      scheduler,
    }));

    const commonA = manager.loadCommon();
    const commonB = manager.loadCommon();
    expect(commonA).toBe(commonB);
    await vi.advanceTimersByTimeAsync(3);
    manifest.resolve(COMPLETE_ASSET_MANIFEST);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2);

    await expect(commonA).resolves.toBe('fallback');
    expect(scheduler.setTimeout).toHaveBeenCalledTimes(1);
    expect(scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5);
    expect(manager.getCommonAssets()?.logo).toBeUndefined();
    logo.resolve(lateSource);
    await flushPromises();
    expect(lateSource.close).toHaveBeenCalledTimes(1);
  });

  it('gives a floor attempt one shared deadline and validates timeout options synchronously', async () => {
    vi.useFakeTimers();
    const manifest = deferred<unknown>();
    const scheduler: AssetLoadScheduler = {
      setTimeout: vi.fn((callback, delayMs) => setTimeout(callback, delayMs)),
      clearTimeout: vi.fn((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
    const manager = createAssetManager(loaders({
      fetchManifest: vi.fn(() => manifest.promise), loadTimeoutMs: 5, scheduler,
    }));

    const floorA = manager.loadFloor(3);
    const floorB = manager.loadFloor(3);
    expect(floorA).toBe(floorB);
    await vi.advanceTimersByTimeAsync(5);
    await expect(floorA).resolves.toBe('fallback');
    expect(scheduler.setTimeout).toHaveBeenCalledTimes(1);

    for (const invalidTimeout of [Number.NaN, Infinity, -Infinity, -1]) {
      expect(() => createAssetManager(loaders({ loadTimeoutMs: invalidTimeout })))
        .toThrow(RangeError);
    }
    const pendingManifest = deferred<unknown>();
    const immediate = createAssetManager(loaders({
      fetchManifest: vi.fn(() => pendingManifest.promise),
      loadTimeoutMs: 0,
    }));
    const immediateResult = immediate.loadCommon();
    await vi.advanceTimersByTimeAsync(0);
    await expect(immediateResult).resolves.toBe('fallback');
  });

  it('starts an entry retry with a fresh absolute deadline after a prefetched timeout', async () => {
    vi.useFakeTimers();
    const manifest = deferred<unknown>();
    const scheduler: AssetLoadScheduler = {
      setTimeout: vi.fn((callback, delayMs) => setTimeout(callback, delayMs)),
      clearTimeout: vi.fn((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
    const fetchManifest = vi.fn(() => manifest.promise);
    const manager = createAssetManager(loaders({
      fetchManifest,
      loadTimeoutMs: 5,
      scheduler,
    }));

    manager.prefetchFloor(4);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5);
    const entry = manager.loadFloor(4);
    let settled: 'ready' | 'fallback' | null = null;
    void entry.then((result) => { settled = result; });
    await flushPromises();

    expect(scheduler.setTimeout).toHaveBeenCalledTimes(2);
    expect(scheduler.setTimeout).toHaveBeenNthCalledWith(2, expect.any(Function), 5);
    await vi.advanceTimersByTimeAsync(4);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await expect(entry).resolves.toBe('fallback');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  it('clears an attempt timer after natural completion', async () => {
    vi.useFakeTimers();
    const scheduler: AssetLoadScheduler = {
      setTimeout: vi.fn((callback, delayMs) => setTimeout(callback, delayMs)),
      clearTimeout: vi.fn((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
    const manager = createAssetManager(loaders({ scheduler }));

    await expect(manager.loadCommon()).resolves.toBe('ready');
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(manager.loadCommon()).resolves.toBe('ready');
  });

  it('schedules the documented 5,000ms deadline when no timeout override is supplied', async () => {
    vi.useFakeTimers();
    const manifest = deferred<unknown>();
    const scheduler: AssetLoadScheduler = {
      setTimeout: vi.fn((callback, delayMs) => setTimeout(callback, delayMs)),
      clearTimeout: vi.fn((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
    };
    const manager = createAssetManager(loaders({
      fetchManifest: vi.fn(() => manifest.promise),
      scheduler,
    }));

    const common = manager.loadCommon();
    await flushPromises();
    expect(scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(common).resolves.toBe('fallback');
  });

  it('loads a floor background without duplicating character assets', async () => {
    const loadImage = vi.fn(async () => closeableImage());
    const manager = createAssetManager(loaders({ loadImage }));

    await expect(manager.loadFloor(1)).resolves.toBe('ready');

    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(loadImage).toHaveBeenCalledWith('/assets/backgrounds/floor-01.webp');
    expect(manager.getFloorAssets(1)).toMatchObject({
      floor: 1,
      opponent: 'quartermaster',
      encounters: ['quartermaster', 'clock-moth', 'moss-golem'],
    });
  });

  it('wraps a pending prefetch for entry callers and reuses a ready prefetch without retry', async () => {
    const manifest = deferred<unknown>();
    const fetchManifest = vi.fn(() => manifest.promise);
    const manager = createAssetManager(loaders({ fetchManifest }));

    manager.prefetchFloor(2);
    const entryA = manager.loadFloor(2);
    const entryB = manager.loadFloor(2);
    expect(entryA).toBe(entryB);
    manifest.resolve(COMPLETE_ASSET_MANIFEST);

    await expect(entryA).resolves.toBe('ready');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(manager.getFloorAssets(2)).toMatchObject({ floor: 2, generation: 1 });
  });

  it('seals original promises on release and destroy while rejecting invalid floors synchronously', async () => {
    const image = deferred<ImageBitmap>();
    const source = closeableImage();
    const manager = createAssetManager(loaders({
      loadImage: vi.fn(() => image.promise),
      loadAtlasJson: vi.fn().mockRejectedValue(new Error('atlas')),
    }));
    const floor = manager.loadFloor(1);
    const common = manager.loadCommon();
    const invalid = 6 as unknown as Floor;

    expect(() => manager.loadFloor(invalid)).toThrow(RangeError);
    expect(() => manager.prefetchFloor(invalid)).toThrow(RangeError);
    expect(() => manager.releaseFloor(invalid)).toThrow(RangeError);
    expect(() => manager.getFloorAssets(invalid)).toThrow(RangeError);
    manager.releaseFloor(1);
    await expect(floor).resolves.toBe('fallback');
    expect(manager.getFloorAssets(1)).toBeNull();
    manager.destroy();
    manager.destroy();
    await expect(common).resolves.toBe('fallback');
    expect(manager.getCommonAssets()).toBeNull();
    await expect(manager.loadCommon()).resolves.toBe('fallback');
    await expect(manager.loadFloor(1)).resolves.toBe('fallback');
    expect(() => manager.loadFloor(invalid)).toThrow(RangeError);
    image.resolve(source);
    await flushPromises();
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it('does not invoke a queued manifest seam after destroy seals its common load', async () => {
    const fetchManifest = vi.fn().mockResolvedValue(COMPLETE_ASSET_MANIFEST);
    const manager = createAssetManager(loaders({ fetchManifest }));

    const common = manager.loadCommon();
    manager.destroy();
    await flushPromises();

    await expect(common).resolves.toBe('fallback');
    expect(fetchManifest).not.toHaveBeenCalled();
  });
});
