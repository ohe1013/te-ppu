import { describe, expect, it } from 'vitest';
import { rowAtPointer } from './row-selection';

function boardRect(top: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 20,
    right: 180,
    top,
    width: 160,
    x: 20,
    y: top,
    toJSON: () => ({}),
  };
}

describe('rowAtPointer', () => {
  it.each([
    [99.9, null],
    [100, 0],
    [115.999, 0],
    [116, 1],
    [419.999, 19],
    [420, null],
  ] as const)('maps clientY %s to visible row %s', (clientY, expected) => {
    expect(rowAtPointer(clientY, boardRect(100, 320))).toBe(expected);
  });

  it('rejects non-finite coordinates and empty board rectangles', () => {
    expect(rowAtPointer(Number.NaN, boardRect(100, 320))).toBeNull();
    expect(rowAtPointer(100, boardRect(100, 0))).toBeNull();
  });
});
