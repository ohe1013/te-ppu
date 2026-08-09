import { describe, expect, it } from 'vitest';
import {
  PLAYER_CHARACTER_IDS,
  isPlayerCharacterId,
  isPlayerProfile,
} from './index';

describe('player profile', () => {
  it('accepts only three uppercase initials and the three playable ids', () => {
    expect(PLAYER_CHARACTER_IDS).toEqual([
      'hero-engineer',
      'cloud-courier',
      'star-alchemist',
    ]);
    expect(isPlayerProfile({ initials: 'RVT', characterId: 'hero-engineer' })).toBe(true);
    expect(isPlayerProfile({ initials: 'rvT', characterId: 'hero-engineer' })).toBe(false);
    expect(isPlayerProfile({ initials: 'FOUR', characterId: 'hero-engineer' })).toBe(false);
    expect(isPlayerCharacterId('demon-king')).toBe(false);
  });
});
