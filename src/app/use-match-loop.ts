import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { AiController } from '../ai/index';
import {
  createAiObservation,
  createMatch,
  createPublicMatchView,
  stepMatch,
  type GameCommand,
  type GameEvent,
  type MatchConfig,
  type MatchState,
  type MatchStep,
  type PublicMatchView,
  type SideId,
  type TimedCommand,
} from '../core/index';
import type { MatchOutcome, MatchResult } from './app-route';

const STEP_MS = 1000 / 60;
const STEP_EPSILON_MS = 0.000_001;
const MAX_STEPS_PER_FRAME = 8;

export type PauseReason = 'background' | 'exit-confirmation';

export interface GameEventBatch {
  readonly sequence: number;
  readonly tick: number;
  readonly events: readonly GameEvent[];
  readonly view: PublicMatchView;
}

export interface CommandFeedback {
  readonly sequence: number;
  readonly tick: number;
  readonly side: SideId;
  readonly command: GameCommand;
}

const commandFeedbackViews = new WeakMap<
  readonly CommandFeedback[],
  ReadonlyMap<number, PublicMatchView>
>();

export function commandFeedbackViewFor(
  feedback: readonly CommandFeedback[],
  entry: CommandFeedback,
): PublicMatchView | undefined {
  return commandFeedbackViews.get(feedback)?.get(entry.sequence);
}

export interface MatchLoopView {
  readonly view: PublicMatchView;
  readonly eventBatches: readonly GameEventBatch[];
  readonly events: readonly GameEvent[];
  readonly commandFeedback: readonly CommandFeedback[];
  dispatch(command: GameCommand): void;
  setPaused(reason: PauseReason, paused: boolean): void;
  stop(): void;
}

export interface UseMatchLoopOptions {
  readonly ai: AiController;
  readonly config: MatchConfig;
  readonly onEvents?: (
    events: readonly GameEvent[],
    view: PublicMatchView,
  ) => void;
  readonly onEventBatches?: (batches: readonly GameEventBatch[]) => void;
  readonly onCommandFeedback?: (feedback: CommandFeedback) => void;
  readonly onFinished: (outcome: MatchOutcome) => void | Promise<void>;
}

interface PublishedMatch {
  readonly view: PublicMatchView;
  readonly eventBatches: readonly GameEventBatch[];
  readonly events: readonly GameEvent[];
  readonly commandFeedback: readonly CommandFeedback[];
}

interface AdvancedTick {
  readonly view: PublicMatchView;
  readonly eventBatch: GameEventBatch | null;
  readonly events: readonly GameEvent[];
  readonly commandFeedback: readonly CommandFeedback[];
  readonly commandFeedbackView: PublicMatchView;
  readonly outcome: MatchOutcome | null;
}

function resultFor(status: PublicMatchView['status']): MatchResult | null {
  if (status === 'player-won') return 'win';
  if (status === 'opponent-won') return 'loss';
  if (status === 'draw') return 'draw';
  return null;
}

