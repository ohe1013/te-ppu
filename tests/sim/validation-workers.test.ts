import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertCompleteHeapCheckpointCoverage,
  runValidation,
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

    expect(report.totalMatches).toBe(3);
    expect(report.heapSamples.map(({ matches }) => matches)).toEqual([0, 3]);
    expect(checkpoints.map(({ completed }) => completed)).toEqual([0, 3]);
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
    const report = await runValidation(84, undefined, { tickLimit: 1 });
    const actualAt250 = report.workers.reduce((sum, worker) =>
      sum + worker.heapSamples.find(({ checkpoint }) => checkpoint === 250)!.localMatches, 0);

    expect(actualAt250).toBeGreaterThanOrEqual(250);
    expect(report.heapSamples.map(({ matches }) => matches)).toContain(actualAt250);
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
      '2',
      '--seed-from',
      '1',
      '--seed-to',
      '1',
      '--tick-limit',
      '1',
    ], { encoding: 'utf8', timeout: 15_000 });

    expect(child.status).toBe(1);
    expect(child.stderr).toContain('case=floor2/seed1; rejected=0; capped=1; ticks=1');
  }, 20_000);
});
