import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runAiSimulation } from '../src/sim/aiSimulation';

const VALIDATION_MATCHES_PER_FLOOR = 1_000;
const HEAP_SAMPLE_INTERVAL = 250;
// Four isolates kept this allocation-heavy search below 256 MiB and scaled well on
// Windows; 16 isolates consumed roughly 1 GiB and suffered an external worker kill.
const MAX_VALIDATION_WORKERS = 4;
const MAX_HEAP_DELTA = 32 * 1024 * 1024;
const MAX_LINEAR_BYTES_PER_1_000 = 256 * 1024;

interface ValidationTask {
  readonly index: number;
  readonly floor: 1 | 2 | 3;
  readonly seed: number;
}

interface ValidationSelection {
  readonly floor?: 1 | 2 | 3;
  readonly seedFrom?: number;
  readonly seedTo?: number;
}

interface MatchResult extends ValidationTask {
  readonly outcome: 'player' | 'opponent' | 'draw';
  readonly rejectedCommands: number;
  readonly exceededTickLimit: boolean;
  readonly ticks: number;
  readonly durationMs: number;
}

interface WorkerHeapSample {
  readonly checkpoint: number;
  readonly localMatches: number;
  readonly heapUsed: number;
}

interface HeapSample {
  readonly matches: number;
  readonly heapUsed: number;
}

interface WorkerReport {
  readonly workerIndex: number;
  readonly heapSamples: readonly WorkerHeapSample[];
  readonly finalHeapDelta: number;
}

type WorkerMessage =
  | { readonly type: 'match'; readonly result: MatchResult }
  | ({ readonly type: 'heap'; readonly workerIndex: number } & WorkerHeapSample)
  | { readonly type: 'tasks-done'; readonly workerIndex: number }
  | { readonly type: 'done'; readonly workerIndex: number };

type ControlMessage =
  | { readonly type: 'heap'; readonly checkpoint: number }
  | { readonly type: 'finish' };

export interface ValidationReport {
  readonly matchesPerFloor: number;
  readonly totalMatches: number;
  readonly rejectedCommands: number;
  readonly cappedMatches: number;
  readonly rejectedCases: readonly Pick<MatchResult, 'floor' | 'seed' | 'rejectedCommands'>[];
  readonly cappedCases: readonly Pick<MatchResult, 'floor' | 'seed' | 'ticks'>[];
  readonly winRates: Readonly<Record<1 | 2 | 3, number>>;
  readonly floorDurationsMs: Readonly<Record<1 | 2 | 3, number>>;
  readonly elapsedMs: number;
  readonly workers: readonly WorkerReport[];
  readonly heapSamples: readonly HeapSample[];
  readonly finalHeapDelta: number;
  readonly linearBytesPer1_000: number;
}

export interface ValidationCheckpoint {
  readonly completed: number;
  readonly total: number;
  readonly rejectedCommands: number;
  readonly cappedMatches: number;
  readonly wins: Readonly<Record<1 | 2 | 3, number>>;
  readonly completedByFloor: Readonly<Record<1 | 2 | 3, number>>;
  readonly heapUsed: number;
  readonly heapDelta: number;
}

export interface ValidationProblemCase {
  readonly floor: 1 | 2 | 3;
  readonly seed: number;
  readonly ticks: number;
  readonly rejectedCommands: number;
  readonly exceededTickLimit: boolean;
}

export interface ValidationOptions extends ValidationSelection {
  readonly tickLimit?: number;
  readonly onProblemCase?: (result: ValidationProblemCase) => void;
}

function tasksFor(matchesPerFloor: number): readonly ValidationTask[] {
  const tasks: ValidationTask[] = [];
  for (const floor of [1, 2, 3] as const) {
    for (let seedIndex = 0; seedIndex < matchesPerFloor; seedIndex += 1) {
      tasks.push({ index: tasks.length, floor, seed: seedIndex + 1 });
    }
  }
  return tasks;
}

function selectedTasks(
  matchesPerFloor: number,
  selection: ValidationSelection,
): readonly ValidationTask[] {
  const seedFrom = selection.seedFrom ?? 1;
  const seedTo = selection.seedTo ?? matchesPerFloor;
  return tasksFor(matchesPerFloor).filter(({ floor, seed }) =>
    (selection.floor === undefined || floor === selection.floor)
      && seed >= seedFrom
      && seed <= seedTo);
}

