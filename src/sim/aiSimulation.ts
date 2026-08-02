import { createHash, type Hash } from 'node:crypto';
import {
  RandomStream,
  applySideCommands,
  counterU32,
  createAiObservation,
  createMatch,
  stepMatch,
  type MatchState,
  type SideId,
  type SideState,
  type TimedCommand,
} from '../core/index';
import {
  AI_FLOOR_PROFILES,
  createAiController,
  type AiController,
} from '../ai/index';

export const MAX_SIMULATION_TICKS = 36_000;
export const AI_SIMULATION_BENCHMARK_FLOOR = 2 as const;
export const AI_SIMULATION_BENCHMARK_BASE_TICKS = 27;
export const AI_SIMULATION_BENCHMARK_REAL_TICKS = 23;

const SIDE_ORDER: Readonly<Record<SideId, number>> = { player: 0, opponent: 1 };

export type SimulationController = AiController;

export interface SimulationSummary {
  readonly outcome: 'player' | 'opponent' | 'draw';
  readonly ticks: number;
  readonly stateHash: string;
  readonly eventHash: string;
  readonly rejectedCommands: number;
  readonly exceededTickLimit: boolean;
}

export interface AiSimulationOptions {
  readonly seed: number;
  readonly floor: 1 | 2 | 3;
  readonly tickLimit?: number;
  readonly controllers?: Readonly<Record<SideId, SimulationController>>;
}

