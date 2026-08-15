// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, createPublicMatchView } from '../core/index';
import { battleAnimationFrameNames } from './battle-animation-registry';
import { BattleTextureCache } from './battle-texture-cache';
import type { BoardSkin } from './board-skin';
import { BoardScene } from './BoardScene';

const drawBoardPrimitivesSpy = vi.hoisted(() => vi.fn());

vi.mock('@pixi/react', () => ({ extend: vi.fn() }));
vi.mock('./draw-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./draw-primitives')>();
  return { ...actual, drawBoardPrimitives: drawBoardPrimitivesSpy };
});
vi.mock('pixi.js', () => ({
  AnimatedSprite: class AnimatedSprite {}, Container: class Container {}, Graphics: class Graphics {},
  Sprite: class Sprite {}, Text: class Text {},
}));

afterEach(cleanup);

const atlasFor = (group: 'land-impact' | 'line-clear') => Object.fromEntries(
  battleAnimationFrameNames(group).map((name) => [name, {}]),
) as never;

function drawCallback(element: Element): (graphics: unknown) => void {
  const propsKey = Object.keys(element).find((key) => key.startsWith('__reactProps$'));
  const props = propsKey === undefined
    ? undefined
    : (element as unknown as Record<string, { readonly draw?: unknown }>)[propsKey];
  if (typeof props?.draw !== 'function') throw new Error('pixiGraphics draw callback is unavailable');
  return props.draw as (graphics: unknown) => void;
}

describe('BoardScene textured effect placement', () => {
  it('rises one garbage batch from its owning snapshot and clips it in the content layer', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 5 }));
    const snapshotBoard = view.sides.player.board.map((cell, index) => (
      index === 19 * 10 ? { kind: 'O' as const, garbage: true as const } : cell
    ));
    const latestBoard = view.sides.player.board.map((cell, index) => (
      index === 4 * 10 ? { kind: 'T' as const } : cell
    ));
    const snapshot = {
      ...view,
      sides: { ...view.sides, player: { ...view.sides.player, active: null, board: snapshotBoard } },
    };
    const effect = {
      event: { amount: 3, holeColumns: [3, 2, 4], side: 'player' as const, type: 'garbage-raised' as const },
      group: 'garbage-land' as const,
      id: 'garbage-9',
      presentationProgress: 0,
      priority: 'critical' as const,
      side: 'player' as const,
      tick: 9,
      view: snapshot,
    };
    const result = render(
      <BoardScene
        effectProgress={0}
        effects={[effect]}
        model={{ ...view.sides.player, active: null, board: latestBoard }}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        selectedRow={null}
        side="player"
      />,
    );

    const content = document.querySelector('pixicontainer[data-content-offset-rows]');
    expect(content).toHaveAttribute('data-content-offset-rows', '3');
    expect(content).toHaveAttribute('y', '30');
    expect(document.querySelector('[data-testid="board-content-mask"]')).not.toBeNull();
    const contentGraphics = document.querySelector('[data-testid="board-content-graphics"]');
    drawCallback(contentGraphics! as Element)({});
    expect(drawBoardPrimitivesSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ garbage: true, role: 'fixed-cell', x: 0, y: 19 })]),
      100,
      200,
    );
    expect(drawBoardPrimitivesSpy.mock.calls.at(-1)?.[1]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'T', role: 'fixed-cell', x: 0, y: 4 })]),
    );

    result.rerender(
      <BoardScene
        effectProgress={1}
        effects={[{ ...effect, presentationProgress: 1 }]}
        model={{ ...view.sides.player, active: null, board: latestBoard }}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        selectedRow={null}
        side="player"
      />,
    );
    expect(document.querySelector('pixicontainer[data-content-offset-rows]'))
      .toHaveAttribute('data-content-offset-rows', '0');
  });

  it('restores content alpha without displacement when reduced motion is requested', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 5 }));
    const effect = {
      event: { amount: 3, holeColumns: [3, 2, 4], side: 'player' as const, type: 'garbage-raised' as const },
      group: 'garbage-land' as const,
      id: 'garbage-9',
      presentationProgress: 0,
      priority: 'critical' as const,
      side: 'player' as const,
      tick: 9,
      view,
    };
    const result = render(
      <BoardScene
        effectProgress={0}
        effects={[effect]}
        model={view.sides.player}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        reducedMotion
        selectedRow={null}
        side="player"
      />,
    );

    expect(document.querySelector('pixicontainer[data-content-offset-rows]'))
      .toHaveAttribute('data-content-offset-rows', '0');
    expect(document.querySelector('pixicontainer[data-content-alpha]'))
      .toHaveAttribute('data-content-alpha', '0.7');

    result.rerender(
      <BoardScene
        effectProgress={1}
        effects={[{ ...effect, presentationProgress: 1 }]}
        model={view.sides.player}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        reducedMotion
        selectedRow={null}
        side="player"
      />,
    );
    expect(document.querySelector('pixicontainer[data-content-alpha]'))
      .toHaveAttribute('data-content-alpha', '1');
  });

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

  it('resolves item, garbage, and kind textures through the cache while missing skin cells stay procedural', () => {
    const view = createPublicMatchView(createMatch({ matchSeed: 5 }));
    const image = (path: string) => ({ generation: 1, ref: { path }, source: { path } as unknown as ImageBitmap, url: `/assets/${path}` });
    const skin: BoardSkin = {
      blocks: { O: image('tiles/o.png') },
      garbage: image('tiles/garbage.png'),
      items: { freeze: image('items/freeze.png') },
    };
    const created: { readonly imagePath: string; readonly source: { scaleMode: string } }[] = [];
    class Texture {
      static from = vi.fn((source: unknown) => {
        const texture = {
          destroy: vi.fn(),
          imagePath: (source as { readonly path: string }).path,
          source: { scaleMode: 'linear' },
        };
        created.push(texture);
        return texture;
      });
    }
    const cache = new BattleTextureCache(Texture as never);
    const board = view.sides.player.board.map((cell, index) => {
      if (index === 0) return { kind: 'O' as const, marker: 'freeze' as const };
      if (index === 1) return { kind: 'O' as const, garbage: true as const };
      if (index === 2) return { kind: 'O' as const };
      if (index === 3) return { kind: 'I' as const };
      return cell;
    });

    render(
      <BoardScene
        effectProgress={0}
        effects={[]}
        model={{ ...view.sides.player, active: null, board }}
        rect={{ height: 200, width: 100, x: 0, y: 0 }}
        selectedRow={null}
        side="player"
        skin={skin}
        textureCache={cache}
      />,
    );

    expect(document.querySelectorAll('pixisprite')).toHaveLength(3);
    expect(Texture.from).toHaveBeenCalledTimes(3);
    expect(created.map((texture) => texture.imagePath)).toEqual([
      'items/freeze.png', 'tiles/garbage.png', 'tiles/o.png',
    ]);
    expect(created.map((texture) => texture.source.scaleMode)).toEqual(['nearest', 'nearest', 'nearest']);
    const graphics = document.querySelector('[data-testid="board-content-graphics"]');
    expect(graphics).not.toBeNull();
    const graphicsDouble = {};
    drawCallback(graphics!)(graphicsDouble);
    expect(drawBoardPrimitivesSpy).toHaveBeenLastCalledWith(
      graphicsDouble,
      expect.arrayContaining([expect.objectContaining({ kind: 'I', role: 'fixed-cell', x: 3, y: 0 })]),
      100,
      200,
    );
  });
});
