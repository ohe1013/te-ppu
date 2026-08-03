import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  aggregateWorkerCheckpointSamples,
  assertCanonicalFloorMatchCounts,
  assertCompleteHeapCheckpointCoverage,
  assertExactValidationTaskCoverage,
  assertFinalWorkerSnapshotCountersMatchResults,
  buildSelectedValidationTasks,
  parseValidationArguments,
  recordValidationWorkerTasksDone,
  runValidation,
  selectValidationTasksForWorker,
  updateWorkerCounters,
  type ValidationCheckpoint,
} from '../../scripts/validate-ai-simulations';

describe('AI validation workers', () => {
  it('publish the final GC checkpoint and exit without a second shutdown barrier', async () => {
    const checkpoints: ValidationCheckpoint[] = [];
    const report = await runValidation(
      1,
      (checkpoint) => { checkpoints.push(checkpoint); },
      { tickLimit: 1 },
    );

    expect.soft(report.totalMatches).toBe(5);
    expect.soft(Object.keys(report.winRates)).toEqual(['1', '2', '3', '4', '5']);
    expect.soft(Object.keys(report.floorDurationsMs)).toEqual(['1', '2', '3', '4', '5']);
    expect.soft(report.completedByFloor).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    expect.soft(report.heapSamples.map(({ matches }) => matches)).toEqual([0, 5]);
    expect.soft(checkpoints.map(({ completed }) => completed)).toEqual([0, 5]);
    expect.soft(checkpoints[0]).toMatchObject({
      completed: 0,
      rejectedCommands: 0,
      cappedMatches: 0,
      wins: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      completedByFloor: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    expect.soft(Object.keys(checkpoints.at(-1)!.wins)).toEqual(['1', '2', '3', '4', '5']);
    expect.soft(Object.keys(checkpoints.at(-1)!.completedByFloor)).toEqual(['1', '2', '3', '4', '5']);
    const finalCheckpoint = checkpoints.at(-1)!;
    expect.soft(finalCheckpoint).toMatchObject({
      completed: report.totalMatches,
      rejectedCommands: report.rejectedCommands,
      cappedMatches: report.cappedMatches,
      completedByFloor: report.completedByFloor,
      heapUsed: report.heapSamples.at(-1)!.heapUsed,
      heapDelta: report.finalHeapDelta,
    });
    for (const floor of [1, 2, 3, 4, 5] as const) {
      expect.soft(finalCheckpoint.wins[floor]).toBe(
        report.winRates[floor] * report.completedByFloor[floor],
      );
    }
  }, 15_000);

  it('filters by floor and seed range and reports capped cases as they arrive', async () => {
    const cases: Array<{
      floor: number;
      seed: number;
      ticks: number;
      rejectedCommands: number;
      exceededTickLimit: boolean;
    }> = [];
    const report = await runValidation(3, undefined, {
      floor: 2,
      seedFrom: 2,
      seedTo: 3,
      tickLimit: 1,
      onProblemCase: (result) => { cases.push(result); },
    });

    expect(report.totalMatches).toBe(2);
    expect(report.cappedMatches).toBe(2);
    expect(cases.sort((left, right) => left.seed - right.seed)).toEqual([
      { floor: 2, seed: 2, ticks: 1, rejectedCommands: 0, exceededTickLimit: true },
      { floor: 2, seed: 3, ticks: 1, rejectedCommands: 0, exceededTickLimit: true },
    ]);
  }, 15_000);

  it('records heap samples against actual aggregate worker progress', async () => {
    const checkpoints: ValidationCheckpoint[] = [];
    const report = await runValidation(
      84,
      (checkpoint) => { checkpoints.push(checkpoint); },
      { tickLimit: 1 },
    );
    const actualAt250 = report.workers.reduce((sum, worker) =>
      sum + worker.heapSamples.find(({ checkpoint }) => checkpoint === 250)!.localMatches, 0);
    const aggregateAt250 = checkpoints.find(({ completed }) => completed === actualAt250)!;
    const workerSamplesAt250 = report.workers.map((worker) =>
      worker.heapSamples.find(({ checkpoint }) => checkpoint === 250)!);
    const expectedWins = workerSamplesAt250.reduce((wins, sample) => ({
      1: wins[1] + sample.wins[1],
      2: wins[2] + sample.wins[2],
      3: wins[3] + sample.wins[3],
      4: wins[4] + sample.wins[4],
      5: wins[5] + sample.wins[5],
    }), { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

    expect(actualAt250).toBeGreaterThanOrEqual(250);
    expect(report.heapSamples.map(({ matches }) => matches)).toContain(actualAt250);
    expect(aggregateAt250.wins).toEqual(expectedWins);
    expect(aggregateAt250.rejectedCommands).toBe(workerSamplesAt250
      .reduce((sum, sample) => sum + sample.rejectedCommands, 0));
    expect(aggregateAt250.cappedMatches).toBe(workerSamplesAt250
      .reduce((sum, sample) => sum + sample.cappedMatches, 0));
    expect(Object.values(aggregateAt250.completedByFloor).reduce((sum, count) => sum + count, 0))
      .toBe(aggregateAt250.completed);
    for (const worker of report.workers) {
      for (const sample of worker.heapSamples) {
        expect(Object.values(sample.completedByFloor).reduce((sum, count) => sum + count, 0))
          .toBe(sample.localMatches);
      }
    }
  }, 15_000);

  it('reports the actual selected match count for a filtered seed window', async () => {
    const report = await runValidation(100, undefined, {
      floor: 5,
      seedFrom: 91,
      seedTo: 100,
      tickLimit: 1,
    });

    expect(report.matchesPerFloor).toBe(10);
    expect(report.totalMatches).toBe(10);
    expect(report.completedByFloor).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 10 });
  }, 15_000);

  it('constructs only the selected high-seed window with compact exact task indices', () => {
    const highSeed = Number.MAX_SAFE_INTEGER;

    expect(buildSelectedValidationTasks(highSeed, {
      floor: 5,
      seedFrom: highSeed,
      seedTo: highSeed,
    })).toEqual([{ index: 0, floor: 5, seed: highSeed }]);
  });

  it('distributes compact selected-task indices exactly once across workers', () => {
    const tasks = buildSelectedValidationTasks(94, {
      floor: 5,
      seedFrom: 91,
      seedTo: 94,
    });

    expect(selectValidationTasksForWorker(tasks, 0, 2)).toEqual([
      { index: 0, floor: 5, seed: 91 },
      { index: 2, floor: 5, seed: 93 },
    ]);
    expect(selectValidationTasksForWorker(tasks, 1, 2)).toEqual([
      { index: 1, floor: 5, seed: 92 },
      { index: 3, floor: 5, seed: 94 },
    ]);
  });

  it('requests finalization only after every distinct worker reports tasks done', () => {
    const doneWorkers = new Set<number>();

    expect(recordValidationWorkerTasksDone(doneWorkers, 0, 2)).toBe(false);
    expect(recordValidationWorkerTasksDone(doneWorkers, 0, 2)).toBe(false);
    expect(doneWorkers).toEqual(new Set([0]));
    expect(recordValidationWorkerTasksDone(doneWorkers, 1, 2)).toBe(true);
    expect(doneWorkers).toEqual(new Set([0, 1]));
  });

  it('rejects duplicate and missing task results by exact index, floor, and seed coverage', () => {
    const expected = buildSelectedValidationTasks(2, {});

    expect(() => assertExactValidationTaskCoverage(expected, [
      expected[0]!,
      expected[0]!,
      ...expected.slice(1),
    ])).toThrow('duplicate validation result index 0');
    expect(() => assertExactValidationTaskCoverage(expected, [
      expected[0]!,
      ...expected.slice(2),
    ])).toThrow('missing validation result index 1 (floor 1, seed 2)');
    expect(() => assertExactValidationTaskCoverage(expected, [
      { ...expected[0]!, floor: 2 },
      ...expected.slice(1),
    ])).toThrow('validation result index 0 expected floor 1 seed 1, received floor 2 seed 1');
  });

  it('rejects a 5000-match validation whose per-floor counts are imbalanced', () => {
    const completedByFloor = { 1: 999, 2: 1_001, 3: 1_000, 4: 1_000, 5: 1_000 };

    expect(Object.values(completedByFloor).reduce((sum, count) => sum + count, 0)).toBe(5_000);
    expect(() => assertCanonicalFloorMatchCounts(completedByFloor)).toThrow(
      'expected 1000 floor 1 matches, received 999',
    );
  });

  it('purely aggregates distinct worker checkpoint counters from the same snapshot', () => {
    const samples = new Map([
      [0, {
        checkpoint: 250,
        localMatches: 6,
        heapUsed: 100,
        wins: { 1: 1, 2: 1, 3: 2, 4: 0, 5: 0 },
        completedByFloor: { 1: 2, 2: 1, 3: 3, 4: 0, 5: 0 },
        rejectedCommands: 2,
        cappedMatches: 1,
      }],
      [1, {
        checkpoint: 250,
        localMatches: 9,
        heapUsed: 250,
        wins: { 1: 0, 2: 2, 3: 0, 4: 1, 5: 3 },
        completedByFloor: { 1: 1, 2: 3, 3: 0, 4: 2, 5: 3 },
        rejectedCommands: 5,
        cappedMatches: 4,
      }],
    ]);

    expect(aggregateWorkerCheckpointSamples(250, samples)).toEqual({
      completed: 15,
      wins: { 1: 1, 2: 3, 3: 2, 4: 1, 5: 3 },
      completedByFloor: { 1: 3, 2: 4, 3: 3, 4: 2, 5: 3 },
      rejectedCommands: 7,
      cappedMatches: 5,
      heapUsed: 350,
    });
  });

  it('rejects a worker checkpoint whose per-floor sum violates local progress', () => {
    const samples = new Map([[7, {
      checkpoint: 250,
      localMatches: 2,
      heapUsed: 100,
      wins: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      completedByFloor: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      rejectedCommands: 0,
      cappedMatches: 0,
    }]]);

    expect(() => aggregateWorkerCheckpointSamples(250, samples)).toThrow(
      'worker 7 heap checkpoint 250 completedByFloor 1 does not match localMatches 2',
    );
  });

  it('rejects final worker counters that disagree with result-derived counters', () => {
    const finalSamples = new Map([[0, {
      checkpoint: 2,
      localMatches: 2,
      heapUsed: 100,
      wins: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      completedByFloor: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
      rejectedCommands: 3,
      cappedMatches: 1,
    }]]);

    expect(() => assertFinalWorkerSnapshotCountersMatchResults(2, finalSamples, {
      totalMatches: 2,
      wins: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      completedByFloor: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
      rejectedCommands: 3,
      cappedMatches: 0,
    })).toThrow('final worker cappedMatches 1 does not match result-derived 0');
  });

  it('updates every worker counter from one nonzero match result', () => {
    const counters = {
      localMatches: 0,
      wins: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      completedByFloor: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      rejectedCommands: 0,
      cappedMatches: 0,
    };

    updateWorkerCounters(counters, {
      floor: 3,
      outcome: 'player',
      rejectedCommands: 2,
      exceededTickLimit: true,
    });

    expect(counters).toEqual({
      localMatches: 1,
      wins: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 },
      completedByFloor: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 },
      rejectedCommands: 2,
      cappedMatches: 1,
    });
  });

  it('updates nonzero final worker counters independently of result reduction', async () => {
    const report = await runValidation(1, undefined, { tickLimit: 1 });
    const finalSamples = report.workers.map(({ heapSamples }) => heapSamples.at(-1)!);

    expect(finalSamples.reduce((sum, sample) => sum + sample.localMatches, 0)).toBe(5);
    expect(finalSamples.reduce((sum, sample) => sum + sample.cappedMatches, 0)).toBe(5);
    expect(report.cappedMatches).toBe(5);
  }, 15_000);

  it('fails incomplete requested heap checkpoints instead of dropping them', () => {
    expect(() => assertCompleteHeapCheckpointCoverage(
      [0, 250],
      new Map([[0, 4], [250, 3]]),
      4,
    )).toThrow(/checkpoint 250 received 3 of 4 worker samples/);
  });

  it('exits nonzero when a filtered diagnostic contains a capped case', () => {
    const script = fileURLToPath(new URL(
      '../../scripts/validate-ai-simulations.ts',
      import.meta.url,
    ));
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      '--import',
      'tsx',
      script,
      '--floor',
      '5',
      '--seed-from',
      '1',
      '--seed-to',
      '1',
      '--tick-limit',
      '1',
    ], { encoding: 'utf8', timeout: 15_000 });

    expect(child.status).toBe(1);
    expect(child.stderr).toContain('case=floor5/seed1; rejected=0; capped=1; ticks=1');
  }, 20_000);

  it.each([
    {
      name: 'positional argument',
      args: ['5', '--floor', '5', '--seed-from', '1', '--seed-to', '1', '--tick-limit', '1'],
      message: 'unexpected positional argument: 5',
    },
    {
      name: 'unknown flag',
      args: ['--bogus', '1', '--floor', '5', '--seed-from', '1', '--seed-to', '1', '--tick-limit', '1'],
      message: 'unknown argument: --bogus',
    },
    {
      name: 'duplicate flag',
      args: ['--floor', '5', '--floor', '4', '--seed-from', '1', '--seed-to', '1', '--tick-limit', '1'],
      message: 'duplicate argument: --floor',
    },
    {
      name: 'missing value',
      args: ['--floor', '5', '--seed-from', '1', '--seed-to', '1', '--tick-limit'],
      message: 'missing value for argument: --tick-limit',
    },
    {
      name: 'equals syntax',
      args: ['--floor=5', '--floor', '5', '--seed-from', '1', '--seed-to', '1', '--tick-limit', '1'],
      message: 'equals syntax is not supported: --floor=5',
    },
    {
      name: 'unsafe integer',
      args: ['--floor', '5', '--seed-from', '1', '--seed-to', '9007199254740992', '--tick-limit', '1'],
      message: '--seed-to must be a positive safe integer',
    },
  ])('rejects $name before starting validation', ({ args, message }) => {
    const script = fileURLToPath(new URL(
      '../../scripts/validate-ai-simulations.ts',
      import.meta.url,
    ));
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      '--import',
      'tsx',
      script,
      ...args,
    ], { encoding: 'utf8', timeout: 15_000 });

    expect(child.status).toBe(1);
    expect(child.stderr).toContain(message);
    expect(child.stderr).not.toContain('case=floor');
  }, 20_000);

  it('does not expose internal worker mode without the spawn-only environment gate', () => {
    const script = fileURLToPath(new URL(
      '../../scripts/validate-ai-simulations.ts',
      import.meta.url,
    ));
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      '--import',
      'tsx',
      script,
      '--worker',
      '{}',
    ], { encoding: 'utf8', timeout: 15_000 });

    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('unknown argument: --worker');
  }, 20_000);

  it('requires exact worker argv even when the spawn-only environment gate is present', () => {
    const script = fileURLToPath(new URL(
      '../../scripts/validate-ai-simulations.ts',
      import.meta.url,
    ));
    const child = spawnSync(process.execPath, [
      '--expose-gc',
      '--import',
      'tsx',
      script,
      '--worker',
      '{}',
      '--extra',
      '1',
    ], {
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, AI_VALIDATION_WORKER: '1' },
    });

    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toContain('validation worker requires exactly --worker <json-options>');
  }, 20_000);

  it('rejects unsafe programmatic match counts before task construction', async () => {
    await expect(runValidation(Number.MAX_SAFE_INTEGER + 1, undefined, { tickLimit: 1 }))
      .rejects.toThrow('matchesPerFloor must be a positive safe integer');
  });

  it('rejects unsafe programmatic selection numbers before task construction', async () => {
    await expect(runValidation(1, undefined, {
      floor: 5,
      seedFrom: 1,
      seedTo: Number.MAX_SAFE_INTEGER + 1,
      tickLimit: 1,
    })).rejects.toThrow('seedTo must be a positive safe integer');
  });

  it('parses the largest safe filtered seed without constructing earlier seeds', () => {
    expect(parseValidationArguments([
      '--floor',
      '5',
      '--seed-from',
      String(Number.MAX_SAFE_INTEGER),
      '--seed-to',
      String(Number.MAX_SAFE_INTEGER),
    ])).toEqual({
      floor: 5,
      seedFrom: Number.MAX_SAFE_INTEGER,
      seedTo: Number.MAX_SAFE_INTEGER,
    });
  });
});
