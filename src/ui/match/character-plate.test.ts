import { describe, expect, it } from 'vitest';
import { createMatch, createPublicMatchView } from '../../core';
import { createCharacterPlateModel } from './character-plate';

const portrait = { alt: 'RIVAL panic portrait', state: 'panic' as const };

describe('character plate model', () => {
  it('maps incoming pressure to a visible danger state without exposing its count', () => {
    const side = createPublicMatchView(createMatch({ matchSeed: 5 })).sides.opponent;
    const model = createCharacterPlateModel(
      { id: 'glass-oracle', name: '유리 예언자 프리즘', title: '거울 회랑의 관리자' },
      'opponent',
      portrait,
      { ...side, incoming: 4 },
    );

    expect(model).toMatchObject({
      characterId: 'glass-oracle',
      danger: true,
      name: '유리 예언자 프리즘',
    });
    expect(model).not.toHaveProperty('incoming');
  });

  it('marks a top-out side as dangerous even without incoming blocks', () => {
    const side = createPublicMatchView(createMatch({ matchSeed: 5 })).sides.player;
    expect(createCharacterPlateModel(
      { id: 'hero-engineer', name: '견습 마도공학자', title: '별빛 수리공' },
      'player',
      { alt: 'PLAYER idle portrait', state: 'idle' },
      { ...side, topOut: true },
    ).danger).toBe(true);
  });
});
