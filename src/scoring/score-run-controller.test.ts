import { describe, expect, it } from 'vitest';
import { ScoreRunController } from './score-run-controller';

describe('ScoreRunController', () => {
  it('forces floor one, advances after each three-win floor, and ends on loss', () => {
    const run = ScoreRunController.start('easy');
    expect(run.canSelectFloor(1)).toBe(true);
    expect(run.canSelectFloor(2)).toBe(false);

    run.completeMatch({ floor: 1, encounterIndex: 0, isOwl: false, result: 'win', durationTicks: 600 });
    run.completeMatch({ floor: 1, encounterIndex: 1, isOwl: false, result: 'win', durationTicks: 500 });
    run.completeMatch({ floor: 1, encounterIndex: 2, isOwl: false, result: 'win', durationTicks: 400 });
    expect(run.snapshot).toMatchObject({ score: 5_000, requiredFloor: 2, encountersWon: 3 });

    const ended = run.completeMatch({
      floor: 2, encounterIndex: 0, isOwl: false, result: 'loss', durationTicks: 300,
    });
    expect(ended.kind).toBe('ended');
    expect(run.snapshot.phase).toBe('ended');
  });

  it('awards the normal win and owl bonuses and records all sixteen victories', () => {
    const run = ScoreRunController.start('easy');
    for (const floor of [1, 2, 3, 4, 5] as const) {
      for (const encounterIndex of [0, 1, 2] as const) {
        run.completeMatch({
          floor,
          encounterIndex,
          isOwl: false,
          result: 'win',
          durationTicks: 240,
        });
      }
    }
    const result = run.completeMatch({
      floor: 5, encounterIndex: 2, isOwl: true, result: 'win', durationTicks: 240,
    });
    expect(result).toMatchObject({ kind: 'ended', summary: { owlDefeated: true, encountersWon: 16 } });
    expect(run.snapshot.score).toBe(31_000);
  });

  it('adds only player event points with no difficulty multiplier', () => {
    const easy = ScoreRunController.start('easy');
    const hard = ScoreRunController.start('hard');
    const events = [
      { type: 'lines-cleared' as const, side: 'player' as const, amount: 4 },
      { type: 'attack-sent' as const, side: 'player' as const, amount: 2 },
      { type: 'item-used' as const, side: 'player' as const, item: 'freeze' as const },
      { type: 'piece-locked' as const, side: 'player' as const },
    ];

    easy.recordEvents(events);
    hard.recordEvents(events);

    expect(easy.snapshot.score).toBe(1_000);
    expect(hard.snapshot.score).toBe(1_000);
  });

  it('rejects out-of-order outcomes and calls after a run ends', () => {
    const run = ScoreRunController.start('normal');
    expect(() => run.completeMatch({
      floor: 2, encounterIndex: 0, isOwl: false, result: 'win', durationTicks: 1,
    })).toThrow(RangeError);
    expect(() => run.completeMatch({
      floor: 1, encounterIndex: 1, isOwl: false, result: 'win', durationTicks: 1,
    })).toThrow(RangeError);

    run.completeMatch({
      floor: 1, encounterIndex: 0, isOwl: false, result: 'draw', durationTicks: 1,
    });
    expect(() => run.recordEvents([{ type: 'item-used', side: 'player', item: 'freeze' }]))
      .toThrow(RangeError);
    expect(() => run.completeMatch({
      floor: 1, encounterIndex: 0, isOwl: false, result: 'win', durationTicks: 1,
    })).toThrow(RangeError);
  });

  it('returns snapshots detached from its private mutable state', () => {
    const run = ScoreRunController.start('easy');
    const leaked = run.snapshot as { score: number; requiredFloor: number; phase: string };
    leaked.score = 99_999;
    leaked.requiredFloor = 5;
    leaked.phase = 'ended';

    expect(run.snapshot).toEqual({
      difficulty: 'easy',
      score: 0,
      durationTicks: 0,
      requiredFloor: 1,
      encountersWon: 0,
      owlDefeated: false,
      phase: 'active',
    });
  });
});
