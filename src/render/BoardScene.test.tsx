// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../core/index';
import { battleAnimationFrameNames } from './battle-animation-registry';
import { BoardScene } from './BoardScene';

vi.mock('@pixi/react', () => ({ extend: vi.fn() }));
vi.mock('pixi.js', () => ({
  AnimatedSprite: class AnimatedSprite {}, Container: class Container {}, Graphics: class Graphics {},
  Sprite: class Sprite {}, Text: class Text {},
}));

afterEach(cleanup);

const atlasFor = (group: 'land-impact' | 'line-clear') => Object.fromEntries(
  battleAnimationFrameNames(group).map((name) => [name, {}]),
) as never;

describe('BoardScene textured effect placement', () => {
  it('uses every cleared row from the batch effect rather than one centered sprite', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 5 }));
    render(
      <BoardScene
        atlas={atlasFor('line-clear')}
        effectProgress={0}
        effects={[{
          event: { amount: 2, rows: [2, 13], side: 'player', type: 'lines-cleared' },
          group: 'line-clear', id: 'clear', priority: 'critical', side: 'player', tick: 4, view,
        }]}
        model={{ ...view.sides.player, active: null }}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        selectedRow={null}
        side="player"
      />,
    );

    const sprites = document.querySelectorAll('pixianimatedsprite');
    expect([...sprites].map((sprite) => sprite.getAttribute('y'))).toEqual(['25', '135']);
  });

  it('uses the effect batch board rather than the latest model to locate land impact', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 5 }));
    const snapshot = {
      ...view,
      sides: {
        ...view.sides,
        player: {
          ...view.sides.player,
          board: view.sides.player.board.map((cell, index) => index === 17 * 10 ? { kind: 'O' as const } : cell),
        },
      },
    };
    render(
      <BoardScene
        atlas={atlasFor('land-impact')}
        effectProgress={0}
        effects={[{
          event: { side: 'player', type: 'piece-locked' },
          group: 'land-impact', id: 'land', priority: 'critical', side: 'player', tick: 4, view: snapshot,
        }]}
        model={view.sides.player}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        selectedRow={null}
        side="player"
      />,
    );

    expect(document.querySelector('pixianimatedsprite')?.getAttribute('y')).toBe('178');
  });
});
