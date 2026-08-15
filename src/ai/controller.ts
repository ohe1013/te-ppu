import {
  RandomStream,
  BOARD_WIDTH,
  HIDDEN_ROWS,
  counterU32,
  tryRotateClockwise,
  type ActivePiece,
  type AiObservation,
  type Board,
  type Cell,
  type GameCommand,
  type PublicActivePiece,
  type SideId,
  type TimedCommand,
} from '../core/index';
import { scoreCandidates, selectCandidate } from './evaluate';
import { planItemCommands } from './items';
import type { AiController, AiFloorProfile } from './types';

interface RouteExpectation {
  readonly contextFingerprint: string;
  readonly active: PublicActivePiece;
  readonly sourceFingerprint: string;
  readonly failedPrefix: string;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function contextFingerprint(view: AiObservation): string {
  return fingerprint({
    board: view.self.board,
    inventory: view.self.inventory,
    phase: view.self.phase,
  });
}

function placementFingerprint(view: AiObservation): string {
  return fingerprint({
    board: view.self.board,
    inventory: view.self.inventory,
    phase: view.self.phase,
    active: view.self.active,
  });
}

function commandPrefix(command: GameCommand): string | null {
  return command.type === 'move' || command.type === 'rotate-clockwise'
    ? fingerprint(command)
    : null;
}

function sameActive(left: PublicActivePiece | null, right: PublicActivePiece): boolean {
  return left !== null
    && left.x === right.x
    && left.y === right.y
    && left.rotation === right.rotation
    && fingerprint(left.token) === fingerprint(right.token);
}

function matchesExpectation(view: AiObservation, expected: RouteExpectation): boolean {
  return contextFingerprint(view) === expected.contextFingerprint
    && sameActive(view.self.active, expected.active);
}

function optimisticBoard(view: AiObservation): Board {
  return {
    cells: [
      ...Array<Cell | null>(BOARD_WIDTH * HIDDEN_ROWS).fill(null),
      ...view.self.board,
    ],
  };
}

function optimisticActive(active: PublicActivePiece): ActivePiece {
  return {
    token: { serial: 0, ...active.token },
    x: active.x,
    y: active.y + HIDDEN_ROWS,
    rotation: active.rotation,
  };
}

function expectedAfterCommand(
  view: AiObservation,
  command: GameCommand,
): RouteExpectation | null {
  const active = view.self.active;
  if (active === null) return null;

  if (command.type === 'move') {
    return {
      contextFingerprint: contextFingerprint(view),
      active: { ...active, token: { ...active.token }, x: active.x + command.dx },
      sourceFingerprint: placementFingerprint(view),
      failedPrefix: fingerprint(command),
    };
  }
  if (command.type === 'rotate-clockwise') {
    const rotated = tryRotateClockwise(optimisticBoard(view), optimisticActive(active));
    return {
      contextFingerprint: contextFingerprint(view),
      active: {
        token: { ...active.token },
        x: rotated.x,
        y: rotated.y - HIDDEN_ROWS,
        rotation: rotated.rotation,
      },
      sourceFingerprint: placementFingerprint(view),
      failedPrefix: fingerprint(command),
    };
  }
  return null;
}

export function createAiController(
  profile: AiFloorProfile,
  seed: number,
  side: SideId = 'opponent',
): AiController {
  let eligibleTicks = 0;
  let decisionIndex = 0;
  let route: GameCommand[] = [];
  let expectation: RouteExpectation | null = null;
  let failedFingerprint: string | null = null;
  const failedPrefixes = new Set<string>();

  return {
    side,
    update(view: AiObservation, tick: number): readonly TimedCommand[] {
      const currentFingerprint = placementFingerprint(view);
      if (failedFingerprint !== currentFingerprint) {
        failedFingerprint = currentFingerprint;
        failedPrefixes.clear();
      }
      if (expectation !== null && !matchesExpectation(view, expectation)) {
        if (expectation.sourceFingerprint === currentFingerprint) {
          failedPrefixes.add(expectation.failedPrefix);
        }
        route = [];
        expectation = null;
      }
      if (view.status !== 'playing' || view.self.phase !== 'active' || view.self.freezeTicks > 0) {
        return [];
      }
      eligibleTicks += 1;
      if (eligibleTicks < profile.reactionTicks) return [];
      eligibleTicks = 0;

      const itemCommand = planItemCommands(view, profile)[0];
      if (itemCommand !== undefined) {
        route = [];
        expectation = null;
        return [{ tick, side, command: itemCommand }];
      }

      if (route.length === 0) {
        const scored = scoreCandidates(view, profile);
        if (scored.length === 0) return [];
        const withoutFailedPrefixes = scored.filter((candidate) => {
          const first = candidate.commands[0];
          const prefix = first === undefined ? null : commandPrefix(first);
          return prefix === null || !failedPrefixes.has(prefix);
        });
        const directHardDrop = scored.find((candidate) =>
          candidate.commands.length === 1 && candidate.commands[0]?.type === 'hard-drop');
        const available = withoutFailedPrefixes.length > 0
          ? withoutFailedPrefixes
          : directHardDrop === undefined ? scored : [directHardDrop];
        const selected = selectCandidate(available, profile, () =>
          counterU32(seed, RandomStream.AI_MISTAKE, decisionIndex++) / 0x1_0000_0000);
        route = [...selected.commands];
      }

      const command = route.shift();
      if (command === undefined) return [];
      expectation = expectedAfterCommand(view, command);
      if (command.type === 'hard-drop') route = [];
      return [{ tick, side, command }];
    },
  };
}
