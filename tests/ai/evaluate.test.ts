import { describe, expect, it } from 'vitest';
import { getAiFloorProfile } from '../../src/ai/profiles';
import {
  LOOKAHEAD_BEAM_WIDTH,
  scoreCandidates,
  selectCandidate,
} from '../../src/ai/evaluate';
import type { AiFloorProfile } from '../../src/ai/types';
import {
  BOARD_WIDTH,
  HIDDEN_ROWS,
  ghostY,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type PieceKind,
  type PublicPieceToken,
} from '../../src/core/index';

const VISIBLE_ROWS = 20;
const EASY_1 = getAiFloorProfile(1, 'easy');
const NORMAL_1 = getAiFloorProfile(1, 'normal');
const HARD_1 = getAiFloorProfile(1, 'hard');
const HARD_5 = getAiFloorProfile(5, 'hard');

function emptyBoard(): (Cell | null)[] {
  return Array<Cell | null>(BOARD_WIDTH * VISIBLE_ROWS).fill(null);
}

function token(kind: PieceKind, marker: PublicPieceToken['marker'] = null): PublicPieceToken {
  return { kind, marker };
}

function observation(options: {
  readonly kind?: PieceKind;
  readonly marker?: PublicPieceToken['marker'];
  readonly board?: readonly (Cell | null)[];
  readonly next?: readonly [PublicPieceToken, PublicPieceToken];
  readonly combo?: number;
  readonly incoming?: number;
  readonly opponentBoard?: readonly (Cell | null)[];
} = {}): AiObservation {
  const board = options.board ?? emptyBoard();
  const activeToken = token(options.kind ?? 'O', options.marker);
  const internalBoard: Board = {
    cells: [
      ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
      ...board,
    ],
  };
  const internalActive: ActivePiece = {
    token: { serial: 0, ...activeToken },
    x: 3,
    y: 2,
    rotation: 0,
  };
  return {
    tick: 0,
    status: 'playing',
    self: {
      board,
      active: {
        token: activeToken,
        x: 3,
        y: -2,
        rotation: 0,
      },
      ghostY: ghostY(internalBoard, internalActive) - HIDDEN_ROWS,
      next: options.next ?? [token('T'), token('L')],
      combo: options.combo ?? 0,
      incoming: options.incoming ?? 0,
      inventory: { rowClear: 0, freeze: 0, queueSwap: 0 },
      freezeTicks: 0,
      phase: 'active',
      topOut: false,
    },
    opponent: {
      board: options.opponentBoard ?? emptyBoard(),
      active: null,
      combo: 0,
      incoming: 0,
      inventory: { rowClear: 0, freeze: 0, queueSwap: 0 },
      freezeTicks: 0,
      phase: 'active',
      topOut: false,
    },
  };
}

function zeroProfile(): AiFloorProfile {
  return {
    ...EASY_1,
    lookahead: 0,
    topK: 1,
    rankWeights: [1],
    futureDiscount: 0,
    weights: {
      aggregateHeight: 0,
      maxHeight: 0,
      holes: 0,
      bumpiness: 0,
      clearedLines: 0,
      combo: 0,
      incomingOffset: 0,
      itemGain: 0,
      opponentPressure: 0,
    },
  };
}

function allOnesProfile(): AiFloorProfile {
  return {
    ...zeroProfile(),
    weights: {
      aggregateHeight: 1,
      maxHeight: 1,
      holes: 1,
      bumpiness: 1,
      clearedLines: 1,
      combo: 1,
      incomingOffset: 1,
      itemGain: 1,
      opponentPressure: 1,
    },
  };
}

function scores(view: AiObservation, profile: AiFloorProfile): readonly number[] {
  return scoreCandidates(view, profile).map(({ score }) => score);
}

