import type { ItemType, PieceKind } from '../core';
import type { MusicTrack, SoundCue } from '../platform/audio-port';
import type { Floor } from '../progression';

export type CharacterId =
  | 'hero-engineer' | 'owl-companion' | 'quartermaster' | 'alchemist'
  | 'guard-captain' | 'dark-engineer' | 'demon-king';

export type PortraitState =
  | 'idle' | 'focus' | 'attack' | 'hit' | 'win' | 'loss'
  | 'panic' | 'smug' | 'defeat' | 'rage' | 'worry' | 'cheer';

export interface ManifestRef {
  readonly path: string;
}

export type HeroPortraitState =
  | 'idle' | 'focus' | 'attack' | 'hit' | 'win' | 'loss';
export type LieutenantPortraitState =
  | 'idle' | 'smug' | 'attack' | 'hit' | 'panic' | 'defeat';
export type DemonKingPortraitState =
  | 'idle' | 'attack' | 'hit' | 'rage' | 'defeat';
export type OwlPortraitState = 'idle' | 'worry' | 'cheer';
export type UiIconId =
  | 'rotate' | 'settings' | 'sound-on' | 'sound-off'
  | 'haptics-on' | 'haptics-off' | 'exit';

type HeroPortraits = Readonly<Record<HeroPortraitState, ManifestRef>>;
type LieutenantPortraits = Readonly<Record<LieutenantPortraitState, ManifestRef>>;
type DemonKingPortraits = Readonly<Record<DemonKingPortraitState, ManifestRef>>;
type OwlPortraits = Readonly<Record<OwlPortraitState, ManifestRef>>;

interface CharacterManifest<P extends object> {
  readonly fullArt: ManifestRef;
  readonly portraits: P;
}

interface AuthoredAssetManifestV1 {
  readonly schemaVersion: 1;
  readonly mode: 'assets';
  readonly brand: { readonly logo: ManifestRef };
  readonly common: {
    readonly backgrounds: { readonly tower: ManifestRef };
    readonly characters: {
      readonly 'hero-engineer': CharacterManifest<HeroPortraits>;
      readonly 'owl-companion': CharacterManifest<OwlPortraits>;
    };
    readonly tiles: Readonly<Record<PieceKind | 'garbage', ManifestRef>>;
    readonly items: Readonly<Record<ItemType, ManifestRef>>;
    readonly icons: Readonly<Record<UiIconId, ManifestRef>>;
    readonly atlas: { readonly image: ManifestRef; readonly data: ManifestRef };
    readonly audio: {
      readonly sfx: Readonly<Record<SoundCue, ManifestRef>>;
      readonly bgm: Readonly<Record<MusicTrack, ManifestRef>>;
    };
  };
  readonly floors: {
    readonly '1': {
      readonly opponent: 'quartermaster';
      readonly background: ManifestRef;
      readonly music: 'early-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '2': {
      readonly opponent: 'alchemist';
      readonly background: ManifestRef;
      readonly music: 'early-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '3': {
      readonly opponent: 'guard-captain';
      readonly background: ManifestRef;
      readonly music: 'late-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '4': {
      readonly opponent: 'dark-engineer';
      readonly background: ManifestRef;
      readonly music: 'late-floors';
      readonly character: CharacterManifest<LieutenantPortraits>;
    };
    readonly '5': {
      readonly opponent: 'demon-king';
      readonly background: ManifestRef;
      readonly music: 'demon-king';
      readonly character: CharacterManifest<DemonKingPortraits>;
    };
  };
}

export type AssetManifestV1 =
  | { readonly schemaVersion: 1; readonly mode: 'procedural-fallback' }
  | AuthoredAssetManifestV1;

export interface LoadedImageRef {
  readonly ref: ManifestRef;
  readonly url: string;
  readonly source: ImageBitmap | HTMLImageElement;
  readonly generation: number;
}

export interface ResolvedAudioRef {
  readonly ref: ManifestRef;
  readonly url: string;
  readonly generation: number;
}

export interface TexturePackerFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly rotated: false;
  readonly trimmed: boolean;
  readonly spriteSourceSize: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly sourceSize: { readonly w: number; readonly h: number };
}

export interface TexturePackerAtlasJson {
  readonly frames: Readonly<Record<string, TexturePackerFrame>>;
  readonly meta: {
    readonly image: 'battle-atlas.png';
    readonly format: 'RGBA8888';
    readonly scale: '1';
    readonly size: { readonly w: number; readonly h: number };
  };
}

export interface AtlasData {
  readonly image: LoadedImageRef;
  readonly json: TexturePackerAtlasJson;
  readonly generation: number;
}

export interface CommonAssets {
  readonly generation: number;
  readonly logo?: LoadedImageRef;
  readonly towerBackdrop?: LoadedImageRef;
  readonly hero: {
    readonly fullArt?: LoadedImageRef;
    readonly portraits: Partial<Record<HeroPortraitState, LoadedImageRef>>;
  };
  readonly owl: {
    readonly fullArt?: LoadedImageRef;
    readonly portraits: Partial<Record<OwlPortraitState, LoadedImageRef>>;
  };
  readonly tiles: Partial<Record<PieceKind | 'garbage', LoadedImageRef>>;
  readonly items: Partial<Record<ItemType, LoadedImageRef>>;
  readonly icons: Partial<Record<UiIconId, LoadedImageRef>>;
  readonly atlas?: AtlasData;
  readonly audio: {
    readonly sfx: Readonly<Record<SoundCue, ResolvedAudioRef>>;
    readonly bgm: Readonly<Record<MusicTrack, ResolvedAudioRef>>;
  };
}

export type FloorOpponentId =
  | 'quartermaster' | 'alchemist' | 'guard-captain'
  | 'dark-engineer' | 'demon-king';

export interface FloorAssetBundle {
  readonly floor: Floor;
  readonly opponent: FloorOpponentId;
  readonly music: MusicTrack;
  readonly generation: number;
  readonly background?: LoadedImageRef;
  readonly fullArt?: LoadedImageRef;
  readonly portraits: Partial<Record<PortraitState, LoadedImageRef>>;
}

export interface AssetManager {
  loadCommon(): Promise<'ready' | 'fallback'>;
  loadFloor(floor: Floor): Promise<'ready' | 'fallback'>;
  prefetchFloor(floor: Floor): void;
  releaseFloor(floor: Floor): void;
  getCommonAssets(): CommonAssets | null;
  getFloorAssets(floor: Floor): FloorAssetBundle | null;
  destroy(): void;
}

export interface AssetLoadScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CreateAssetManagerOptions {
  readonly fetchManifest: (url: string) => Promise<unknown>;
  readonly loadImage: (url: string) => Promise<ImageBitmap | HTMLImageElement>;
  readonly loadAtlasJson: (url: string) => Promise<unknown>;
  readonly loadTimeoutMs?: number;
  readonly scheduler?: AssetLoadScheduler;
}
