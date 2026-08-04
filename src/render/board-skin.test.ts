import { describe, expect, it } from 'vitest';
import { partitionBoardPrimitives, type BoardSkin } from './board-skin';

describe('partitionBoardPrimitives', () => {
  it('does not hide an item marker behind its base block when its texture is missing', () => {
    const skin: BoardSkin = { blocks: {}, items: {} };
    const primitives = [
      { height: 1, kind: 'O' as const, marker: 'freeze' as const, role: 'fixed-cell' as const, width: 1, x: 0, y: 0 },
      { height: .5, marker: 'freeze' as const, role: 'item-marker' as const, width: .5, x: .25, y: .25 },
    ];

    expect(partitionBoardPrimitives(primitives, skin, 100, 200)).toEqual({
      fallback: primitives,
      textured: [],
    });
  });
});
