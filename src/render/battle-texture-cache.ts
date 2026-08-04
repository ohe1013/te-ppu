import type { AtlasData, LoadedImageRef } from '../assets';
import { Rectangle, type Texture } from 'pixi.js';
import type { BattleAtlasTextures } from './battle-animation-registry';

interface TextureConstructor {
  from(source: ImageBitmap | HTMLImageElement): Texture;
  new (options: ConstructorParameters<typeof Texture>[0]): Texture;
}

interface CachedAtlas {
  readonly generation: number;
  readonly image: AtlasData['image'];
  readonly base: Texture;
  readonly frames: BattleAtlasTextures;
}

interface CachedImage {
  readonly generation: number;
  readonly image: LoadedImageRef;
  readonly texture: Texture;
}

export class BattleTextureCache {
  #atlas: CachedAtlas | null = null;
  #images = new Map<string, CachedImage>();

  constructor(private readonly Texture: TextureConstructor) {}

  resolveAtlas(atlas: AtlasData): BattleAtlasTextures {
    const cached = this.#atlas;
    if (cached !== null && cached.image === atlas.image && cached.generation === atlas.generation) {
      return cached.frames;
    }
    this.destroy();
    const base = this.Texture.from(atlas.image.source);
    const frames: Partial<Record<string, Texture>> = {};
    for (const [name, entry] of Object.entries(atlas.json.frames)) {
      frames[name] = new this.Texture({
        frame: new Rectangle(entry.frame.x, entry.frame.y, entry.frame.w, entry.frame.h),
        source: base.source,
      });
    }
    this.#atlas = { base, frames, generation: atlas.generation, image: atlas.image };
    return frames as BattleAtlasTextures;
  }

  resolveImage(image: LoadedImageRef): Texture {
    const key = image.ref.path;
    const cached = this.#images.get(key);
    if (cached !== undefined && cached.image === image && cached.generation === image.generation) {
      return cached.texture;
    }
    cached?.texture.destroy(false);
    const texture = this.Texture.from(image.source);
    texture.source.scaleMode = 'nearest';
    this.#images.set(key, { generation: image.generation, image, texture });
    return texture;
  }

  destroy(): void {
    const cached = this.#atlas;
    this.#atlas = null;
    if (cached !== null) {
      for (const texture of Object.values(cached.frames)) texture?.destroy(false);
      cached.base.destroy(false);
    }
    for (const { texture } of this.#images.values()) texture.destroy(false);
    this.#images.clear();
  }
}
