import { describe, expect, it, vi } from 'vitest';
import type { AtlasData, LoadedImageRef } from '../assets';
import { BattleTextureCache } from './battle-texture-cache';

const image = (generation: number): LoadedImageRef => ({
  generation,
  ref: { path: 'effects/battle-atlas.png' },
  source: { close: vi.fn() } as unknown as ImageBitmap,
  url: '/assets/effects/battle-atlas.png',
});

const atlas = (generation: number): AtlasData => ({
  generation,
  image: image(generation),
  json: {
    frames: {
      'move-dust/00.png': {
        frame: { x: 0, y: 0, w: 64, h: 64 }, rotated: false, trimmed: false,
        sourceSize: { w: 64, h: 64 }, spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      },
    },
    meta: { format: 'RGBA8888', image: 'battle-atlas.png', scale: '1', size: { w: 64, h: 64 } },
  },
});

describe('BattleTextureCache', () => {
  it('reuses a generation then destroys only Pixi wrappers when it changes or is released', () => {
    const base = { destroy: vi.fn(), source: {} };
    const frames: { destroy: ReturnType<typeof vi.fn> }[] = [];
    class Texture {
      static from = vi.fn(() => base);
      destroy = vi.fn();
      constructor(_: unknown) { frames.push(this); }
    }
    const first = atlas(1);
    const cache = new BattleTextureCache(Texture as never);

    expect(cache.resolveAtlas(first)).toEqual({ 'move-dust/00.png': frames[0] });
    expect(cache.resolveAtlas(first)).toEqual({ 'move-dust/00.png': frames[0] });
    expect(Texture.from).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
    expect((first.image.source as ImageBitmap).close).not.toHaveBeenCalled();

    cache.resolveAtlas(atlas(2));
    expect(base.destroy).toHaveBeenCalledWith(false);
    expect(frames[0]?.destroy).toHaveBeenCalledWith(false);
    cache.destroy();
    cache.destroy();
    expect((first.image.source as ImageBitmap).close).not.toHaveBeenCalled();
  });
});