describe('candidate scoring', () => {
  it('computes aggregate height, max height, holes, and bumpiness from the resulting board', () => {
    const board = emptyBoard();
    board[19 * BOARD_WIDTH] = { kind: 'J' };
    board[18 * BOARD_WIDTH + 1] = { kind: 'J' };
    const scored = scoreCandidates(observation({ board }), zeroProfile());
    const candidate = scored.find(({ rotation, column }) => rotation === 0 && column === 6);

    expect(candidate?.features).toEqual({
      aggregateHeight: 7,
      maxHeight: 2,
      holes: 1,
      bumpiness: 7,
      clearedLines: 0,
      combo: 0,
      incomingOffset: 0,
      itemGain: 0,
      opponentPressure: 0,
    });
  });

  it('computes clear, combo, offset, item gain, and normalized opponent pressure features', () => {
    const board = emptyBoard();
    for (let x = 4; x < BOARD_WIDTH; x += 1) board[19 * BOARD_WIDTH + x] = { kind: 'J' };
    const opponentBoard = emptyBoard();
    for (let y = 10; y < VISIBLE_ROWS; y += 1) opponentBoard[y * BOARD_WIDTH] = { kind: 'L' };

    const scored = scoreCandidates(observation({
      kind: 'I',
      marker: { item: 'row-clear', minoIndex: 0 },
      board,
      combo: 2,
      incoming: 2,
      opponentBoard,
    }), allOnesProfile());
    const candidate = scored.find(({ rotation, column }) => rotation === 0 && column === 0);

    expect(candidate?.features).toEqual({
      aggregateHeight: 0,
      maxHeight: 0,
      holes: 0,
      bumpiness: 0,
      clearedLines: 1,
      combo: 3,
      incomingOffset: 2,
      itemGain: 1,
      opponentPressure: 1.5,
    });
    expect(candidate).toMatchObject({
      clearedLines: 1,
      acquiredItems: ['row-clear'],
      attack: 3,
      topOut: 'unknown',
      score: 8.5,
    });
  });

  it('sorts equal scores by rotation and column with a stable landing/command fallback', () => {
    const scored = scoreCandidates(observation(), zeroProfile());

    expect(scored.slice(0, 4).map(({ rotation, column }) => [rotation, column])).toEqual([
      [0, -1],
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });

  it('scores a visibly projected placement with unknown top-out instead of rejecting it', () => {
    const board = emptyBoard();
    board[4] = { kind: 'Z' };

    const scored = scoreCandidates(observation({ board }), zeroProfile());
    const directDrop = scored.find(({ rotation, column, commands }) =>
      rotation === 0
      && column === 3
      && commands.length === 1
      && commands[0]?.type === 'hard-drop');

    expect(directDrop).toMatchObject({
      topOut: 'unknown',
      score: 0,
    });
  });
});

describe('public preview lookahead', () => {
  it('uses a stable width-four root beam for depth-one ties', () => {
    const depthOneZero = {
      ...zeroProfile(),
      floor: 3 as const,
      lookahead: 1 as const,
      topK: 3 as const,
      rankWeights: [0.6, 0.3, 0.1],
      futureDiscount: 0.65,
    };
    const scored = scoreCandidates(observation(), depthOneZero);

    expect(scored.filter(({ score }) => Number.isFinite(score))
      .map(({ rotation, column }) => [rotation, column])).toEqual([
      [0, -1],
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(scored.slice(4).every(({ score }) => score === Number.NEGATIVE_INFINITY)).toBe(true);
  });

  it('uses stable width-four root and partial beams for depth-two ties', () => {
    const depthTwoZero = {
      ...zeroProfile(),
      lookahead: 2 as const,
      futureDiscount: 0.7,
    };
    const first = scoreCandidates(observation(), depthTwoZero);
    const second = scoreCandidates(observation(), depthTwoZero);
    const finiteRoots = first
      .filter(({ score }) => Number.isFinite(score))
      .map(({ rotation, column }) => [rotation, column]);

    expect(LOOKAHEAD_BEAM_WIDTH).toBe(4);
    expect(second).toEqual(first);
    expect(first).toHaveLength(9);
    expect(finiteRoots).toEqual([[0, -1]]);
    expect(first.slice(1).every(({ score }) => score === Number.NEGATIVE_INFINITY)).toBe(true);
  });

  it('Easy 1 ignores both previews', () => {
    const first = observation({ next: [token('I'), token('O')] });
    const changed = observation({ next: [token('Z'), token('S')] });

    expect(scores(first, EASY_1)).toEqual(scores(changed, EASY_1));
  });

  it('Easy 1 keeps near-top vertical-I scores and ranking independent of previews', () => {
    const board = emptyBoard();
    board[2 * BOARD_WIDTH + 3] = { kind: 'J' };
    const safePreview = observation({
      kind: 'I',
      board,
      next: [token('O'), token('L')],
    });
    const blockedPreview = observation({
      kind: 'I',
      board,
      next: [token('I'), token('L')],
    });

    expect(scoreCandidates(safePreview, EASY_1)).toEqual(
      scoreCandidates(blockedPreview, EASY_1),
    );
  });

  it('Normal 1 changes for preview one but ignores preview two', () => {
    const base = observation({ next: [token('I'), token('O')] });
    const previewOneChanged = observation({ next: [token('O'), token('O')] });
    const previewTwoChanged = observation({ next: [token('I'), token('Z')] });

    expect(scores(base, NORMAL_1)).not.toEqual(scores(previewOneChanged, NORMAL_1));
    expect(scores(base, NORMAL_1)).toEqual(scores(previewTwoChanged, NORMAL_1));
  });

  it('Hard 1 changes when only preview two changes', () => {
    const base = observation({ next: [token('O'), token('I')] });
    const previewTwoChanged = observation({ next: [token('O'), token('Z')] });

    expect(scores(base, HARD_1)).not.toEqual(scores(previewTwoChanged, HARD_1));
  });

  it('uses exactly one near-top preview on Normal 1 and two on Hard 1', () => {
    const board = emptyBoard();
    board[2 * BOARD_WIDTH + 3] = { kind: 'J' };
    const base = observation({
      kind: 'I',
      board,
      next: [token('O'), token('I')],
    });
    const previewOneChanged = observation({
      kind: 'I',
      board,
      next: [token('Z'), token('I')],
    });
    const previewTwoChanged = observation({
      kind: 'I',
      board,
      next: [token('O'), token('Z')],
    });

    expect(scores(base, NORMAL_1)).not.toEqual(scores(previewOneChanged, NORMAL_1));
    expect(scoreCandidates(base, NORMAL_1)).toEqual(scoreCandidates(previewTwoChanged, NORMAL_1));
    expect(scores(base, HARD_1)).not.toEqual(scores(previewTwoChanged, HARD_1));
  });

  it('ignores a runtime third preview even for Hard 1 near the top', () => {
    const board = emptyBoard();
    board[2 * BOARD_WIDTH + 3] = { kind: 'J' };
    const base = observation({
      kind: 'I',
      board,
      next: [token('O'), token('I')],
    });
    const withThird = (third: PublicPieceToken): AiObservation => ({
      ...base,
      self: {
        ...base.self,
        next: [token('O'), token('I'), third] as unknown as AiObservation['self']['next'],
      },
    });

    expect(scoreCandidates(withThird(token('Z')), HARD_1)).toEqual(
      scoreCandidates(withThird(token('S')), HARD_1),
    );
  });
});

describe('seeded top-K selection', () => {
  it.each([
    { draw: .30, expectedIndex: 0 },
    { draw: 1 / 3, expectedIndex: 1 },
    { draw: .66, expectedIndex: 1 },
    { draw: 2 / 3, expectedIndex: 2 },
    { draw: .99, expectedIndex: 2 },
  ])('renormalizes a uniform five-rank profile over three available candidates at $draw', (
    { draw, expectedIndex },
  ) => {
    const ranked = scoreCandidates(observation(), zeroProfile()).slice(0, 3);
    const profile = getAiFloorProfile(1, 'easy');
    let draws = 0;
    const selected = selectCandidate(ranked, profile, () => {
      draws += 1;
      return draw;
    });

    expect(selected).toBe(ranked[expectedIndex]);
    expect(draws).toBe(1);
  });

  it('rejects an empty candidate list', () => {
    expect(() => selectCandidate([], getAiFloorProfile(1, 'easy'), () => 0))
      .toThrow('cannot select from an empty candidate list');
  });

  it('selects representative ladder candidates at hand-derived cumulative boundaries', () => {
    const ranked = scoreCandidates(observation(), zeroProfile());
    // These are the exact IEEE-754 running totals used by cumulative selection.
    const cases = [
      { profile: EASY_1, draw: 0.2, expectedColumn: 0 },
      { profile: EASY_1, draw: 0.4, expectedColumn: 1 },
      { profile: EASY_1, draw: 0.600_000_000_000_000_1, expectedColumn: 2 },
      { profile: EASY_1, draw: 0.8, expectedColumn: 3 },
      { profile: NORMAL_1, draw: 0.559_999, expectedColumn: -1 },
      { profile: NORMAL_1, draw: 0.56, expectedColumn: 0 },
      { profile: NORMAL_1, draw: 0.840_000_000_000_000_1, expectedColumn: 1 },
      { profile: NORMAL_1, draw: 0.960_000_000_000_000_1, expectedColumn: 2 },
      { profile: HARD_1, draw: 0.839_999, expectedColumn: -1 },
      { profile: HARD_1, draw: 0.84, expectedColumn: 0 },
      { profile: HARD_1, draw: 0.97, expectedColumn: 1 },
      { profile: HARD_5, draw: 0.999_999, expectedColumn: -1 },
    ] as const;

    for (const testCase of cases) {
      let draws = 0;
      const selected = selectCandidate(ranked, testCase.profile, () => {
        draws += 1;
        return testCase.draw;
      });
      expect(selected.column).toBe(testCase.expectedColumn);
      expect(draws).toBe(1);
    }
  });

  it('returns the same tied candidate for the same seeded draw sequence', () => {
    const ranked = scoreCandidates(observation(), zeroProfile());
    const seeded = (seed: number) => {
      let state = seed >>> 0;
      return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
      };
    };

    expect(selectCandidate(ranked, HARD_5, seeded(7))).toEqual(
      selectCandidate(ranked, HARD_5, seeded(7)),
    );
  });
});
