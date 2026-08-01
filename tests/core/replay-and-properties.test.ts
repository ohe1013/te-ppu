import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  CoreInvariantError,
  RandomStream,
  assertMatchInvariants,
  counterU32,
  createMatch,
  hashMatchState,
  makePieceToken,
  pieceKindAt,
  runReplay,
  type AppearedItems,
  type GameCommand,
  type MatchState,
  type SideId,
  type SideState,
  type TimedCommand,
} from '../../src/core/index';

const NO_ITEMS: AppearedItems = {
  'row-clear': false,
  freeze: false,
  'queue-swap': false,
};

const gameCommandArb: fc.Arbitrary<GameCommand> = fc.oneof(
  fc.record({ type: fc.constant('move' as const), dx: fc.constantFrom(-1 as const, 1 as const) }),
  fc.constant({ type: 'rotate-clockwise' as const }),
  fc.record({ type: fc.constant('soft-drop' as const), active: fc.boolean() }),
  fc.constant({ type: 'hard-drop' as const }),
  fc.record({ type: fc.constant('use-row-clear' as const), row: fc.integer({ min: -2, max: 21 }) }),
  fc.constant({ type: 'use-freeze' as const }),
  fc.constant({ type: 'use-queue-swap' as const }),
);

const framesArb: fc.Arbitrary<readonly TimedCommand[]> = fc.array(
  fc.record({
    tick: fc.integer({ min: 1, max: 40 }),
    side: fc.constantFrom<SideId>('player', 'opponent'),
    command: gameCommandArb,
  }),
  { maxLength: 16 },
);

const uint32Arb = fc.integer({ min: 0, max: 0xffff_ffff });

function patchSide(
  state: MatchState,
  side: SideId,
  patch: Partial<SideState>,
): MatchState {
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: { ...state.sides[side], ...patch },
    },
  };
}