function collectHeap(): number {
  if (global.gc === undefined) throw new Error('validate:ai requires Node --expose-gc');
  global.gc();
  return process.memoryUsage().heapUsed;
}

function linearBytesPer1_000(samples: readonly HeapSample[]): number {
  if (samples.length < 2) return 0;
  const meanX = samples.reduce((sum, sample) => sum + sample.matches, 0) / samples.length;
  const meanY = samples.reduce((sum, sample) => sum + sample.heapUsed, 0) / samples.length;
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    const x = sample.matches - meanX;
    numerator += x * (sample.heapUsed - meanY);
    denominator += x * x;
  }
  return denominator === 0 ? 0 : (numerator / denominator) * 1_000;
}

export function assertCompleteHeapCheckpointCoverage(
  requestedCheckpoints: readonly number[],
  receivedCounts: ReadonlyMap<number, number>,
  workerCount: number,
): void {
  for (const checkpoint of requestedCheckpoints) {
    const received = receivedCounts.get(checkpoint) ?? 0;
    if (received !== workerCount) {
      throw new Error(
        `heap checkpoint ${checkpoint} received ${received} of ${workerCount} worker samples`,
      );
    }
  }
}

function emit(message: WorkerMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function runWorkerProcess(options: {
  readonly workerIndex: number;
  readonly workerCount: number;
  readonly matchesPerFloor: number;
  readonly totalTasks: number;
  readonly floor?: 1 | 2 | 3;
  readonly seedFrom?: number;
  readonly seedTo?: number;
  readonly tickLimit?: number;
}): Promise<void> {
  const tasks = selectedTasks(options.matchesPerFloor, options)
    .filter(({ index }) => index % options.workerCount === options.workerIndex);
  const controls: ControlMessage[] = [];
  let wake: (() => void) | undefined;
  const controlsInput = createInterface({ input: process.stdin });
  controlsInput.on('line', (line) => {
    controls.push(JSON.parse(line) as ControlMessage);
    wake?.();
    wake = undefined;
  });
  controlsInput.on('close', () => {
    controls.push({ type: 'finish' });
    wake?.();
    wake = undefined;
  });
  const drainControls = (): boolean => {
    let shouldExit = false;
    for (const control of controls.splice(0)) {
      if (control.type === 'finish') {
        shouldExit = true;
      } else {
        emit({
          type: 'heap',
          workerIndex: options.workerIndex,
          checkpoint: control.checkpoint,
          localMatches: completed,
          heapUsed: collectHeap(),
        });
        if (control.checkpoint === options.totalTasks) shouldExit = true;
      }
    }
    return shouldExit;
  };

  if (tasks[0] !== undefined) {
    runAiSimulation({ seed: tasks[0].seed, floor: tasks[0].floor, tickLimit: 240 });
  }
  let completed = 0;
  emit({
    type: 'heap',
    workerIndex: options.workerIndex,
    checkpoint: 0,
    localMatches: 0,
    heapUsed: collectHeap(),
  });

  let finalCheckpointHandled = false;
  for (const task of tasks) {
    const started = performance.now();
    const summary = runAiSimulation({
      seed: task.seed,
      floor: task.floor,
      ...(options.tickLimit === undefined ? {} : { tickLimit: options.tickLimit }),
    });
    completed += 1;
    emit({
      type: 'match',
      result: {
        ...task,
        outcome: summary.outcome,
        rejectedCommands: summary.rejectedCommands,
        exceededTickLimit: summary.exceededTickLimit,
        ticks: summary.ticks,
        durationMs: performance.now() - started,
      },
    });
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    finalCheckpointHandled = drainControls() || finalCheckpointHandled;
  }

  emit({ type: 'tasks-done', workerIndex: options.workerIndex });
  while (!finalCheckpointHandled) {
    if (drainControls()) break;
    await new Promise<void>((resolveControl) => { wake = resolveControl; });
  }
  controlsInput.close();
  process.stdin.pause();
  emit({ type: 'done', workerIndex: options.workerIndex });
}

interface WorkerHandle {
  readonly workerIndex: number;
  readonly child: ChildProcessWithoutNullStreams;
  readonly completion: Promise<void>;
  readonly heapSamples: WorkerHeapSample[];
}

function launchWorker(
  options: {
    readonly workerIndex: number;
    readonly workerCount: number;
    readonly matchesPerFloor: number;
    readonly totalTasks: number;
    readonly floor?: 1 | 2 | 3;
    readonly seedFrom?: number;
    readonly seedTo?: number;
    readonly tickLimit?: number;
  },
  onMessage: (message: WorkerMessage) => void,
): WorkerHandle {
  const child = spawn(process.execPath, [
    '--expose-gc',
    '--import',
    'tsx',
    fileURLToPath(import.meta.url),
    '--worker',
    JSON.stringify(options),
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  const heapSamples: WorkerHeapSample[] = [];
  const completion = new Promise<void>((resolveWorker, rejectWorker) => {
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const message = JSON.parse(line) as WorkerMessage;
        if (message.type === 'heap') heapSamples.push(message);
        onMessage(message);
      } catch (error) {
        rejectWorker(new Error(`worker ${options.workerIndex} invalid JSON: ${String(error)}\n${line}`));
      }
    });
    child.on('error', rejectWorker);
    child.on('close', (code) => {
      if (code === 0) resolveWorker();
      else rejectWorker(new Error(`validation worker ${options.workerIndex} exited ${code}: ${stderr}`));
    });
  });
  return { workerIndex: options.workerIndex, child, completion, heapSamples };
}

