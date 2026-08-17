import { describe, expect, it } from 'vitest';
import { NAME_KEY_ROWS, moveNameKey } from './grid-navigation';

describe('moveNameKey', () => {
  it('moves through the fixed keyboard without wrapping across row edges', () => {
    expect(moveNameKey('A', 'left')).toBe('A');
    expect(moveNameKey('A', 'right')).toBe('B');
    expect(moveNameKey('F', 'right')).toBe('F');
    expect(moveNameKey('S', 'down')).toBe('Y');
    expect(moveNameKey('W', 'down')).toBe('DEL');
  });

  it('gives DEL the former DEL and END width without keeping END in the grid', () => {
    expect(NAME_KEY_ROWS.at(-1)).toEqual([
      { key: 'Y', columnStart: 0, columnEnd: 0 },
      { key: 'Z', columnStart: 1, columnEnd: 1 },
      { key: 'DEL', columnStart: 2, columnEnd: 5 },
    ]);
    expect(NAME_KEY_ROWS.flat().map(({ key }) => key)).not.toContain('END');
  });

  it('chooses the vertically nearest key center for the enlarged DEL key', () => {
    expect(moveNameKey('T', 'down')).toBe('Z');
    expect(moveNameKey('U', 'down')).toBe('Z');
    expect(moveNameKey('V', 'down')).toBe('DEL');
    expect(moveNameKey('W', 'down')).toBe('DEL');
    expect(moveNameKey('Z', 'right')).toBe('DEL');
    expect(moveNameKey('DEL', 'up')).toBe('V');
    expect(moveNameKey('DEL', 'right')).toBe('DEL');
  });

  it('stays on the first and last rows when vertical movement cannot continue', () => {
    expect(moveNameKey('C', 'up')).toBe('C');
    expect(moveNameKey('DEL', 'down')).toBe('DEL');
  });
});
