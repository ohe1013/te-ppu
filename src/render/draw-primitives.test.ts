import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type PublicSideView,
} from '../core/index';
import type { AnimationEffect } from './event-animation-queue';
import { createBoardPrimitives } from './draw-primitives';
import { partitionBoardPrimitives, type BoardSkin } from './board-skin';

function sideView(): PublicSideView {
  const board: PublicSideView['board'][number][] = Array.from(
    { length: 200 },
    () => null,
  );
  board[190] = { kind: 'T', marker: 'freeze' };
  board[199] = { kind: 'O' };

  return {
    active: {
      rotation: 0,
      token: {
        kind: 'T',
        marker: { item: 'row-clear', minoIndex: 1 },
      },
      x: 3,
      y: 1,
    },
    board,
    combo: 2,
    freezeTicks: 12,
    ghostY: 17,
    incoming: 3,
    inventory: { freeze: 0, queueSwap: 0, rowClear: 0 },
    next: [
      { kind: 'I', marker: null },
      { kind: 'L', marker: null },
    ],
    phase: 'active',
    topOut: false,
  };
}

const effectView = createPublicMatchView(createMatch({ matchSeed: 4 }));

const effects: readonly AnimationEffect[] = [
  {
    command: { command: { type: 'move', dx: -1 }, sequence: 0, side: 'player', tick: 0 },
    group: 'move-dust', id: 'move-1', priority: 'decorative', side: 'player', tick: 0, view: effectView,
  },
  {
    command: { command: { type: 'rotate-clockwise' }, sequence: 1, side: 'player', tick: 0 },
    group: 'rotate-spark', id: 'rotate-1', priority: 'decorative', side: 'player', tick: 0, view: effectView,
  },
  {
    event: { side: 'player', type: 'piece-locked' },
    group: 'land-impact', id: 'land-1', priority: 'critical', side: 'player', tick: 0, view: effectView,
  },
  {
    event: { amount: 1, rows: [19], side: 'player', type: 'lines-cleared' },
    id: 'clear-1',
    priority: 'critical',
    tick: 0,
    view: effectView,
  },
  {
    event: {
      amount: 1,
      column: 6,
      landingRow: 15,
      side: 'player',
      type: 'garbage-landed',
    },
    id: 'garbage-1',
    priority: 'critical',
    tick: 0,
    view: effectView,
  },
  {
    event: { amount: 1, side: 'player', type: 'attack-sent' },
    group: 'attack-shot', id: 'attack-1', priority: 'critical', side: 'player', tick: 0, view: effectView,
  },
  {
    event: { item: 'freeze', side: 'player', type: 'item-acquired' },
    group: 'item-acquire', id: 'item-1', priority: 'critical', side: 'player', tick: 0, view: effectView,
  },
  {
    event: { amount: 1, rows: [19], side: 'player', type: 'lines-cleared' },
    group: 'combo-pop', id: 'combo-1', priority: 'decorative', side: 'player', tick: 0, view: effectView,
  },
];