interface OwnedCommand {
  readonly owner: SideId;
  readonly sequence: number;
  readonly timed: TimedCommand;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const source = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(source).sort().map((key) => [key, canonicalize(source[key])]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function appendFramedJson(hash: Hash, value: unknown): void {
  const json = canonicalJson(value);
  hash.update(String(Buffer.byteLength(json)));
  hash.update(':');
  hash.update(json);
}

function profileFor(floor: 1 | 2 | 3) {
  return AI_FLOOR_PROFILES[floor - 1]!;
}

function deriveControllerSeed(matchSeed: number, side: SideId): number {
  return counterU32(
    matchSeed,
    RandomStream.AI_MISTAKE,
    side === 'player' ? 0 : 1,
  );
}

export function createBenchmarkController(
  base: SimulationController,
): SimulationController {
  let eligibleCredit = 0;
  return {
    side: base.side,
    update(view, tick) {
      const eligible = view.status === 'playing'
        && view.self.phase === 'active'
        && view.self.active !== null
        && !view.self.topOut
        && view.self.freezeTicks === 0;
      if (!eligible) return [];

      eligibleCredit += AI_SIMULATION_BENCHMARK_BASE_TICKS;
      while (eligibleCredit >= AI_SIMULATION_BENCHMARK_REAL_TICKS) {
        eligibleCredit -= AI_SIMULATION_BENCHMARK_REAL_TICKS;
        const output = base.update(view, tick);
        if (output.length > 0) return output.slice(0, 1);
      }
      return [];
    },
  };
}

function defaultControllers(
  matchSeed: number,
  testedFloor: 1 | 2 | 3,
): Readonly<Record<SideId, SimulationController>> {
  return {
    player: createAiController(
      profileFor(testedFloor),
      deriveControllerSeed(matchSeed, 'player'),
      'player',
    ),
    opponent: createBenchmarkController(
      createAiController(
        profileFor(AI_SIMULATION_BENCHMARK_FLOOR),
        deriveControllerSeed(matchSeed, 'opponent'),
        'opponent',
      ),
    ),
  };
}

function normalizeTickLimit(value: number | undefined): number {
  if (value === undefined) return MAX_SIMULATION_TICKS;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('tickLimit must be a positive integer');
  }
  return Math.min(value, MAX_SIMULATION_TICKS);
}

function stableCommands(
  state: MatchState,
  controllers: Readonly<Record<SideId, SimulationController>>,
): readonly OwnedCommand[] {
  const tick = state.tick + 1;
  let sequence = 0;
  const owned: OwnedCommand[] = [];
  for (const side of ['player', 'opponent'] as const) {
    const observation = createAiObservation(state, side);
    for (const timed of controllers[side].update(observation, tick)) {
      owned.push({ owner: side, sequence, timed });
      sequence += 1;
    }
  }
  return owned.sort((left, right) =>
    left.timed.tick - right.timed.tick
      || SIDE_ORDER[left.timed.side] - SIDE_ORDER[right.timed.side]
      || left.sequence - right.sequence);
}

function isWellFormed(
  command: OwnedCommand,
  controllers: Readonly<Record<SideId, SimulationController>>,
  tick: number,
): boolean {
  return controllers[command.owner].side === command.owner
    && command.timed.side === command.owner
    && command.timed.tick === tick;
}

export function isCommandAcceptedAtEmission(
  state: MatchState,
  timed: TimedCommand,
): boolean {
  return auditCommandsAtEmission(state, [timed])[0]!;
}

function isProbeCommand(timed: TimedCommand): boolean {
  return timed.command.type === 'move'
    || timed.command.type === 'rotate-clockwise'
    || timed.command.type === 'soft-drop'
    || timed.command.type === 'hard-drop';
}

function sideIsEligible(state: MatchState, side: SideId): boolean {
  return state.status === 'playing'
    && sideStateIsEligible(state.sides[side]);
}

function sideStateIsEligible(current: SideState): boolean {
  return current.phase === 'active'
    && current.active !== null
    && !current.topOut
    && current.freezeTicks === 0;
}

export function auditCommandsAtEmission(
  state: MatchState,
  commands: readonly TimedCommand[],
): readonly boolean[] {
  const accepted = Array<boolean>(commands.length).fill(false);
  const freezeAccepted: Record<SideId, boolean> = { player: false, opponent: false };

  commands.forEach((timed, index) => {
    if (timed.tick !== state.tick + 1 || timed.command.type !== 'use-freeze') return;
    if (!sideIsEligible(state, timed.side) || freezeAccepted[timed.side]) return;
    if (state.sides[timed.side].inventory.freeze <= 0) return;
    freezeAccepted[timed.side] = true;
    accepted[index] = true;
  });

  const simulated = {
    player: state.sides.player,
    opponent: state.sides.opponent,
  };

  commands.forEach((timed, index) => {
    if (timed.command.type === 'use-freeze' || timed.tick !== state.tick + 1) return;
    if (state.status !== 'playing' || !sideStateIsEligible(simulated[timed.side])) return;
    const baseline = applySideCommands(simulated[timed.side], [], timed.side);
    const applied = applySideCommands(simulated[timed.side], [timed.command], timed.side);
    simulated[timed.side] = applied.state;
    accepted[index] = isProbeCommand(timed)
      || canonicalJson(applied) !== canonicalJson(baseline);
  });

  return accepted;
}

function outcomeFor(state: MatchState): SimulationSummary['outcome'] {
  if (state.status === 'player-won') return 'player';
  if (state.status === 'opponent-won') return 'opponent';
  return 'draw';
}

export function runAiSimulation(options: AiSimulationOptions): SimulationSummary {
  const tickLimit = normalizeTickLimit(options.tickLimit);
  const controllers = options.controllers ?? defaultControllers(options.seed, options.floor);
  let state = createMatch({ matchSeed: options.seed, countdownTicks: 0 });
  let rejectedCommands = 0;
  const eventHash = createHash('sha256');

  while (state.status === 'playing' && state.tick < tickLimit) {
    const tick = state.tick + 1;
    const owned = stableCommands(state, controllers);
    const wellFormed = owned.filter((command) => isWellFormed(command, controllers, tick));
    const commands = wellFormed.map(({ timed }) => timed);
    const step = stepMatch(state, commands);
    const accepted = new Map<OwnedCommand, boolean>();
    const commandAcceptance = auditCommandsAtEmission(state, commands);
    let wellFormedIndex = 0;

    for (const command of owned) {
      if (!isWellFormed(command, controllers, tick)) {
        accepted.set(command, false);
        rejectedCommands += 1;
        continue;
      }
      const commandAccepted = commandAcceptance[wellFormedIndex]!;
      wellFormedIndex += 1;
      accepted.set(command, commandAccepted);
      if (!commandAccepted) {
        rejectedCommands += 1;
      }
    }

    appendFramedJson(eventHash, {
      tick,
      commands: owned.map((entry) => ({
        owner: entry.owner,
        timed: entry.timed,
        accepted: accepted.get(entry),
      })),
      events: step.events,
    });
    state = step.state;
  }

  const exceededTickLimit = state.status === 'playing' && state.tick === tickLimit;
  return {
    outcome: outcomeFor(state),
    ticks: state.tick,
    stateHash: sha256(state),
    eventHash: eventHash.digest('hex'),
    rejectedCommands,
    exceededTickLimit,
  };
}