export function useMatchLoop({
  ai,
  config,
  onEventBatches,
  onCommandFeedback,
  onEvents,
  onFinished,
}: UseMatchLoopOptions): MatchLoopView {
  const stateRef = useRef<MatchState | null>(null);
  const initialCountdownTicksRef = useRef<number | null>(null);
  if (stateRef.current === null) {
    stateRef.current = createMatch(config);
    initialCountdownTicksRef.current = stateRef.current.countdownTicks;
  }

  const [published, setPublished] = useState<PublishedMatch>(() => ({
    eventBatches: [],
    events: [],
    commandFeedback: [],
    view: createPublicMatchView(stateRef.current!),
  }));
  const aiRef = useRef(ai);
  const onEventBatchesRef = useRef(onEventBatches);
  const onEventsRef = useRef(onEvents);
  const onCommandFeedbackRef = useRef(onCommandFeedback);
  const onFinishedRef = useRef(onFinished);
  const commandQueueRef = useRef<TimedCommand[]>([]);
  const pauseReasonsRef = useRef(new Set<PauseReason>());
  const accumulatorRef = useRef(0);
  const previousTimestampRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const commandSequenceRef = useRef(0);
  const eventBatchSequenceRef = useRef(0);

  aiRef.current = ai;
  onEventBatchesRef.current = onEventBatches;
  onEventsRef.current = onEvents;
  onCommandFeedbackRef.current = onCommandFeedback;
  onFinishedRef.current = onFinished;

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    commandQueueRef.current = [];
    accumulatorRef.current = 0;
    previousTimestampRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const dispatch = useCallback((command: GameCommand) => {
    if (!runningRef.current) return;
    commandQueueRef.current.push({
      tick: stateRef.current!.tick + 1,
      side: 'player',
      command,
    });
  }, []);

  const setPaused = useCallback((reason: PauseReason, paused: boolean) => {
    if (!runningRef.current) return;
    const reasons = pauseReasonsRef.current;
    const changed = paused ? !reasons.has(reason) : reasons.has(reason);
    if (!changed) return;
    if (paused) reasons.add(reason);
    else reasons.delete(reason);
    previousTimestampRef.current = null;
  }, []);

  useEffect(() => {
    runningRef.current = true;

    function drainCommandsForTick(tick: number): readonly TimedCommand[] {
      const ready: TimedCommand[] = [];
      const waiting: TimedCommand[] = [];
      for (const timed of commandQueueRef.current) {
        if (timed.tick === tick) ready.push(timed);
        else if (timed.tick > tick) waiting.push(timed);
      }
      commandQueueRef.current = waiting;
      return ready;
    }

    function advanceOneTick(): AdvancedTick {
      const state = stateRef.current!;
      const commandFeedbackView = createPublicMatchView(state);
      const tick = commandFeedbackView.tick + 1;
      const observation = createAiObservation(state, 'opponent');
      const aiCommands = aiRef.current.update(observation, tick);
      const playerCommands = drainCommandsForTick(tick);
      const scheduled = [...playerCommands, ...aiCommands];
      const commandFeedback = scheduled.map((timed) => ({
        command: timed.command,
        sequence: commandSequenceRef.current++,
        side: timed.side,
        tick: timed.tick,
      } satisfies CommandFeedback));
      for (const feedback of commandFeedback) {
        try {
          onCommandFeedbackRef.current?.(feedback);
        } catch {
          // Command feedback is presentation-only and cannot own the clock.
        }
      }
      const step: MatchStep = stepMatch(state, scheduled);
      stateRef.current = step.state;
      const view = createPublicMatchView(step.state);
      const eventBatch = step.events.length === 0 ? null : {
        events: step.events,
        sequence: eventBatchSequenceRef.current++,
        tick: view.tick,
        view,
      } satisfies GameEventBatch;

      const result = resultFor(view.status);
      let completion: MatchOutcome | null = null;
      if (result !== null) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          completion = {
            result,
            durationTicks: Math.max(
              0,
              view.tick - (initialCountdownTicksRef.current ?? 0),
            ),
          };
        }
        runningRef.current = false;
        commandQueueRef.current = [];
        accumulatorRef.current = 0;
        previousTimestampRef.current = null;
      }
      return {
        commandFeedback,
        commandFeedbackView,
        view,
        eventBatch,
        events: step.events,
        outcome: completion,
      };
    }

    function scheduleNextFrame(): void {
      if (runningRef.current) frameRef.current = requestAnimationFrame(runFrame);
    }

    function runFrame(timestamp: number): void {
      frameRef.current = null;
      if (!runningRef.current) return;

      if (pauseReasonsRef.current.size > 0) {
        previousTimestampRef.current = null;
        scheduleNextFrame();
        return;
      }

      const previousTimestamp = previousTimestampRef.current;
      previousTimestampRef.current = timestamp;
      if (previousTimestamp === null) {
        scheduleNextFrame();
        return;
      }

      accumulatorRef.current += Math.max(0, timestamp - previousTimestamp);
      let steps = 0;
      let latestView: PublicMatchView | null = null;
      let terminalOutcome: MatchOutcome | null = null;
      const frameEvents: GameEvent[] = [];
      const frameEventBatches: GameEventBatch[] = [];
      const frameCommandFeedback: CommandFeedback[] = [];
      const frameCommandFeedbackViews = new Map<number, PublicMatchView>();
      while (
        accumulatorRef.current + STEP_EPSILON_MS >= STEP_MS
        && steps < MAX_STEPS_PER_FRAME
        && runningRef.current
      ) {
        accumulatorRef.current = Math.max(0, accumulatorRef.current - STEP_MS);
        const advanced = advanceOneTick();
        latestView = advanced.view;
        frameCommandFeedback.push(...advanced.commandFeedback);
        for (const feedback of advanced.commandFeedback) {
          frameCommandFeedbackViews.set(feedback.sequence, advanced.commandFeedbackView);
        }
        frameEvents.push(...advanced.events);
        if (advanced.eventBatch !== null) frameEventBatches.push(advanced.eventBatch);
        terminalOutcome = advanced.outcome;
        steps += 1;
      }
      if (latestView !== null) {
        setPublished({
          eventBatches: frameEventBatches,
          view: latestView,
          events: frameEvents,
          commandFeedback: frameCommandFeedback,
        });
        commandFeedbackViews.set(frameCommandFeedback, frameCommandFeedbackViews);
        if (frameEvents.length > 0) {
          try {
            onEventsRef.current?.(frameEvents, latestView);
          } catch {
            // Optional presentation feedback cannot own the match clock.
          }
        }
        if (frameEventBatches.length > 0) {
          try {
            onEventBatchesRef.current?.(frameEventBatches);
          } catch {
            // Optional presentation feedback cannot own the match clock.
          }
        }
      }
      if (terminalOutcome !== null) void onFinishedRef.current(terminalOutcome);
      scheduleNextFrame();
    }

    scheduleNextFrame();
    return () => {
      runningRef.current = false;
      commandQueueRef.current = [];
      pauseReasonsRef.current.clear();
      accumulatorRef.current = 0;
      previousTimestampRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  return {
    view: published.view,
    eventBatches: published.eventBatches,
    events: published.events,
    commandFeedback: published.commandFeedback,
    dispatch,
    setPaused,
    stop,
  };
}
