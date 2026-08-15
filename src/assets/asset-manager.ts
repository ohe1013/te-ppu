import type { ItemType, PieceKind } from '../core';
import type { MusicTrack, SoundCue } from '../platform/audio-port';
import { PLAYER_CHARACTER_IDS, type PlayerCharacterId } from '../player';
import { isFloor, type Floor } from '../progression';
import { parseAssetManifest } from './manifest';
import type {
  AssetLoadScheduler,
  AssetManager,
  AtlasData,
  CommonAssets,
  CreateAssetManagerOptions,
  FloorAssetBundle,
  FloorOpponentId,
  HeroPortraitState,
  LoadedImageRef,
  ManifestRef,
  OwlPortraitState,
  PortraitState,
  ResolvedAudioRef,
  TexturePackerAtlasJson,
  UiIconId,
} from './types';

export const GAME_ASSET_PATH = '/assets/manifest.json' as const;

type LoadResult = 'ready' | 'fallback';
type FallbackKind = 'none' | 'procedural' | 'operational';
type AttemptStatus = 'pending' | 'settled' | 'rejected';
type LoadableImage = ImageBitmap | HTMLImageElement;

const RIVAL_IDS = [
  'quartermaster', 'alchemist', 'guard-captain', 'dark-engineer',
  'clock-moth', 'glass-oracle', 'moss-golem', 'spark-slime',
  'frost-smith', 'storm-harpy', 'brass-minotaur', 'cinder-witch',
  'chain-knight', 'night-archivist', 'demon-king',
] as const satisfies readonly FloorOpponentId[];

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

interface ManifestRecord {
  readonly promise: Promise<ReturnType<typeof parseAssetManifest>>;
  structuralFailure: boolean;
}

interface AtlasState {
  image?: LoadedImageRef;
  json?: TexturePackerAtlasJson;
  failed: boolean;
  published: boolean;
  completed: boolean;
  readonly finish: () => void;
}

interface BaseAttempt<TBundle> {
  readonly generation: number;
  readonly attemptPromise: Promise<LoadResult>;
  readonly deferred: Deferred<LoadResult>;
  open: boolean;
  status: AttemptStatus;
  fallbackKind: FallbackKind;
  hasOperationalLoss: boolean;
  timer: unknown;
  timerActive: boolean;
  bundle: TBundle | null;
  readonly sources: Set<LoadableImage>;
  readonly atlasStates: Set<AtlasState>;
}

interface CommonAttempt extends BaseAttempt<CommonAssets> {
  readonly kind: 'common';
}

type FloorOrigin = 'entry' | 'prefetch' | 'entry-retry';

interface FloorAttempt extends BaseAttempt<FloorAssetBundle> {
  readonly kind: 'floor';
  readonly floor: Floor;
  readonly origin: FloorOrigin;
  publicPromise: Promise<LoadResult>;
  retryConsumed: boolean;
}

interface FloorEntryWrapper {
  readonly floor: Floor;
  readonly prefetch: FloorAttempt;
  readonly generation: number;
  readonly promise: Promise<LoadResult>;
  readonly deferred: Deferred<LoadResult>;
  open: boolean;
  retry?: FloorAttempt;
}

interface MutableCommonBundle {
  generation: number;
  logo?: LoadedImageRef;
  towerBackdrop?: LoadedImageRef;
  players: Record<PlayerCharacterId, {
    fullArt?: LoadedImageRef;
    portraits: Partial<Record<HeroPortraitState, LoadedImageRef>>;
  }>;
  owl: {
    fullArt?: LoadedImageRef;
    portraits: Partial<Record<OwlPortraitState, LoadedImageRef>>;
  };
  rivals: CommonAssets['rivals'];
  tiles: Partial<Record<PieceKind | 'garbage', LoadedImageRef>>;
  items: Partial<Record<ItemType, LoadedImageRef>>;
  icons: Partial<Record<UiIconId, LoadedImageRef>>;
  atlas?: AtlasData;
  audio: CommonAssets['audio'];
}

