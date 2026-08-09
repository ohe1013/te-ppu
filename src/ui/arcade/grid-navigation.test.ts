import { describe, expect, it } from 'vitest';
import { moveNameKey } from './grid-navigation';

describe('moveNameKey', () => {
  it('moves through the fixed keyboard without wrapping across row edges', () => {
    expect(moveNameKey('A', 'left')).toBe('A');
    expect(moveNameKey('A', 'right')).toBe('B');
    expect(moveNameKey('F', 'right')).toBe('F');
    expect(moveNameKey('S', 'down')).toBe('Y');
    expect(moveNameKey('W', 'down')).toBe('END');
  });

  it('chooses the vertically nearest key center for the action keys', () => {
    expect(moveNameKey('Z', 'right')).toBe('DEL');
    expect(moveNameKey('DEL', 'up')).toBe('U');
    expect(moveNameKey('END', 'up')).toBe('W');
    expect(moveNameKey('END', 'right')).toBe('END');
  });

  it('stays on the first and last rows when vertical movement cannot continue', () => {
    expect(moveNameKey('C', 'up')).toBe('C');
    expect(moveNameKey('DEL', 'down')).toBe('DEL');
  });
});