describe('canonical replay', () => {
  it('starts at tick zero, dispatches tick one, and preserves original within-tick order', () => {
    const hardDropFirst = runReplay({
      version: 1,
      config: { matchSeed: 0, countdownTicks: 0 },
      endTick: 1,
      commands: [
        { tick: 1, side: 'player', command: { type: 'hard-drop' } },
        { tick: 1, side: 'player', command: { type: 'move', dx: 1 } },
      ],
    });
    const moveFirst = runReplay({
      version: 1,
      config: { matchSeed: 0, countdownTicks: 0 },
      endTick: 1,
      commands: [
        { tick: 1, side: 'player', command: { type: 'move', dx: 1 } },
        { tick: 1, side: 'player', command: { type: 'hard-drop' } },
      ],
    });

    expect(hardDropFirst.state.tick).toBe(1);
    expect(hardDropFirst.state.sides.player.board.cells[22 * BOARD_WIDTH + 5]).not.toBeNull();
    expect(moveFirst.state.sides.player.board.cells[22 * BOARD_WIDTH + 5]).toBeNull();
    expect(hardDropFirst.hash).not.toBe(moveFirst.hash);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid replay end tick %s',
    (endTick) => {
      expect(() => runReplay({
        version: 1,
        config: { matchSeed: 0 },
        endTick,
        commands: [],
      })).toThrow(/endTick.*nonnegative integer/i);
    },
  );

  it('hashes value-equivalent states identically and includes hidden authoritative counters', () => {
    const state = createMatch({ matchSeed: 17, countdownTicks: 0 });
    const detached = JSON.parse(JSON.stringify(state)) as MatchState;
    const changedHiddenCounter = patchSide(state, 'player', {
      garbageDrawIndex: state.sides.player.garbageDrawIndex + 1,
    });

    expect(hashMatchState(state)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashMatchState(detached)).toBe(hashMatchState(state));
    expect(hashMatchState(changedHiddenCounter)).not.toBe(hashMatchState(state));
  });

  it('replays equal seeds and command frames to equal hashes and ordered events for 500 runs', () => {
    fc.assert(fc.property(uint32Arb, framesArb, (matchSeed, frames) => {
      const endTick = frames.reduce((max, frame) => Math.max(max, frame.tick), 0) + 300;
      const replay = { version: 1 as const, config: { matchSeed }, endTick, commands: frames };
      const a = runReplay(replay);
      const b = runReplay(replay);

      expect(a.hash).toBe(b.hash);
      expect(a.events).toEqual(b.events);
      assertMatchInvariants(a.state);
    }), { numRuns: 500 });
  });
});

describe('authoritative match invariants', () => {
  it('accepts a freshly created match', () => {
    expect(() => assertMatchInvariants(createMatch({ matchSeed: 9 }))).not.toThrow();
  });

  it.each([
    {
      label: 'board dimensions',
      reason: /player board dimensions/i,
      mutate: (state: MatchState) => patchSide(state, 'player', {
        board: { cells: state.sides.player.board.cells.slice(1) },
      }),
    },
    {
      label: 'active bounds',
      reason: /player active.*bounds/i,
      mutate: (state: MatchState) => patchSide(state, 'player', {
        active: { ...state.sides.player.active!, x: -20 },
      }),
    },
    {
      label: 'active overlap',
      reason: /player active.*overlap/i,
      mutate: (state: MatchState) => {
        const cells = [...state.sides.player.board.cells];
        cells[3 * BOARD_WIDTH + 4] = { kind: 'O' };
        return patchSide(state, 'player', { board: { cells } });
      },
    },
    {
      label: 'negative inventory',
      reason: /player inventory\.freeze.*nonnegative integer/i,
      mutate: (state: MatchState) => patchSide(state, 'player', {
        inventory: { ...state.sides.player.inventory, freeze: -1 },
      }),
    },
    {
      label: 'queue length',
      reason: /player queue length/i,
      mutate: (state: MatchState) => patchSide(state, 'player', {
        next: [state.sides.player.next[0]] as unknown as SideState['next'],
      }),
    },
    {
      label: 'phase',
      reason: /player phase/i,
      mutate: (state: MatchState) => patchSide(state, 'player', {
        phase: 'ACTIVE' as SideState['phase'],
      }),
    },
    {
      label: 'terminal result',
      reason: /terminal.*draw.*topOut/i,
      mutate: (state: MatchState) => ({ ...state, status: 'draw' as const }),
    },
  ])('reports tick, seed, and compact reason for $label violations', ({ reason, mutate }) => {
    const invalid = mutate(createMatch({ matchSeed: 123, countdownTicks: 0 }));

    let thrown: unknown;
    try {
      assertMatchInvariants(invalid);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CoreInvariantError);
    expect(thrown).toMatchObject({ tick: 0, seed: 123 });
    expect((thrown as Error).message).toMatch(reason);
  });
});

describe('random stream properties', () => {
  it('keeps the first fifty piece kinds independent of garbage and AI-mistake indices', () => {
    fc.assert(fc.property(
      uint32Arb,
      fc.nat({ max: 1_000_000 }),
      fc.nat({ max: 1_000_000 }),
      (seed, garbageIndex, mistakeIndex) => {
        const before = Array.from({ length: 50 }, (_, serial) => pieceKindAt(seed, serial));
        for (let serial = 0; serial < 50; serial += 1) {
          counterU32(seed, RandomStream.GARBAGE_TO_PLAYER, garbageIndex + serial);
          counterU32(seed, RandomStream.GARBAGE_TO_OPPONENT, garbageIndex + serial * 3);
          counterU32(seed, RandomStream.AI_MISTAKE, mistakeIndex + serial * 5);
        }
        const after = Array.from({ length: 50 }, (_, serial) => pieceKindAt(seed, serial));
        expect(after).toEqual(before);
      },
    ), { numRuns: 200 });
  });

  it('marks between fourteen and sixteen percent of 100,000 eligible first pieces', () => {
    let marked = 0;
    for (let seed = 0; seed < 100_000; seed += 1) {
      if (makePieceToken(seed, 0, NO_ITEMS).token.marker !== null) marked += 1;
    }

    expect(marked / 100_000).toBeGreaterThanOrEqual(0.14);
    expect(marked / 100_000).toBeLessThanOrEqual(0.16);
  });

  it('never generates an item type twice for one side of a generated match', () => {
    fc.assert(fc.property(uint32Arb, (seed) => {
      let appeared = { ...NO_ITEMS };
      const generated: string[] = [];
      for (let serial = 0; serial < 100; serial += 1) {
        const next = makePieceToken(seed, serial, appeared);
        if (next.token.marker !== null) generated.push(next.token.marker.item);
        appeared = next.appeared;
      }

      expect(new Set(generated).size).toBe(generated.length);
      expect(generated.length).toBeLessThanOrEqual(3);
    }), { numRuns: 200 });
  });
});