function sendControl(handle: WorkerHandle, control: ControlMessage): void {
  handle.child.stdin.write(`${JSON.stringify(control)}\n`);
}

export async function runValidation(
  matchesPerFloor: number,
  onCheckpoint?: (checkpoint: ValidationCheckpoint) => void,
  options: ValidationOptions = {},
): Promise<ValidationReport> {
  if (!Number.isInteger(matchesPerFloor) || matchesPerFloor <= 0) {
    throw new RangeError('matchesPerFloor must be a positive integer');
  }
  const tasks = selectedTasks(matchesPerFloor, options);
  if (tasks.length === 0) throw new RangeError('validation selection must contain at least one match');
  const workerCount = Math.min(
    MAX_VALIDATION_WORKERS,
    availableParallelism(),
    tasks.length,
  );
  const total = tasks.length;
  const started = performance.now();
  const results: MatchResult[] = [];
  const heaps = new Map<number, Map<number, WorkerHeapSample>>();
  const requestedCheckpoints = new Set<number>([0]);
  const handles: WorkerHandle[] = [];

  const aggregateCheckpoint = (checkpoint: number) => {
    const checkpointHeaps = heaps.get(checkpoint);
    if (checkpointHeaps?.size !== workerCount) return;
    const baselineHeaps = heaps.get(0);
    if (baselineHeaps?.size !== workerCount) return;
    const completedResults = results;
    const wins: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    const completedByFloor: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    let rejectedCommands = 0;
    let cappedMatches = 0;
    for (const result of completedResults) {
      completedByFloor[result.floor] += 1;
      if (result.outcome === 'player') wins[result.floor] += 1;
      rejectedCommands += result.rejectedCommands;
      if (result.exceededTickLimit) cappedMatches += 1;
    }
    const actualMatches = [...checkpointHeaps.values()]
      .reduce((sum, sample) => sum + sample.localMatches, 0);
    const heapUsed = [...checkpointHeaps.values()]
      .reduce((sum, sample) => sum + sample.heapUsed, 0);
    const baseline = [...baselineHeaps.values()]
      .reduce((sum, sample) => sum + sample.heapUsed, 0);
    onCheckpoint?.({
      completed: actualMatches,
      total,
      rejectedCommands,
      cappedMatches,
      wins,
      completedByFloor,
      heapUsed,
      heapDelta: heapUsed - baseline,
    });
  };

  const requestHeap = (checkpoint: number) => {
    if (requestedCheckpoints.has(checkpoint)) return;
    requestedCheckpoints.add(checkpoint);
    for (const handle of handles) sendControl(handle, { type: 'heap', checkpoint });
  };

  const onMessage = (message: WorkerMessage) => {
    if (message.type === 'match') {
      results.push(message.result);
      if (message.result.rejectedCommands > 0 || message.result.exceededTickLimit) {
        options.onProblemCase?.({
          floor: message.result.floor,
          seed: message.result.seed,
          ticks: message.result.ticks,
          rejectedCommands: message.result.rejectedCommands,
          exceededTickLimit: message.result.exceededTickLimit,
        });
      }
      const completed = results.length;
      if (completed % HEAP_SAMPLE_INTERVAL === 0 || completed === total) requestHeap(completed);
      return;
    }
    if (message.type === 'heap') {
      const checkpoint = heaps.get(message.checkpoint) ?? new Map<number, WorkerHeapSample>();
      checkpoint.set(message.workerIndex, message);
      heaps.set(message.checkpoint, checkpoint);
      aggregateCheckpoint(message.checkpoint);
      return;
    }
  };

  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    handles.push(launchWorker({
      workerIndex,
      workerCount,
      matchesPerFloor,
      totalTasks: total,
      ...(options.floor === undefined ? {} : { floor: options.floor }),
      ...(options.seedFrom === undefined ? {} : { seedFrom: options.seedFrom }),
      ...(options.seedTo === undefined ? {} : { seedTo: options.seedTo }),
      ...(options.tickLimit === undefined ? {} : { tickLimit: options.tickLimit }),
    }, onMessage));
  }
  try {
    await Promise.all(handles.map(({ completion }) => completion));
  } catch (error) {
    for (const handle of handles) {
      if (!handle.child.killed) handle.child.kill();
    }
    throw error;
  }
  assertCompleteHeapCheckpointCoverage(
    [...requestedCheckpoints],
    new Map([...heaps].map(([checkpoint, samples]) => [checkpoint, samples.size])),
    workerCount,
  );

  const ordered = results.sort((left, right) => left.index - right.index);
  const wins: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  const floorDurationsMs: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let rejectedCommands = 0;
  let cappedMatches = 0;
  for (const result of ordered) {
    if (result.outcome === 'player') wins[result.floor] += 1;
    rejectedCommands += result.rejectedCommands;
    if (result.exceededTickLimit) cappedMatches += 1;
    floorDurationsMs[result.floor] += result.durationMs;
  }
  const heapSamples = [...heaps.entries()]
    .filter(([, values]) => values.size === workerCount)
    .map(([, values]) => ({
      matches: [...values.values()].reduce((sum, sample) => sum + sample.localMatches, 0),
      heapUsed: [...values.values()].reduce((sum, sample) => sum + sample.heapUsed, 0),
    }))
    .sort((left, right) => left.matches - right.matches);
  const workers = handles.map((handle): WorkerReport => {
    const samples = handle.heapSamples.sort((left, right) => left.checkpoint - right.checkpoint);
    return {
      workerIndex: handle.workerIndex,
      heapSamples: samples,
      finalHeapDelta: samples.at(-1)!.heapUsed - samples[0]!.heapUsed,
    };
  });
  return {
    matchesPerFloor,
    totalMatches: ordered.length,
    rejectedCommands,
    cappedMatches,
    rejectedCases: ordered
      .filter(({ rejectedCommands: rejected }) => rejected > 0)
      .map(({ floor, seed, rejectedCommands: rejected }) => ({ floor, seed, rejectedCommands: rejected })),
    cappedCases: ordered
      .filter(({ exceededTickLimit }) => exceededTickLimit)
      .map(({ floor, seed, ticks }) => ({ floor, seed, ticks })),
    winRates: {
      1: wins[1] / ordered.filter(({ floor }) => floor === 1).length,
      2: wins[2] / ordered.filter(({ floor }) => floor === 2).length,
      3: wins[3] / ordered.filter(({ floor }) => floor === 3).length,
    },
    floorDurationsMs,
    elapsedMs: performance.now() - started,
    workers,
    heapSamples,
    finalHeapDelta: heapSamples.at(-1)!.heapUsed - heapSamples[0]!.heapUsed,
    linearBytesPer1_000: linearBytesPer1_000(heapSamples),
  };
}

