import type { AtlasData } from '../assets';
import type { Texture } from 'pixi.js';
import type { BattleAtlasTextures } from './battle-animation-registry';

interface TextureConstructor {
  from(source: ImageBitmap | HTMLImageElement): Texture;
  new (options: { readonly source?: unknown; readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }): Texture;
}

interface CachedAtlas {
  readonly generation: number;
  readonly image: AtlasData['image'];
  readonly base: Texture;
  readonly frames: BattleAtlasTextures;
}

export class BattleTextureCache {
  #atlas: CachedAtlas | null = null;

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
        frame: { height: entry.frame.h, width: entry.frame.w, x: entry.frame.x, y: entry.frame.y },
        source: base.source,
      });
    }
    this.#atlas = { base, frames, generation: atlas.generation, image: atlas.image };
    return frames as BattleAtlasTextures;
  }

  destroy(): void {
    const cached = this.#atlas;
    if (cached === null) return;
    this.#atlas = null;
    for (const texture of Object.values(cached.frames)) texture?.destroy(false);
    cached.base.destroy(false);
  }
}
