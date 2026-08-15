import { describe, expect, it } from 'vitest';
import { musicForRoute } from './audio-route';

describe('musicForRoute', () => {
  it('selects the fixed route music map', () => {
    expect(musicForRoute({ name: 'boot' })).toBeNull();
    expect(musicForRoute({ name: 'title' })).toBe('tower');
    expect(musicForRoute({ name: 'name-entry', intent: 'start-run' })).toBe('tower');
    expect(musicForRoute({
      name: 'character-select',
      intent: 'change-player',
      initials: 'LUM',
    })).toBe('tower');
    expect(musicForRoute({ name: 'ranking' })).toBe('tower');
    expect(musicForRoute({ name: 'tower' })).toBe('tower');
    expect(musicForRoute({ name: 'floor-intro', floor: 4, encounterIndex: 0, wins: 0 })).toBe('tower');
    expect(musicForRoute({ name: 'match', floor: 1, encounterIndex: 0, wins: 0, seed: 1 })).toBe('early-floors');
    expect(musicForRoute({ name: 'result', floor: 2, encounterIndex: 0, wins: 0, result: 'loss', seriesComplete: false })).toBe('early-floors');
    expect(musicForRoute({ name: 'match', floor: 3, encounterIndex: 0, wins: 0, seed: 1 })).toBe('late-floors');
    expect(musicForRoute({ name: 'result', floor: 4, encounterIndex: 2, wins: 2, result: 'win', seriesComplete: true })).toBe('late-floors');
    expect(musicForRoute({ name: 'match', floor: 5, encounterIndex: 0, wins: 0, seed: 1 })).toBe('demon-king');
    expect(musicForRoute({ name: 'ending' })).toBe('ending');
  });
});