function assertValidation(report: ValidationReport): void {
  if (report.totalMatches !== VALIDATION_MATCHES_PER_FLOOR * 3) {
    throw new Error(`expected 3000 matches, received ${report.totalMatches}`);
  }
  if (report.rejectedCommands !== 0) {
    throw new Error(`expected zero rejected commands: ${JSON.stringify(report.rejectedCases)}`);
  }
  if (report.cappedMatches !== 0) {
    throw new Error(`expected zero capped matches: ${JSON.stringify(report.cappedCases)}`);
  }
  if (!(report.winRates[1] < report.winRates[2] && report.winRates[2] < report.winRates[3])) {
    throw new Error(`win rates are not strictly ordered: ${JSON.stringify(report.winRates)}`);
  }
  if (report.finalHeapDelta > MAX_HEAP_DELTA) {
    throw new Error(`aggregate heap delta ${report.finalHeapDelta} exceeds 32 MiB`);
  }
  if (report.linearBytesPer1_000 > MAX_LINEAR_BYTES_PER_1_000) {
    throw new Error(`linear heap growth ${report.linearBytesPer1_000} exceeds 256 KiB/1000`);
  }
  for (const worker of report.workers) {
    if (worker.finalHeapDelta > MAX_HEAP_DELTA) {
      throw new Error(`worker ${worker.workerIndex} heap delta ${worker.finalHeapDelta} exceeds 32 MiB`);
    }
  }
}

