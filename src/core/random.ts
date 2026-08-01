export const enum RandomStream {
  PIECE_BAG = 1,
  ITEM = 2,
  GARBAGE_TO_PLAYER = 3,
  GARBAGE_TO_OPPONENT = 4,
  AI_MISTAKE = 5,
}

export function counterU32(seed: number, stream: RandomStream, index: number, lane = 0): number {
  let x = (seed ^ Math.imul(stream + 1, 0x9e3779b9) ^ Math.imul(index + 1, 0x85ebca6b) ^ Math.imul(lane + 1, 0xc2b2ae35)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function randomInt(seed: number, stream: RandomStream, index: number, maxExclusive: number, lane = 0): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError('maxExclusive must be positive');
  return Math.floor((counterU32(seed, stream, index, lane) / 0x1_0000_0000) * maxExclusive);
}
