import { describe, expect, it } from 'vitest';
import { musicForRoute } from './audio-route';

describe('musicForRoute', () => {
  it('selects the fixed route music map', () => {
    expect(musicForRoute({ name: 'boot' })).toBeNull();
    expect(musicForRoute({ name: 'tower' })).toBe('tower');
    expect(musicForRoute({ name: 'floor-intro', floor: 4 })).toBe('tower');
    expect(musicForRoute({ name: 'match', floor: 1, seed: 1 })).toBe('early-floors');
    expect(musicForRoute({ name: 'result', floor: 2, result: 'loss' })).toBe('early-floors');
    expect(musicForRoute({ name: 'match', floor: 3, seed: 1 })).toBe('late-floors');
    expect(musicForRoute({ name: 'result', floor: 4, result: 'win' })).toBe('late-floors');
    expect(musicForRoute({ name: 'match', floor: 5, seed: 1 })).toBe('demon-king');
    expect(musicForRoute({ name: 'ending' })).toBe('ending');
  });
});