function formatRate(wins: number, completed: number): string {
  return completed === 0 ? '-' : `${(wins / completed * 100).toFixed(1)}%`;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveIntegerArgument(name: string): number | undefined {
  const raw = argumentValue(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function logProblemCase(problem: ValidationProblemCase): void {
  console.error(
    `case=floor${problem.floor}/seed${problem.seed}; rejected=${problem.rejectedCommands}; `
      + `capped=${problem.exceededTickLimit ? 1 : 0}; ticks=${problem.ticks}`,
  );
}

async function main(): Promise<void> {
  const floorValue = positiveIntegerArgument('--floor');
  if (floorValue !== undefined && floorValue !== 1 && floorValue !== 2 && floorValue !== 3) {
    throw new RangeError('--floor must be 1, 2, or 3');
  }
  const floor = floorValue as 1 | 2 | 3 | undefined;
  const seedFrom = positiveIntegerArgument('--seed-from');
  const seedTo = positiveIntegerArgument('--seed-to');
  const tickLimit = positiveIntegerArgument('--tick-limit');
  const filtered = floor !== undefined || seedFrom !== undefined || seedTo !== undefined;
  if (filtered && (floor === undefined || seedFrom === undefined || seedTo === undefined)) {
    throw new Error('filtered validation requires --floor, --seed-from, and --seed-to');
  }
  if (seedFrom !== undefined && seedTo !== undefined && seedFrom > seedTo) {
    throw new RangeError('--seed-from must not exceed --seed-to');
  }
  const matchesPerFloor = filtered ? seedTo! : VALIDATION_MATCHES_PER_FLOOR;
  const report = await runValidation(matchesPerFloor, (checkpoint) => {
    const rates = ([1, 2, 3] as const).map((floor) =>
      formatRate(checkpoint.wins[floor], checkpoint.completedByFloor[floor]));
    console.error(
      `checkpoint=${checkpoint.completed}/${checkpoint.total}; rates=${rates.join('/')}; `
        + `rejected=${checkpoint.rejectedCommands}; capped=${checkpoint.cappedMatches}; `
        + `heapDeltaMiB=${(checkpoint.heapDelta / 1024 / 1024).toFixed(2)}`,
    );
  }, {
    ...(floor === undefined ? {} : { floor }),
    ...(seedFrom === undefined ? {} : { seedFrom }),
    ...(seedTo === undefined ? {} : { seedTo }),
    ...(tickLimit === undefined ? {} : { tickLimit }),
    onProblemCase: logProblemCase,
  });
  if (filtered) {
    console.log(
      `filtered matches=${report.totalMatches}; floor=${floor}; seeds=${seedFrom}-${seedTo}; `
        + `rejected=${report.rejectedCommands}; capped=${report.cappedMatches}`,
    );
    if (report.rejectedCommands !== 0 || report.cappedMatches !== 0) {
      throw new Error('filtered validation found rejected or capped matches');
    }
    return;
  }
  assertValidation(report);
  const rate = (floor: 1 | 2 | 3) => (report.winRates[floor] * 100).toFixed(1);
  console.log(
    `3000 matches; rejected=0; capped=0; floor1 < floor2 < floor3; heap=PASS; `
      + `wins=${rate(1)}%<${rate(2)}%<${rate(3)}%; elapsed=${(report.elapsedMs / 1000).toFixed(1)}s`,
  );
}

const workerArgument = process.argv.indexOf('--worker');
if (workerArgument >= 0) {
  await runWorkerProcess(JSON.parse(process.argv[workerArgument + 1]!));
} else if (process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
