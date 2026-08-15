import { describe, expect, it } from 'vitest';
import { RandomStream, counterU32, randomInt } from '../../src/core/random';

describe('counter RNG', () => {
  it('matches a stable vector and isolates streams', () => {
    const values = [0, 1, 2, 3, 4].map((i) => counterU32(0x12345678, RandomStream.PIECE_BAG, i));
    expect(values).toEqual([1207327010, 3383226662, 2337268077, 2678027879, 1617876997]);
    expect(counterU32(0x12345678, RandomStream.ITEM, 0)).toBe(666545579);
    expect(randomInt(7, RandomStream.GARBAGE_TO_PLAYER, 12, 10)).toBeGreaterThanOrEqual(0);
    expect(randomInt(7, RandomStream.GARBAGE_TO_PLAYER, 12, 10)).toBeLessThan(10);
  });
});
