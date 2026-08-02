import { describe, expect, it } from 'vitest';
import { computeBoardLayout } from './board-layout';

describe('computeBoardLayout', () => {
  it.each([
    {
      stage: [328, 320] as const,
      viewport: '360x640',
      expected: {
        gap: 8,
        opponent: { height: 320, width: 160, x: 168, y: 0 },
        player: { height: 320, width: 160, x: 0, y: 0 },
      },
    },
    {
      stage: [398, 388] as const,
      viewport: '430x932',
      expected: {
        gap: 8,
        opponent: { height: 388, width: 194, x: 203, y: 0 },
        player: { height: 388, width: 194, x: 1, y: 0 },
      },
    },
  ])('keeps exact equal 10x20 boards at $viewport', ({ expected, stage }) => {
    const layout = computeBoardLayout(stage[0], stage[1]);

    expect(layout).toEqual(expected);
    expect(layout.player.width).toBe(layout.opponent.width);
    expect(layout.player.height).toBe(layout.opponent.height);
    expect(layout.player.height / layout.player.width).toBe(2);
  });

  it('fits both boards inside a smaller height without changing their ratio', () => {
    const layout = computeBoardLayout(328, 240);

    expect(layout).toEqual({
      gap: 8,
      opponent: { height: 240, width: 120, x: 168, y: 0 },
      player: { height: 240, width: 120, x: 40, y: 0 },
    });
  });
});
