import { describe, expect, it } from 'vitest';
import { createAiController } from '../../src/ai/index';
import { AI_FLOOR_PROFILES } from '../../src/ai/profiles';
import {
  createAiObservation,
  createMatch,
  applySideCommands,
  stepMatch,
  type AiObservation,
  type MatchState,
  type SideId,
  type TimedCommand,
} from '../../src/core/index';
import {
  MAX_SIMULATION_TICKS,
  auditCommandsAtEmission,
  createBenchmarkController,
  isCommandAcceptedAtEmission,
  runAiSimulation,
  type SimulationController,
} from '../../src/sim/aiSimulation';

function passiveController(side: SideId): SimulationController {
  return { side, update: () => [] };
}

describe('headless AI simulation', () => {
  it('adapts the approved 27-tick benchmark clock to 23 eligible real ticks', () => {
    const view = createAiObservation(createMatch({ matchSeed: 3, countdownTicks: 0 }), 'opponent');
    let calls = 0;
    const base: SimulationController = {
      side: 'opponent',
      update(_view, tick) {
        calls += 1;
        return calls % 27 === 0
          ? [{ tick, side: 'opponent', command: { type: 'hard-drop' } }]
          : [];
      },
    };
    const benchmark = createBenchmarkController(base);
    const output = Array.from({ length: 23 }, (_, index) =>
      benchmark.update(view, index + 1));

    expect(output.slice(0, 22).every((commands) => commands.length === 0)).toBe(true);
    expect(output[22]).toHaveLength(1);
    expect(calls).toBe(27);
  });

  it('pauses benchmark clock credit while frozen or non-active', () => {
    const view = createAiObservation(createMatch({ matchSeed: 5, countdownTicks: 0 }), 'opponent');
    const frozen = {
      ...view,
      self: { ...view.self, freezeTicks: 10 },
    } satisfies AiObservation;
    let calls = 0;
    const benchmark = createBenchmarkController({
      side: 'opponent',
      update() {
        calls += 1;
        return [];
      },
    });

    for (let tick = 1; tick <= 11; tick += 1) benchmark.update(view, tick);
    const beforePause = calls;
    for (let tick = 12; tick <= 111; tick += 1) benchmark.update(frozen, tick);
    expect(calls).toBe(beforePause);
    for (let tick = 112; tick <= 123; tick += 1) benchmark.update(view, tick);
    expect(calls).toBe(27);
  });

  it('emits at most one benchmark command per real tick and defers extra credit', () => {
    const view = createAiObservation(createMatch({ matchSeed: 7, countdownTicks: 0 }), 'opponent');
    let calls = 0;
    const benchmark = createBenchmarkController({
      side: 'opponent',
      update(_view, tick) {
        calls += 1;
        return [{ tick, side: 'opponent', command: { type: 'hard-drop' } }];
      },
    });

    const outputs = Array.from({ length: 9 }, (_, index) => benchmark.update(view, index + 1));

    expect(outputs.every((commands) => commands.length === 1)).toBe(true);
    expect(calls).toBe(9);
  });

  it('repeats the outcome, tick count, and SHA-256 hashes for one seed and floor', () => {
    const first = runAiSimulation({ seed: 91, floor: 3, tickLimit: 240 });
    const second = runAiSimulation({ seed: 91, floor: 3, tickLimit: 240 });

    expect(second).toEqual(first);
    expect(first.stateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.rejectedCommands).toBe(0);
    expect(first.exceededTickLimit).toBe(true);
  });

  it.each([4, 5] as const)('runs canonical floor %i deterministically', (floor) => {
    const first = runAiSimulation({ seed: 91, floor, tickLimit: 240 });
    const second = runAiSimulation({ seed: 91, floor, tickLimit: 240 });

    expect(second).toEqual(first);
    expect(first.rejectedCommands).toBe(0);
    expect(first.exceededTickLimit).toBe(true);
  });

  it('gives controllers identical sanitized observations for states with different hidden data', () => {
    const base = createMatch({ matchSeed: 19, countdownTicks: 0 });
    const hiddenCells = [...base.sides.opponent.board.cells];
    hiddenCells[0] = { kind: 'Z' };
    const hiddenB = {
      ...base,
      matchSeed: 0x7654_3210,
      sides: {
        ...base.sides,
        opponent: {
          ...base.sides.opponent,
          board: { cells: hiddenCells },
          active: {
            ...base.sides.opponent.active!,
            token: { ...base.sides.opponent.active!.token, serial: 999 },
          },
          next: [
            { ...base.sides.opponent.next[0], serial: 1000 },
            { ...base.sides.opponent.next[1], serial: 1001 },
          ],
          nextSerial: 8_000,
          appeared: { 'row-clear': true, freeze: true, 'queue-swap': true },
          garbageDrawIndex: 4_000,
        },
      },
      futureBag: ['I', 'I', 'I'],
      itemRng: 123,
      garbageColumnRng: 456,
      commandLog: [{ tick: 1, side: 'player', command: { type: 'hard-drop' } }],
    } as MatchState;
    const viewA = createAiObservation(base, 'opponent');
    const viewB = createAiObservation(hiddenB, 'opponent');
    const decide = (view: AiObservation): readonly TimedCommand[] => {
      const controller = createAiController(AI_FLOOR_PROFILES[2]!, 73, 'opponent');
      let output: readonly TimedCommand[] = [];
      for (let tick = 1; tick <= AI_FLOOR_PROFILES[2]!.reactionTicks; tick += 1) {
        output = controller.update(view, tick);
      }
      return output;
    };

    expect(viewB).toEqual(viewA);
    expect(decide(viewB)).toEqual(decide(viewA));
    expect(hiddenB.matchSeed).not.toBe(base.matchSeed);
    expect(hiddenB.sides.opponent.garbageDrawIndex)
      .not.toBe(base.sides.opponent.garbageDrawIndex);
  });

  it('caps a non-terminating test run while retaining the ten-minute production default', () => {
    const summary = runAiSimulation({
      seed: 5,
      floor: 1,
      tickLimit: 5,
      controllers: {
        player: passiveController('player'),
        opponent: passiveController('opponent'),
      },
    });

    expect(MAX_SIMULATION_TICKS).toBe(36_000);
    expect(summary.ticks).toBe(5);
    expect(summary.outcome).toBe('draw');
    expect(summary.exceededTickLimit).toBe(true);
  });

  it('resolves the known long floor-3 benchmark matches before the production cap', () => {
    for (const seed of [75, 111]) {
      const summary = runAiSimulation({ seed, floor: 3 });

      expect(summary.exceededTickLimit).toBe(false);
      expect(summary.ticks).toBeLessThan(MAX_SIMULATION_TICKS);
    }
  }, 60_000);

  it('resolves calibration regression seed 552 before the production cap', () => {
    const summary = runAiSimulation({ seed: 552, floor: 3 });

    expect(summary.exceededTickLimit).toBe(false);
    expect(summary.ticks).toBeLessThan(MAX_SIMULATION_TICKS);
  }, 60_000);

  it('resolves all floor-4 capped regression seeds before the production cap', () => {
    for (const seed of [27, 61, 85, 86, 111, 129, 150, 169, 272, 406, 429, 435, 608, 620, 642, 832, 881]) {
      const summary = runAiSimulation({ seed, floor: 4 });

      expect(summary.rejectedCommands).toBe(0);
      expect(summary.exceededTickLimit).toBe(false);
      expect(summary.ticks).toBeLessThan(MAX_SIMULATION_TICKS);
    }
  }, 3_600_000);

  it('audits an unowned item command as rejected from authoritative behavior', () => {
    let emitted = false;
    const illegalController: SimulationController = {
      side: 'player',
      update(_view, tick) {
        if (emitted) return [];
        emitted = true;
        return [{ tick, side: 'player', command: { type: 'use-freeze' } }];
      },
    };
    const summary = runAiSimulation({
      seed: 7,
      floor: 1,
      tickLimit: 1,
      controllers: {
        player: illegalController,
        opponent: passiveController('opponent'),
      },
    });

    expect(summary.rejectedCommands).toBe(1);
    expect(summary.exceededTickLimit).toBe(true);
  });

  it('audits duplicate same-side item commands sequentially', () => {
    const base = createMatch({ matchSeed: 41, countdownTicks: 0 });
    const state = {
      ...base,
      sides: {
        ...base.sides,
        player: {
          ...base.sides.player,
          inventory: { ...base.sides.player.inventory, freeze: 1 },
        },
      },
    } satisfies MatchState;
    const freeze = {
      tick: 1,
      side: 'player',
      command: { type: 'use-freeze' },
    } as const;

    expect(auditCommandsAtEmission(state, [freeze, freeze])).toEqual([true, false]);
  });

  it('accepts a pre-tick-valid item later suppressed by a simultaneous opponent freeze', () => {
    const base = createMatch({ matchSeed: 43, countdownTicks: 0 });
    const state = {
      ...base,
      sides: {
        player: {
          ...base.sides.player,
          inventory: { ...base.sides.player.inventory, freeze: 1 },
        },
        opponent: {
          ...base.sides.opponent,
          inventory: { ...base.sides.opponent.inventory, queueSwap: 1 },
        },
      },
    } satisfies MatchState;
    const commands = [
      { tick: 1, side: 'player', command: { type: 'use-freeze' } },
      { tick: 1, side: 'opponent', command: { type: 'use-queue-swap' } },
    ] as const;

    expect(auditCommandsAtEmission(state, commands)).toEqual([true, true]);
  });

  it('accepts both available freezes emitted simultaneously', () => {
    const base = createMatch({ matchSeed: 47, countdownTicks: 0 });
    const state = {
      ...base,
      sides: {
        player: {
          ...base.sides.player,
          inventory: { ...base.sides.player.inventory, freeze: 1 },
        },
        opponent: {
          ...base.sides.opponent,
          inventory: { ...base.sides.opponent.inventory, freeze: 1 },
        },
      },
    } satisfies MatchState;
    const commands = (['player', 'opponent'] as const).map((side) => ({
      tick: 1,
      side,
      command: { type: 'use-freeze' } as const,
    }));

    expect(auditCommandsAtEmission(state, commands)).toEqual([true, true]);
  });

  it('rejects probes emitted after a same-side hard drop ends sequential eligibility', () => {
    const state = createMatch({ matchSeed: 53, countdownTicks: 0 });
    const hardDrop = {
      tick: 1,
      side: 'player',
      command: { type: 'hard-drop' },
    } as const;
    const move = {
      tick: 1,
      side: 'player',
      command: { type: 'move', dx: 1 },
    } as const;

    expect(auditCommandsAtEmission(state, [hardDrop, move])).toEqual([true, false]);
    expect(auditCommandsAtEmission(state, [hardDrop, hardDrop])).toEqual([true, false]);
  });

  it('accepts a legal pre-tick move even when a simultaneous opponent freeze suppresses it', () => {
    const base = createMatch({ matchSeed: 91, countdownTicks: 0 });
    const state = {
      ...base,
      sides: {
        ...base.sides,
        player: {
          ...base.sides.player,
          inventory: { ...base.sides.player.inventory, freeze: 1 },
        },
      },
    } satisfies MatchState;
    const move = {
      tick: 1,
      side: 'opponent',
      command: { type: 'move', dx: -1 },
    } as const;
    const step = stepMatch(state, [
      { tick: 1, side: 'player', command: { type: 'use-freeze' } },
      move,
    ]);

    expect(step.events).toContainEqual({
      type: 'freeze-applied',
      side: 'opponent',
      item: 'freeze',
    });
    expect(step.state.sides.opponent.active?.x).toBe(state.sides.opponent.active?.x);
    expect(auditCommandsAtEmission(state, [
      { tick: 1, side: 'player', command: { type: 'use-freeze' } },
      move,
    ])).toEqual([true, true]);
  });

  it('accepts an eligible hidden-collision movement probe even when core blocks it', () => {
    const base = createMatch({ matchSeed: 7, countdownTicks: 0 });
    const atLeftBoundary = applySideCommands(
      base.sides.opponent,
      Array.from({ length: 10 }, () => ({ type: 'move', dx: -1 } as const)),
      'opponent',
    ).state;
    const state = {
      ...base,
      sides: { ...base.sides, opponent: atLeftBoundary },
    } satisfies MatchState;
    const probe = {
      tick: 1,
      side: 'opponent',
      command: { type: 'move', dx: -1 },
    } as const;

    expect(applySideCommands(atLeftBoundary, [probe.command], 'opponent').state)
      .toEqual(atLeftBoundary);
    expect(isCommandAcceptedAtEmission(state, probe)).toBe(true);
  });

  it('merges same-tick controller output in stable player-before-opponent order', () => {
    const commandController = (side: SideId): SimulationController => ({
      side,
      update(_view, tick) {
        return [{ tick, side, command: { type: 'hard-drop' } }];
      },
    });
    const run = () => runAiSimulation({
      seed: 29,
      floor: 3,
      tickLimit: 1,
      controllers: {
        opponent: commandController('opponent'),
        player: commandController('player'),
      },
    });

    expect(run()).toEqual(run());
  });
});
