import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type PublicSideView,
} from '../core/index';
import type { AnimationEffect } from './event-animation-queue';
import { createBoardPrimitives } from './draw-primitives';

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
});