describe('createBoardPrimitives', () => {
  it('describes the visible grid, pieces, markers, warnings, and ordered effects', () => {
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects,
      model: sideView(),
      selectedRow: 7,
      side: 'player',
    });
    const roles = (role: (typeof primitives)[number]['role']) => (
      primitives.filter((primitive) => primitive.role === role)
    );

    expect(roles('grid-cell')).toHaveLength(200);
    expect(roles('fixed-cell')).toHaveLength(2);
    expect(roles('active-cell')).toHaveLength(4);
    expect(roles('ghost-cell')).toHaveLength(4);
    expect(roles('item-marker')).toHaveLength(2);
    expect(roles('selected-row')).toHaveLength(1);
    expect(roles('incoming')).toHaveLength(1);
    expect(roles('freeze')).toHaveLength(1);
    expect(roles('line-clear')).toHaveLength(1);
    expect(roles('garbage-drop')).toHaveLength(1);
    expect(roles('move-dust')).toHaveLength(1);
    expect(roles('rotate-spark')).toHaveLength(1);
    expect(roles('land-impact')).toHaveLength(1);
    expect(roles('attack')).toHaveLength(1);
    expect(roles('item-pulse')).toHaveLength(1);
    expect(roles('combo-pop')).toHaveLength(1);
  });

  it('flashes each exact visible cleared row once, including noncontiguous rows', () => {
    const event: AnimationEffect['event'] = {
      amount: 4,
      rows: [2, 13],
      side: 'player',
      type: 'lines-cleared',
    };
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects: [
        {
          event,
          id: 'clear-1',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
        {
          event,
          id: 'clear-1:particles',
          priority: 'decorative',
          tick: 0,
          view: effectView,
        },
      ],
      model: sideView(),
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.filter(({ role }) => role === 'line-clear')).toEqual([
      { height: 1, role: 'line-clear', width: 10, x: 0, y: 2 },
      { height: 1, role: 'line-clear', width: 10, x: 0, y: 13 },
    ]);
  });

  it.each([
    { effectProgress: 0, expectedY: 0 },
    { effectProgress: 0.5, expectedY: 9 },
    { effectProgress: 1, expectedY: 18 },
  ])('moves garbage through its exact column and landing row at $effectProgress progress', ({
    effectProgress,
    expectedY,
  }) => {
    const primitives = createBoardPrimitives({
      effectProgress,
      effects: [{
        event: {
          amount: 1,
          column: 4,
          landingRow: 18,
          side: 'player',
          type: 'garbage-landed',
        },
        id: 'garbage-exact',
        priority: 'critical',
        tick: 0,
        view: effectView,
      }],
      model: sideView(),
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.filter(({ role }) => role === 'garbage-drop')).toEqual([{
      height: 1,
      role: 'garbage-drop',
      width: 1,
      x: 4,
      y: expectedY,
    }]);
  });

  it('creates no positional fallback for missing, hidden, or invalid coordinates', () => {
    const primitives = createBoardPrimitives({
      effectProgress: 0.5,
      effects: [
        {
          event: { amount: 2, side: 'player', type: 'lines-cleared' },
          id: 'clear-missing',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
        {
          event: { amount: 2, rows: [-1, 20], side: 'player', type: 'lines-cleared' },
          id: 'clear-hidden',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
        {
          event: { amount: 1, side: 'player', type: 'garbage-landed' },
          id: 'garbage-missing',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
        {
          event: {
            amount: 1,
            column: 3,
            landingRow: -1,
            side: 'player',
            type: 'garbage-landed',
          },
          id: 'garbage-hidden',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
        {
          event: {
            amount: 1,
            column: 10,
            landingRow: 8,
            side: 'player',
            type: 'garbage-landed',
          },
          id: 'garbage-invalid',
          priority: 'critical',
          tick: 0,
          view: effectView,
        },
      ],
      model: sideView(),
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.filter(({ role }) => role === 'line-clear')).toEqual([]);
    expect(primitives.filter(({ role }) => role === 'garbage-drop')).toEqual([]);
  });

  it('clips active cells that remain in hidden spawn rows', () => {
    const model = sideView();
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects: [],
      model: {
        ...model,
        active: model.active === null ? null : { ...model.active, y: -2 },
        ghostY: null,
      },
      selectedRow: null,
      side: 'player',
    });

    expect(
      primitives
        .filter(({ role }) => role === 'active-cell')
        .every(({ y }) => y >= 0 && y < 20),
    ).toBe(true);
    expect(primitives.filter(({ role }) => role === 'active-cell')).toHaveLength(0);
  });

  it('places command feedback from its owning pre-step snapshot rather than the latest board model', () => {
    const latest = sideView();
    const snapshot = {
      ...effectView,
      sides: {
        ...effectView.sides,
        player: { ...effectView.sides.player, active: { ...latest.active!, x: 0, y: 4 } },
      },
    };
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects: [{
        command: { command: { type: 'move', dx: -1 }, sequence: 8, side: 'player', tick: 2 },
        group: 'move-dust', id: 'snapshot-move', priority: 'decorative', side: 'player', tick: 2, view: snapshot,
      }],
      model: latest,
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.filter(({ role }) => role === 'move-dust')).toEqual([{
      height: 0.4, role: 'move-dust', width: 1.6, x: 1.2, y: 7.5,
    }]);
  });

  it('renders one state-owned freeze overlay instead of duplicating the model overlay', () => {
    const model = sideView();
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects: [{
        group: 'freeze-overlay', id: 'freeze:player', priority: 'critical', side: 'player', tick: 3, view: effectView,
      }],
      model,
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.filter(({ role }) => role === 'freeze')).toHaveLength(1);
  });

  it('exposes garbage identity on fixed primitives for skin selection', () => {
    const model = sideView();
    const primitives = createBoardPrimitives({
      effectProgress: 0,
      effects: [],
      model: { ...model, board: model.board.map((cell, index) => index === 199 ? { kind: 'O', garbage: true } : cell) },
      selectedRow: null,
      side: 'player',
    });

    expect(primitives.find(({ role, x, y }) => role === 'fixed-cell' && x === 9 && y === 19))
      .toMatchObject({ kind: 'O', garbage: true });
  });

  it('chooses item, then garbage, then kind textures and leaves unresolved cells procedural', () => {
    const image = (path: string) => ({ generation: 1, ref: { path }, source: {} as ImageBitmap, url: `/assets/${path}` });
    const skin: BoardSkin = {
      blocks: { O: image('tiles/o.png') },
      garbage: image('tiles/garbage.png'),
      items: { freeze: image('items/freeze.png') },
    };
    const primitives = [
      { height: 1, kind: 'O' as const, marker: 'freeze' as const, role: 'fixed-cell' as const, width: 1, x: 0, y: 0 },
      { height: .5, marker: 'freeze' as const, role: 'item-marker' as const, width: .5, x: .25, y: .25 },
      { height: 1, kind: 'O' as const, garbage: true as const, role: 'fixed-cell' as const, width: 1, x: 1, y: 0 },
      { height: 1, kind: 'O' as const, garbage: true as const, marker: 'freeze' as const, role: 'fixed-cell' as const, width: 1, x: 2, y: 0 },
      { height: 1, kind: 'O' as const, role: 'fixed-cell' as const, width: 1, x: 3, y: 0 },
      { height: 1, kind: 'I' as const, role: 'fixed-cell' as const, width: 1, x: 4, y: 0 },
    ];

    const partitioned = partitionBoardPrimitives(primitives, skin, 100, 200);

    expect(partitioned.textured.map(({ texture }) => texture.ref.path)).toEqual([
      'items/freeze.png', 'tiles/garbage.png', 'items/freeze.png', 'tiles/o.png',
    ]);
    expect(partitioned.fallback).toEqual([primitives[5]]);
    expect(partitioned.textured[0]).toMatchObject({ height: 10, width: 10, x: 0, y: 0 });
  });
});