interface MutableFloorBundle {
  floor: Floor;
  opponent: FloorOpponentId;
  encounters: FloorAssetBundle['encounters'];
  music: MusicTrack;
  generation: number;
  background?: LoadedImageRef;
  fullArt?: LoadedImageRef;
  portraits: Partial<Record<PortraitState, LoadedImageRef>>;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function defaultScheduler(): AssetLoadScheduler {
  return {
    setTimeout(callback, delayMs) {
      return globalThis.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}

function resolvedUrl(ref: ManifestRef): string {
  return `/assets/${ref.path}`;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const actual = Object.keys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return null;
  return value;
}

function parseAtlasJson(value: unknown): TexturePackerAtlasJson | null {
  const atlas = exactObject(value, ['frames', 'meta']);
  if (atlas === null || !isPlainObject(atlas.frames)) return null;
  const meta = exactObject(atlas.meta, ['image', 'format', 'scale', 'size']);
  if (meta === null || meta.image !== 'battle-atlas.png' || meta.format !== 'RGBA8888' || meta.scale !== '1') {
    return null;
  }
  const metaSize = exactObject(meta.size, ['w', 'h']);
  if (metaSize === null || !isPositiveInteger(metaSize.w) || !isPositiveInteger(metaSize.h)) return null;

  const frames: Record<string, TexturePackerAtlasJson['frames'][string]> = {};
  for (const [name, candidate] of Object.entries(atlas.frames)) {
    const frameRecord = exactObject(candidate, ['frame', 'rotated', 'trimmed', 'spriteSourceSize', 'sourceSize']);
    if (frameRecord === null || frameRecord.rotated !== false || typeof frameRecord.trimmed !== 'boolean') {
      return null;
    }
    const frame = exactObject(frameRecord.frame, ['x', 'y', 'w', 'h']);
    const spriteSourceSize = exactObject(frameRecord.spriteSourceSize, ['x', 'y', 'w', 'h']);
    const sourceSize = exactObject(frameRecord.sourceSize, ['w', 'h']);
    if (frame === null || spriteSourceSize === null || sourceSize === null) return null;
    if (
      !isNonNegativeInteger(frame.x) || !isNonNegativeInteger(frame.y)
      || !isPositiveInteger(frame.w) || !isPositiveInteger(frame.h)
      || !isNonNegativeInteger(spriteSourceSize.x) || !isNonNegativeInteger(spriteSourceSize.y)
      || !isPositiveInteger(spriteSourceSize.w) || !isPositiveInteger(spriteSourceSize.h)
      || !isPositiveInteger(sourceSize.w) || !isPositiveInteger(sourceSize.h)
    ) return null;
    if (
      frame.x + frame.w > metaSize.w
      || frame.y + frame.h > metaSize.h
      || frame.w !== spriteSourceSize.w
      || frame.h !== spriteSourceSize.h
      || spriteSourceSize.x + frame.w > sourceSize.w
      || spriteSourceSize.y + frame.h > sourceSize.h
    ) return null;
    if (
      frameRecord.trimmed === false
      && (
        spriteSourceSize.x !== 0 || spriteSourceSize.y !== 0
        || frame.w !== sourceSize.w || frame.h !== sourceSize.h
      )
    ) return null;
    frames[name] = {
      frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      rotated: false,
      trimmed: frameRecord.trimmed,
      spriteSourceSize: {
        x: spriteSourceSize.x,
        y: spriteSourceSize.y,
        w: spriteSourceSize.w,
        h: spriteSourceSize.h,
      },
      sourceSize: { w: sourceSize.w, h: sourceSize.h },
    };
  }
  return {
    frames,
    meta: {
      image: 'battle-atlas.png',
      format: 'RGBA8888',
      scale: '1',
      size: { w: metaSize.w, h: metaSize.h },
    },
  };
}

function audioCatalog<K extends string>(
  refs: Readonly<Record<K, ManifestRef>>,
  generation: number,
): Readonly<Record<K, ResolvedAudioRef>> {
  const catalog = {} as Record<K, ResolvedAudioRef>;
  for (const [key, ref] of Object.entries(refs) as [K, ManifestRef][]) {
    catalog[key] = { ref, url: resolvedUrl(ref), generation };
  }
  return catalog;
}

export function createAssetManager(options: CreateAssetManagerOptions): AssetManager {
  const loadTimeoutMs = options.loadTimeoutMs ?? 5_000;
  if (!Number.isFinite(loadTimeoutMs) || loadTimeoutMs < 0) {
    throw new RangeError('loadTimeoutMs must be a finite non-negative number.');
  }
  const scheduler = options.scheduler ?? defaultScheduler();
  const closedSources = new WeakSet<object>();
  const floorGenerations = new Map<Floor, number>([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
  const floorRecords = new Map<Floor, FloorAttempt>();
  const floorWrappers = new Map<Floor, FloorEntryWrapper>();
  const floorAssets = new Map<Floor, FloorAssetBundle>();
  let commonRecord: CommonAttempt | null = null;
  let commonAssets: CommonAssets | null = null;
  let manifestRecord: ManifestRecord | null = null;
  let commonGeneration = 1;
  let destroyed = false;

  function closeSource(source: unknown) {
    if ((typeof source !== 'object' && typeof source !== 'function') || source === null) return;
    const close = (source as { close?: unknown }).close;
    if (typeof close !== 'function' || closedSources.has(source)) return;
    closedSources.add(source);
    try {
      close.call(source);
    } catch {
      // Cleanup must not affect the non-blocking load result.
    }
  }

  function clearAttemptTimer(attempt: BaseAttempt<unknown>) {
    if (!attempt.timerActive) return;
    scheduler.clearTimeout(attempt.timer);
    attempt.timerActive = false;
  }

  function closeAttemptSources(attempt: BaseAttempt<unknown>) {
    for (const source of attempt.sources) closeSource(source);
    attempt.sources.clear();
    for (const atlas of attempt.atlasStates) {
      if (!atlas.published && atlas.image !== undefined) closeSource(atlas.image.source);
      atlas.finish();
    }
  }

  function discardAtlasImage(attempt: BaseAttempt<unknown>, atlas: AtlasState) {
    if (atlas.image === undefined || atlas.published) return;
    attempt.sources.delete(atlas.image.source);
    closeSource(atlas.image.source);
    atlas.image = undefined;
  }

  function orphanAtlasStates(attempt: BaseAttempt<unknown>) {
    for (const atlas of attempt.atlasStates) {
      if (!atlas.published) discardAtlasImage(attempt, atlas);
      atlas.finish();
    }
  }

  function currentCommon(attempt: CommonAttempt): boolean {
    return !destroyed
      && attempt.open
      && commonRecord === attempt
      && commonRecord.attemptPromise === attempt.attemptPromise
      && commonGeneration === attempt.generation;
  }

  function currentFloor(attempt: FloorAttempt): boolean {
    return !destroyed
      && attempt.open
      && floorRecords.get(attempt.floor) === attempt
      && floorRecords.get(attempt.floor)?.attemptPromise === attempt.attemptPromise
      && floorGenerations.get(attempt.floor) === attempt.generation;
  }

  function current(attempt: CommonAttempt | FloorAttempt): boolean {
    return attempt.kind === 'common' ? currentCommon(attempt) : currentFloor(attempt);
  }

  function publish(attempt: CommonAttempt | FloorAttempt) {
    if (attempt.bundle === null || !current(attempt)) return;
    if (attempt.kind === 'common') commonAssets = attempt.bundle;
    else floorAssets.set(attempt.floor, attempt.bundle);
  }

  function settleFallback(attempt: CommonAttempt | FloorAttempt, fallbackKind: FallbackKind) {
    if (!attempt.open) return;
    const canPublish = current(attempt);
    attempt.open = false;
    attempt.status = 'settled';
    attempt.fallbackKind = fallbackKind;
    clearAttemptTimer(attempt);
    orphanAtlasStates(attempt);
    if (canPublish && attempt.bundle !== null) {
      if (attempt.kind === 'common') commonAssets = attempt.bundle;
      else floorAssets.set(attempt.floor, attempt.bundle);
    }
    attempt.deferred.resolve('fallback');
  }

  function settleReady(attempt: CommonAttempt | FloorAttempt) {
    if (!attempt.open) return;
    const canPublish = current(attempt);
    attempt.open = false;
    attempt.status = 'settled';
    attempt.fallbackKind = 'none';
    clearAttemptTimer(attempt);
    if (canPublish && attempt.bundle !== null) {
      if (attempt.kind === 'common') commonAssets = attempt.bundle;
      else floorAssets.set(attempt.floor, attempt.bundle);
    }
    attempt.deferred.resolve('ready');
  }

  function rejectStructural(attempt: CommonAttempt | FloorAttempt, error: unknown) {
    if (!attempt.open) return;
    attempt.open = false;
    attempt.status = 'rejected';
    clearAttemptTimer(attempt);
    orphanAtlasStates(attempt);
    attempt.deferred.reject(error);
  }

  function manifest(): ManifestRecord {
    if (manifestRecord !== null) return manifestRecord;
    let record!: ManifestRecord;
    const acquisition = Promise.resolve().then(() => {
      if (destroyed || manifestRecord !== record) {
        throw new Error('Manifest acquisition is no longer current.');
      }
      return options.fetchManifest(GAME_ASSET_PATH);
    });
    const parsed = acquisition.then((value) => {
      try {
        return parseAssetManifest(value);
      } catch (error) {
        record.structuralFailure = true;
        throw error;
      }
    });
    record = { promise: parsed, structuralFailure: false };
    manifestRecord = record;
    void acquisition.catch(() => {
      if (manifestRecord === record) manifestRecord = null;
    });
    return record;
  }

  function makeCommonAttempt(): CommonAttempt {
    const deferred = createDeferred<LoadResult>();
    return {
      kind: 'common',
      generation: commonGeneration,
      attemptPromise: deferred.promise,
      deferred,
      open: true,
      status: 'pending',
      fallbackKind: 'none',
      hasOperationalLoss: false,
      timer: undefined,
      timerActive: false,
      bundle: null,
      sources: new Set(),
      atlasStates: new Set(),
    };
  }

  function makeFloorAttempt(floor: Floor, origin: FloorOrigin): FloorAttempt {
    const deferred = createDeferred<LoadResult>();
    return {
      kind: 'floor',
      floor,
      origin,
      generation: floorGenerations.get(floor) ?? 1,
      attemptPromise: deferred.promise,
      publicPromise: deferred.promise,
      deferred,
      open: true,
      status: 'pending',
      fallbackKind: 'none',
      hasOperationalLoss: false,
      timer: undefined,
      timerActive: false,
      bundle: null,
      sources: new Set(),
      atlasStates: new Set(),
      retryConsumed: false,
    };
  }

  function startTimer(attempt: CommonAttempt | FloorAttempt) {
    attempt.timerActive = true;
    attempt.timer = scheduler.setTimeout(() => {
      settleFallback(attempt, 'operational');
    }, loadTimeoutMs);
  }

  function markOperationalLoss(attempt: CommonAttempt | FloorAttempt) {
    if (current(attempt)) attempt.hasOperationalLoss = true;
  }

  function loadImage(
    attempt: CommonAttempt | FloorAttempt,
    ref: ManifestRef,
    onLoaded: (image: LoadedImageRef) => void,
  ): Promise<void> {
    const url = resolvedUrl(ref);
    return Promise.resolve()
      .then(() => options.loadImage(url))
      .then((source) => {
        if (!current(attempt)) {
          closeSource(source);
          return;
        }
        const image = { ref, url, source, generation: attempt.generation };
        attempt.sources.add(source);
        onLoaded(image);
      })
      .catch(() => {
        markOperationalLoss(attempt);
      });
  }

  function loadAtlas(
    attempt: CommonAttempt,
    imageRef: ManifestRef,
    dataRef: ManifestRef,
    onLoaded: (atlas: AtlasData) => void,
  ): Promise<void> {
    let complete!: () => void;
    const completion = new Promise<void>((resolve) => {
      complete = () => resolve();
    });
    const atlas: AtlasState = {
      failed: false,
      published: false,
      completed: false,
      finish: () => {
        if (atlas.completed) return;
        atlas.completed = true;
        complete();
      },
    };
    attempt.atlasStates.add(atlas);
    const fail = () => {
      if (!current(attempt)) return;
      atlas.failed = true;
      markOperationalLoss(attempt);
      discardAtlasImage(attempt, atlas);
      atlas.finish();
    };
    const pair = () => {
      if (!current(attempt) || atlas.failed || atlas.published || atlas.image === undefined || atlas.json === undefined) return;
      atlas.published = true;
      onLoaded({ image: atlas.image, json: atlas.json, generation: attempt.generation });
      atlas.finish();
    };
    const imageUrl = resolvedUrl(imageRef);
    void Promise.resolve()
      .then(() => options.loadImage(imageUrl))
      .then((source) => {
        if (!current(attempt) || atlas.failed) {
          closeSource(source);
          return;
        }
        atlas.image = { ref: imageRef, url: imageUrl, source, generation: attempt.generation };
        attempt.sources.add(source);
        pair();
      })
      .catch(fail);
    const dataUrl = resolvedUrl(dataRef);
    void Promise.resolve()
      .then(() => options.loadAtlasJson(dataUrl))
      .then((value) => {
        const json = parseAtlasJson(value);
        if (!current(attempt)) return;
        if (json === null) {
          fail();
          return;
        }
        atlas.json = json;
        pair();
      })
      .catch(fail);
    return completion;
  }

  async function runCommon(attempt: CommonAttempt) {
    const manifestRecordForAttempt = manifest();
    let loadedManifest: ReturnType<typeof parseAssetManifest>;
    try {
      loadedManifest = await manifestRecordForAttempt.promise;
    } catch (error) {
      if (!current(attempt)) return;
      if (manifestRecordForAttempt.structuralFailure) rejectStructural(attempt, error);
      else settleFallback(attempt, 'operational');
      return;
    }
    if (!current(attempt)) return;
    if (loadedManifest.mode === 'procedural-fallback') {
      settleFallback(attempt, 'procedural');
      return;
    }

    const common = loadedManifest.common;
    const bundle: MutableCommonBundle = {
      generation: attempt.generation,
      players: {
        'hero-engineer': { portraits: {} },
        'cloud-courier': { portraits: {} },
        'star-alchemist': { portraits: {} },
      },
      owl: { portraits: {} },
      rivals: {},
      tiles: {},
      items: {},
      icons: {},
      audio: {
        sfx: audioCatalog<SoundCue>(common.audio.sfx, attempt.generation),
        bgm: audioCatalog<MusicTrack>(common.audio.bgm, attempt.generation),
      },
    };
    attempt.bundle = bundle;
    const tasks: Promise<void>[] = [
      loadImage(attempt, loadedManifest.brand.logo, (image) => { bundle.logo = image; }),
      loadImage(attempt, common.backgrounds.tower, (image) => { bundle.towerBackdrop = image; }),
      loadImage(attempt, common.characters['owl-companion'].fullArt, (image) => { bundle.owl.fullArt = image; }),
      loadAtlas(attempt, common.atlas.image, common.atlas.data, (atlas) => { bundle.atlas = atlas; }),
    ];
    for (const characterId of PLAYER_CHARACTER_IDS) {
      const player = bundle.players[characterId];
      tasks.push(loadImage(attempt, common.characters[characterId].fullArt, (image) => {
        player.fullArt = image;
      }));
      for (const [state, ref] of Object.entries(common.characters[characterId].portraits)) {
        tasks.push(loadImage(attempt, ref, (image) => {
          player.portraits[state as HeroPortraitState] = image;
        }));
      }
    }
    for (const [state, ref] of Object.entries(common.characters['owl-companion'].portraits)) {
      tasks.push(loadImage(attempt, ref, (image) => {
        bundle.owl.portraits[state as OwlPortraitState] = image;
      }));
    }
    for (const rivalId of RIVAL_IDS) {
      const rival: {
        fullArt?: LoadedImageRef;
        portraits: Partial<Record<PortraitState, LoadedImageRef>>;
      } = { portraits: {} };
      bundle.rivals[rivalId] = rival;
      tasks.push(loadImage(attempt, common.characters[rivalId].fullArt, (image) => {
        rival.fullArt = image;
      }));
      for (const [state, ref] of Object.entries(common.characters[rivalId].portraits)) {
        tasks.push(loadImage(attempt, ref, (image) => {
          rival.portraits[state as PortraitState] = image;
        }));
      }
    }
    for (const [key, ref] of Object.entries(common.tiles)) {
      tasks.push(loadImage(attempt, ref, (image) => {
        bundle.tiles[key as PieceKind | 'garbage'] = image;
      }));
    }
    for (const [key, ref] of Object.entries(common.items)) {
      tasks.push(loadImage(attempt, ref, (image) => {
        bundle.items[key as ItemType] = image;
      }));
    }
    for (const [key, ref] of Object.entries(common.icons)) {
      tasks.push(loadImage(attempt, ref, (image) => {
        bundle.icons[key as UiIconId] = image;
      }));
    }
    await Promise.all(tasks);
    if (!current(attempt)) return;
    if (attempt.hasOperationalLoss) settleFallback(attempt, 'operational');
    else settleReady(attempt);
  }

  async function runFloor(attempt: FloorAttempt) {
    const manifestRecordForAttempt = manifest();
    let loadedManifest: ReturnType<typeof parseAssetManifest>;
    try {
      loadedManifest = await manifestRecordForAttempt.promise;
    } catch (error) {
      if (!current(attempt)) return;
      if (manifestRecordForAttempt.structuralFailure) rejectStructural(attempt, error);
      else settleFallback(attempt, 'operational');
      return;
    }
    if (!current(attempt)) return;
    if (loadedManifest.mode === 'procedural-fallback') {
      settleFallback(attempt, 'procedural');
      return;
    }

    const floorKey = String(attempt.floor) as keyof typeof loadedManifest.floors;
    const manifestFloor = loadedManifest.floors[floorKey];
    const bundle: MutableFloorBundle = {
      floor: attempt.floor,
      opponent: manifestFloor.encounters[0],
      encounters: manifestFloor.encounters,
      music: manifestFloor.music,
      generation: attempt.generation,
      portraits: {},
    };
    attempt.bundle = bundle;
    const tasks: Promise<void>[] = [
      loadImage(attempt, manifestFloor.background, (image) => { bundle.background = image; }),
    ];
    await Promise.all(tasks);
    if (!current(attempt)) return;
    if (attempt.hasOperationalLoss) settleFallback(attempt, 'operational');
    else settleReady(attempt);
  }

  function startCommon(): CommonAttempt {
    const attempt = makeCommonAttempt();
    commonRecord = attempt;
    startTimer(attempt);
    void runCommon(attempt);
    return attempt;
  }

  function startFloor(floor: Floor, origin: FloorOrigin): FloorAttempt {
    const attempt = makeFloorAttempt(floor, origin);
    floorRecords.set(floor, attempt);
    startTimer(attempt);
    void runFloor(attempt);
    return attempt;
  }

  function settleWrapperFallback(wrapper: FloorEntryWrapper) {
    if (!wrapper.open) return;
    wrapper.open = false;
    wrapper.deferred.resolve('fallback');
  }

  function startEntryRetry(prefetch: FloorAttempt, wrapper: FloorEntryWrapper) {
    if (
      destroyed
      || !wrapper.open
      || floorRecords.get(prefetch.floor) !== prefetch
      || floorGenerations.get(prefetch.floor) !== prefetch.generation
      || prefetch.retryConsumed
    ) return;
    prefetch.retryConsumed = true;
    closeAttemptSources(prefetch);
    floorAssets.delete(prefetch.floor);
    floorGenerations.set(prefetch.floor, prefetch.generation + 1);
    const retry = startFloor(prefetch.floor, 'entry-retry');
    retry.publicPromise = wrapper.promise;
    wrapper.retry = retry;
    void retry.attemptPromise.then(
      (result) => {
        if (!wrapper.open || floorRecords.get(retry.floor) !== retry || retry.generation !== floorGenerations.get(retry.floor)) return;
        wrapper.open = false;
        wrapper.deferred.resolve(result);
      },
      (error: unknown) => {
        if (!wrapper.open) return;
        wrapper.open = false;
        wrapper.deferred.reject(error);
      },
    );
  }

  function wrapperForPrefetch(prefetch: FloorAttempt): FloorEntryWrapper {
    const existing = floorWrappers.get(prefetch.floor);
    if (
      existing !== undefined
      && existing.prefetch === prefetch
      && existing.generation === prefetch.generation
    ) return existing;
    const deferred = createDeferred<LoadResult>();
    const wrapper: FloorEntryWrapper = {
      floor: prefetch.floor,
      prefetch,
      generation: prefetch.generation,
      promise: deferred.promise,
      deferred,
      open: true,
    };
    floorWrappers.set(prefetch.floor, wrapper);
    void prefetch.attemptPromise.then(
      (result) => {
        if (!wrapper.open || floorRecords.get(prefetch.floor) !== prefetch || prefetch.generation !== floorGenerations.get(prefetch.floor)) return;
        if (result === 'ready' || prefetch.fallbackKind === 'procedural') {
          wrapper.open = false;
          wrapper.deferred.resolve(result);
          return;
        }
        if (prefetch.fallbackKind === 'operational') {
          startEntryRetry(prefetch, wrapper);
          return;
        }
        wrapper.open = false;
        wrapper.deferred.resolve(result);
      },
      (error: unknown) => {
        if (!wrapper.open) return;
        wrapper.open = false;
        wrapper.deferred.reject(error);
      },
    );
    return wrapper;
  }

  function requireFloor(floor: unknown): asserts floor is Floor {
    if (!isFloor(floor)) throw new RangeError('Invalid floor.');
  }

  return {
    loadCommon(): Promise<LoadResult> {
      if (destroyed) return Promise.resolve('fallback');
      return (commonRecord ?? startCommon()).attemptPromise;
    },

    loadFloor(floor: Floor): Promise<LoadResult> {
      requireFloor(floor);
      if (destroyed) return Promise.resolve('fallback');
      const record = floorRecords.get(floor);
      if (record === undefined) return startFloor(floor, 'entry').publicPromise;
      if (record.origin !== 'prefetch') return record.publicPromise;
      const existingWrapper = floorWrappers.get(floor);
      if (existingWrapper !== undefined && (existingWrapper.open || existingWrapper.retry !== undefined)) {
        return existingWrapper.promise;
      }
      if (record.status === 'settled' && record.fallbackKind !== 'operational') {
        return record.publicPromise;
      }
      return wrapperForPrefetch(record).promise;
    },

    prefetchFloor(floor: Floor): void {
      requireFloor(floor);
      if (destroyed || floorRecords.has(floor)) return;
      const attempt = startFloor(floor, 'prefetch');
      void attempt.attemptPromise.catch(() => undefined);
    },

    releaseFloor(floor: Floor): void {
      requireFloor(floor);
      if (destroyed) return;
      const record = floorRecords.get(floor);
      const wrapper = floorWrappers.get(floor);
      if (wrapper !== undefined) settleWrapperFallback(wrapper);
      if (record !== undefined) {
        settleFallback(record, 'operational');
        closeAttemptSources(record);
        if (floorRecords.get(floor) === record) floorRecords.delete(floor);
      }
      floorWrappers.delete(floor);
      floorAssets.delete(floor);
      floorGenerations.set(floor, (floorGenerations.get(floor) ?? 1) + 1);
    },

    getCommonAssets(): CommonAssets | null {
      return destroyed ? null : commonAssets;
    },

    getFloorAssets(floor: Floor): FloorAssetBundle | null {
      requireFloor(floor);
      return destroyed ? null : floorAssets.get(floor) ?? null;
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (commonRecord !== null) {
        commonRecord.open = false;
        commonRecord.status = 'settled';
        clearAttemptTimer(commonRecord);
        orphanAtlasStates(commonRecord);
        commonRecord.deferred.resolve('fallback');
        closeAttemptSources(commonRecord);
      }
      for (const [floor, record] of floorRecords) {
        const wrapper = floorWrappers.get(floor);
        if (wrapper !== undefined) settleWrapperFallback(wrapper);
        record.open = false;
        record.status = 'settled';
        clearAttemptTimer(record);
        orphanAtlasStates(record);
        record.deferred.resolve('fallback');
        closeAttemptSources(record);
        floorGenerations.set(floor, record.generation + 1);
      }
      commonAssets = null;
      floorAssets.clear();
      floorRecords.clear();
      floorWrappers.clear();
      manifestRecord = null;
      commonRecord = null;
      commonGeneration += 1;
      for (const floor of [1, 2, 3, 4, 5] as const) {
        floorGenerations.set(floor, (floorGenerations.get(floor) ?? 1) + 1);
      }
    },
  };
}
