import { describe, expect, it } from 'vitest';
import {
  BOARD_WIDTH,
  createAiObservation,
  createMatch,
  stepMatch,
  type MatchState,
  type TimedCommand,
} from '../../src/core/index';
import { createAiController } from '../../src/ai/index';
import { AI_FLOOR_PROFILES } from '../../src/ai/profiles';

describe('AI controller', () => {
  it('creates an opponent controller by default', () => {
    expect(createAiController(AI_FLOOR_PROFILES[0]!, 11).side).toBe('opponent');
  });

  it('preempts and discards a placement route for an item, then replans after execution', () => {
    const profile = { ...AI_FLOOR_PROFILES[0]!, reactionTicks: 12 as const };
    const ai = createAiController(profile, 11);
    const base = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const firstReaction = Array.from({ length: 12 }, (_, index) => ai.update(base, index + 1))
      .flat();
    const boardWithBottomCell = [...base.self.board];
    boardWithBottomCell[19 * BOARD_WIDTH] = { kind: 'J' };
    const acquired = {
      ...base,
      self: {
        ...base.self,
        board: boardWithBottomCell,
        active: { ...base.self.active!, x: 4 },
        inventory: { ...base.self.inventory, rowClear: 1 },
      },
    };
    const itemReaction = Array.from(
      { length: 12 },
      (_, index) => ai.update(acquired, index + 13),
    ).flat();
    const afterExecution = {
      ...acquired,
      self: {
        ...acquired.self,
        board: base.self.board,
        inventory: { ...acquired.self.inventory, rowClear: 0 },
      },
    };
    const nextReaction = Array.from(
      { length: 12 },
      (_, index) => ai.update(afterExecution, index + 25),
    ).flat();

    expect(firstReaction).toEqual([
      { tick: 12, side: 'opponent', command: { type: 'move', dx: 1 } },
    ]);
    expect(itemReaction).toEqual([
      { tick: 24, side: 'opponent', command: { type: 'use-row-clear', row: 19 } },
    ]);
    expect(nextReaction).toEqual([
      { tick: 36, side: 'opponent', command: { type: 'move', dx: -1 } },
    ]);
  });

  it.each(AI_FLOOR_PROFILES)(
    'emits at most one placement command on exact floor $floor reaction ticks',
    (profile) => {
      const ai = createAiController(profile, 11);
      const view = createAiObservation(
        createMatch({ matchSeed: 7, countdownTicks: 0 }),
        'opponent',
      );
      const outputs = Array.from(
        { length: profile.reactionTicks * 2 },
        (_, index) => ai.update(view, index + 1),
      );

      expect(outputs.filter((commands) => commands.length > 0).map(([command]) => command!.tick))
        .toEqual([profile.reactionTicks, profile.reactionTicks * 2]);
      expect(outputs.every((commands) => commands.length <= 1)).toBe(true);
      expect(outputs.flat().every(({ command }) =>
        ['move', 'rotate-clockwise', 'hard-drop'].includes(command.type))).toBe(true);
    },
  );

  it('pauses the eligible reaction clock while frozen, inactive, or outside play', () => {
    const profile = AI_FLOOR_PROFILES[0]!;
    const ai = createAiController(profile, 11);
    const playing = createAiObservation(
      createMatch({ matchSeed: 7, countdownTicks: 0 }),
      'opponent',
    );
    const frozen = { ...playing, self: { ...playing.self, freezeTicks: 9 } };
    const inactive = { ...playing, self: { ...playing.self, phase: 'offset' as const } };
    const countdown = { ...playing, status: 'countdown' as const };

    for (let tick = 1; tick < profile.reactionTicks; tick += 1) {
      expect(ai.update(playing, tick)).toEqual([]);
    }
    for (let tick = 48; tick <= 287; tick += 1) expect(ai.update(frozen, tick)).toEqual([]);
    expect(ai.update(inactive, 288)).toEqual([]);
    expect(ai.update(countdown, 289)).toEqual([]);

    expect(ai.update(playing, 290)).toEqual([
      expect.objectContaining({ tick: 290, side: 'opponent' }),
    ]);
  });

  it('excludes a hidden-row rejected prefix and makes deterministic bounded progress', () => {
    const run = () => {
      let state = createMatch({ matchSeed: 9, countdownTicks: 0 });
      const cells = [...state.sides.opponent.board.cells];
      cells[2 * BOARD_WIDTH + 6] = { kind: 'J' };
      state = {
        ...state,
        sides: {
          ...state.sides,
          opponent: { ...state.sides.opponent, board: { cells } },
        },
      } satisfies MatchState;
      const ai = createAiController(AI_FLOOR_PROFILES[2]!, 11);
      const emitted: TimedCommand[] = [];
      let lockedAt: number | null = null;

      for (let tick = 1; tick <= 240; tick += 1) {
        const observation = createAiObservation(state, 'opponent');
        expect(observation.self.board.every((cell) => cell === null)).toBe(true);
        const commands = ai.update(observation, tick);
        emitted.push(...commands);
        const step = stepMatch(state, commands);
        state = step.state;
        if (step.events.some((event) => event.type === 'piece-locked' && event.side === 'opponent')) {
          lockedAt = tick;
          break;
        }
      }
      return { emitted, lockedAt };
    };

    const first = run();
    const second = run();
    expect(first).toEqual(second);
    expect(first.emitted[0]).toEqual({
      tick: 12,
      side: 'opponent',
      command: { type: 'move', dx: 1 },
    });
    expect(first.emitted[1]?.tick).toBe(24);
    expect(first.emitted[1]?.command).not.toEqual({ type: 'move', dx: 1 });
    expect(first.lockedAt).not.toBeNull();
    expect(first.lockedAt!).toBeLessThanOrEqual(240);
  });

  it('uses one deterministic mistake draw for each actual replan', () => {
    let state = createMatch({ matchSeed: 9, countdownTicks: 0 });
    const cells = [...state.sides.opponent.board.cells];
    cells[2 * BOARD_WIDTH + 6] = { kind: 'J' };
    state = {
      ...state,
      sides: {
        ...state.sides,
        opponent: { ...state.sides.opponent, board: { cells } },
      },
    } satisfies MatchState;
    const profile = { ...AI_FLOOR_PROFILES[0]!, reactionTicks: 12 as const };
    const ai = createAiController(profile, 3);
    const emitted: TimedCommand[] = [];

    for (let tick = 1; tick <= 24; tick += 1) {
      const commands = ai.update(createAiObservation(state, 'opponent'), tick);
      emitted.push(...commands);
      state = stepMatch(state, commands).state;
    }

    expect(emitted).toEqual([
      { tick: 12, side: 'opponent', command: { type: 'move', dx: 1 } },
      // For seed 3, draw index 1 selects rotation; skipping to index 2 selects move-left.
      { tick: 24, side: 'opponent', command: { type: 'rotate-clockwise' } },
    ]);
  });

  it('falls back to direct hard drop after every movement prefix is rejected', () => {
    const view = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const ai = createAiController(AI_FLOOR_PROFILES[2]!, 11);
    const emitted: TimedCommand[] = [];

    for (let tick = 1; tick <= 60; tick += 1) {
      const output = ai.update(view, tick);
      emitted.push(...output);
      if (output[0]?.command.type === 'hard-drop') break;
    }

    expect(emitted.at(-1)?.command).toEqual({ type: 'hard-drop' });
    const movementKeys = emitted
      .filter(({ command }) => command.type !== 'hard-drop')
      .map(({ command }) => JSON.stringify(command));
    expect(new Set(movementKeys).size).toBe(movementKeys.length);
    expect(emitted.map(({ tick }) => tick)).toEqual(
      emitted.map((_, index) => (index + 1) * AI_FLOOR_PROFILES[2]!.reactionTicks),
    );
  });

  it('invalidates a validated route when gravity changes the active piece between reactions', () => {
    const profile = AI_FLOOR_PROFILES[0]!;
    const ai = createAiController(profile, 11);
    const base = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const moved = {
      ...base,
      self: { ...base.self, active: { ...base.self.active!, x: 4 } },
    };
    const afterGravity = {
      ...moved,
      self: { ...moved.self, active: { ...moved.self.active!, y: -1 } },
    };
    const emitted = [];

    for (let tick = 1; tick <= 48; tick += 1) emitted.push(...ai.update(base, tick));
    for (let tick = 49; tick <= 70; tick += 1) emitted.push(...ai.update(moved, tick));
    for (let tick = 71; tick <= 96; tick += 1) emitted.push(...ai.update(afterGravity, tick));

    expect(emitted).toEqual([
      { tick: 48, side: 'opponent', command: { type: 'move', dx: 1 } },
      { tick: 96, side: 'opponent', command: { type: 'move', dx: -1 } },
    ]);
  });

  it('replans when the sanitized inventory fingerprint changes', () => {
    const ai = createAiController(AI_FLOOR_PROFILES[0]!, 11);
    const base = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const moved = {
      ...base,
      self: { ...base.self, active: { ...base.self.active!, x: 4 } },
    };
    const inventoryChanged = {
      ...moved,
      self: {
        ...moved.self,
        inventory: { ...moved.self.inventory, rowClear: 1 },
      },
    };
    const emitted = [];

    for (let tick = 1; tick <= 48; tick += 1) emitted.push(...ai.update(base, tick));
    for (let tick = 49; tick <= 70; tick += 1) emitted.push(...ai.update(moved, tick));
    for (let tick = 71; tick <= 96; tick += 1) emitted.push(...ai.update(inventoryChanged, tick));

    expect(emitted).toEqual([
      { tick: 48, side: 'opponent', command: { type: 'move', dx: 1 } },
      { tick: 96, side: 'opponent', command: { type: 'move', dx: -1 } },
    ]);
  });

  it('clears the route on a phase divergence without consuming paused ticks', () => {
    const ai = createAiController(AI_FLOOR_PROFILES[0]!, 11);
    const base = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const moved = {
      ...base,
      self: { ...base.self, active: { ...base.self.active!, x: 4 } },
    };
    const inactive = {
      ...moved,
      self: { ...moved.self, phase: 'offset' as const },
    };
    const emitted = [];

    for (let tick = 1; tick <= 48; tick += 1) emitted.push(...ai.update(base, tick));
    for (let tick = 49; tick <= 70; tick += 1) emitted.push(...ai.update(moved, tick));
    for (let tick = 71; tick <= 75; tick += 1) emitted.push(...ai.update(inactive, tick));
    for (let tick = 76; tick <= 101; tick += 1) emitted.push(...ai.update(moved, tick));

    expect(emitted).toEqual([
      { tick: 48, side: 'opponent', command: { type: 'move', dx: 1 } },
      { tick: 101, side: 'opponent', command: { type: 'move', dx: -1 } },
    ]);
  });

  it('replans when garbage changes the sanitized board fingerprint', () => {
    const ai = createAiController(AI_FLOOR_PROFILES[0]!, 11);
    const base = createAiObservation(
      createMatch({ matchSeed: 9, countdownTicks: 0 }),
      'opponent',
    );
    const moved = {
      ...base,
      self: { ...base.self, active: { ...base.self.active!, x: 4 } },
    };
    const board = [...moved.self.board];
    board[board.length - 1] = { kind: 'J' as const };
    const garbageChanged = {
      ...moved,
      self: { ...moved.self, board },
    };
    const emitted = [];

    for (let tick = 1; tick <= 48; tick += 1) emitted.push(...ai.update(base, tick));
    for (let tick = 49; tick <= 70; tick += 1) emitted.push(...ai.update(moved, tick));
    for (let tick = 71; tick <= 96; tick += 1) emitted.push(...ai.update(garbageChanged, tick));

    expect(emitted).toEqual([
      { tick: 48, side: 'opponent', command: { type: 'move', dx: 1 } },
      { tick: 96, side: 'opponent', command: { type: 'move', dx: -1 } },
    ]);
  });

  it.each(AI_FLOOR_PROFILES)(
    'replays floor $floor deterministically through core without mutating observations',
    (profile) => {
      const run = (): { readonly commands: readonly TimedCommand[]; readonly state: MatchState } => {
        const ai = createAiController(profile, 29);
        let state = createMatch({ matchSeed: 17, countdownTicks: 0 });
        const commands: TimedCommand[] = [];

        for (let tick = 1; tick <= profile.reactionTicks * 2; tick += 1) {
          const observation = createAiObservation(state, 'opponent');
          const before = JSON.stringify(observation);
          const output = ai.update(observation, tick);
          expect(JSON.stringify(observation)).toBe(before);
          expect(output.length).toBeLessThanOrEqual(1);
          expect(output.every(({ command }) =>
            ['move', 'rotate-clockwise', 'hard-drop'].includes(command.type))).toBe(true);
          commands.push(...output);
          state = stepMatch(state, output).state;
          expect(state.tick).toBe(tick);
        }
        return { commands, state };
      };

      const first = run();
      const second = run();
      expect(first).toEqual(second);
      expect(first.commands.map(({ tick }) => tick)).toEqual([
        profile.reactionTicks,
        profile.reactionTicks * 2,
      ]);
    },
  );
});
