import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  BOARD_WIDTH,
  CoreInvariantError,
  HIDDEN_ROWS,
  RandomStream,
  applySideCommands,
  assertMatchInvariants,
  canPlace,
  clearFullRows,
  counterU32,
  createMatch,
  ghostY,
  hashMatchState,
  lockPiece,
  makePieceToken,
  runReplay,
  stepMatch,
  tryRotateClockwise,
  type ActivePiece,
  type AppearedItems,
  type Board,
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

type PlacementFrame = {
  readonly playerTieBreak: number;
  readonly opponentTieBreak: number;
};

function boardPenalty(board: Board): number {
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    let firstOccupied = BOARD_ROWS;
    let foundBlock = false;
    for (let y = 0; y < BOARD_ROWS; y += 1) {
      const occupied = board.cells[y * BOARD_WIDTH + x] !== null;
      if (occupied && !foundBlock) {
        firstOccupied = y;
        foundBlock = true;
      } else if (!occupied && foundBlock) {
        holes += 1;
      }
    }
    heights.push(BOARD_ROWS - firstOccupied);
  }

  const aggregateHeight = heights.reduce((sum, height) => sum + height, 0);
  const bumpiness = heights.slice(1).reduce(
    (sum, height, index) => sum + Math.abs(height - heights[index]!),
    0,
  );
  return holes * 1_000 + aggregateHeight * 10 + bumpiness * 5 + Math.max(...heights) * 20;
}

function itemCommands(side: SideState, finalFrame: boolean): GameCommand[] {
  const commands: GameCommand[] = [];
  if (side.inventory.rowClear > 0) {
    for (let y = BOARD_ROWS - 1; y >= HIDDEN_ROWS; y -= 1) {
      const row = side.board.cells.slice(y * BOARD_WIDTH, (y + 1) * BOARD_WIDTH);
      if (row.some((cell) => cell !== null)) {
        commands.push({ type: 'use-row-clear', row: y - HIDDEN_ROWS });
        break;
      }
    }
  }
  if (side.inventory.queueSwap > 0) commands.push({ type: 'use-queue-swap' });
  if (finalFrame && side.inventory.freeze > 0) commands.push({ type: 'use-freeze' });
  return commands;
}

function bestPlacementCommands(
  sideState: SideState,
  tieBreak: number,
): GameCommand[] {
  const candidates: { readonly commands: GameCommand[]; readonly score: number }[] = [];
  const seen = new Set<string>();
  for (let rotations = 0; rotations < 4; rotations += 1) {
    const rotationCommands = Array.from(
      { length: rotations },
      () => ({ type: 'rotate-clockwise' } as const),
    );
    for (const shift of [-3, -1, 1, 3]) {
      const commands: GameCommand[] = [
        ...rotationCommands,
        ...Array.from(
          { length: Math.abs(shift) },
          () => ({ type: 'move', dx: shift < 0 ? -1 : 1 } as const),
        ),
      ];
      const initialActive = sideState.active;
      if (initialActive === null) continue;
      let active: ActivePiece = initialActive;
      for (let rotation = 0; rotation < rotations; rotation += 1) {
        active = tryRotateClockwise(sideState.board, active);
      }
      for (let move = 0; move < Math.abs(shift); move += 1) {
        const candidate: ActivePiece = {
          ...active,
          x: active.x + (shift < 0 ? -1 : 1),
        };
        if (canPlace(sideState.board, candidate)) active = candidate;
      }
      const key = `${active.x}:${active.rotation}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const landed = { ...active, y: ghostY(sideState.board, active) };
      const cleared = clearFullRows(lockPiece(sideState.board, landed));
      candidates.push({
        commands,
        score: boardPenalty(cleared.board) - cleared.rows.length * 100_000,
      });
    }
  }

  candidates.sort((left, right) => left.score - right.score);
  const finalists = candidates.slice(0, Math.min(3, candidates.length));
  return [...finalists[tieBreak % finalists.length]!.commands, { type: 'hard-drop' }];
}

const framesArb: fc.Arbitrary<readonly PlacementFrame[]> = fc.array(fc.record({
  playerTieBreak: fc.nat({ max: 1_000 }),
  opponentTieBreak: fc.nat({ max: 1_000 }),
}), { minLength: 10, maxLength: 14 });

function buildCommandFrames(
  matchSeed: number,
  frames: readonly PlacementFrame[],
): readonly TimedCommand[] {
  let state = createMatch({ matchSeed, countdownTicks: 0 });
  const allCommands: TimedCommand[] = [];
  for (let index = 0; index < frames.length && state.status === 'playing'; index += 1) {
    const tick = state.tick + 1;
    const finalFrame = index === frames.length - 1;
    const commands: TimedCommand[] = [];
    for (const side of ['player', 'opponent'] as const) {
      const items = itemCommands(state.sides[side], finalFrame);
      const afterItems = applySideCommands(
        state.sides[side],
        items.filter(({ type }) => type !== 'use-freeze'),
        side,
      ).state;
      const tieBreak = side === 'player'
        ? frames[index]!.playerTieBreak
        : frames[index]!.opponentTieBreak;
      const games = [
        ...items,
        ...bestPlacementCommands(afterItems, tieBreak),
      ];
      commands.push(...games.map((command) => ({ tick, side, command })));
    }
    allCommands.push(...commands);
    state = stepMatch(state, commands).state;
  }
  return allCommands;
}

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
    const eventCoverage = new Map<string, number>();
    const usedItems = new Set<string>();
    fc.assert(fc.property(uint32Arb, framesArb, (matchSeed, frames) => {
      const commands = buildCommandFrames(matchSeed, frames);
      const endTick = commands.reduce((max, frame) => Math.max(max, frame.tick), 0) + 10;
      const replay = {
        version: 1 as const,
        config: { matchSeed, countdownTicks: 0 },
        endTick,
        commands,
      };
      const a = runReplay(replay);
      const b = runReplay(replay);

      expect(a.hash).toBe(b.hash);
      expect(a.events).toEqual(b.events);
      assertMatchInvariants(a.state);
      for (const event of a.events) {
        eventCoverage.set(event.type, (eventCoverage.get(event.type) ?? 0) + 1);
        if (event.type === 'item-used' && event.item !== undefined) usedItems.add(event.item);
      }
    }), { numRuns: 500, seed: 0x5eed });

    expect(eventCoverage.get('piece-locked')).toBeGreaterThan(10_000);
    expect(eventCoverage.get('lines-cleared')).toBeGreaterThan(30);
    expect(eventCoverage.get('attack-sent')).toBeGreaterThan(30);
    expect(eventCoverage.get('garbage-landed')).toBeGreaterThan(30);
    expect(eventCoverage.get('item-acquired')).toBeGreaterThan(8);
    expect(eventCoverage.get('item-used')).toBeGreaterThan(12);
    expect(usedItems).toEqual(new Set(['row-clear', 'freeze', 'queue-swap']));
  }, 10_000);
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
  it('derives distinct locked results for piece, item, garbage, and AI streams', () => {
    const atSameCoordinate = [
      RandomStream.PIECE_BAG,
      RandomStream.ITEM,
      RandomStream.GARBAGE_TO_PLAYER,
      RandomStream.GARBAGE_TO_OPPONENT,
      RandomStream.AI_MISTAKE,
    ].map((stream) => counterU32(0x1234_5678, stream, 7, 3));

    expect(atSameCoordinate).toEqual([
      2_728_845_410,
      1_075_701_743,
      230_197_295,
      1_049_563_627,
      2_838_615_929,
    ]);
    expect(new Set(atSameCoordinate).size).toBe(atSameCoordinate.length);
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
