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
  type TimedCommand,
} from '../core/index';
import type { MatchResult } from './app-route';

const STEP_MS = 1000 / 60;
const STEP_EPSILON_MS = 0.000_001;
const MAX_STEPS_PER_FRAME = 8;

export type PauseReason = 'background' | 'exit-confirmation';

export interface MatchLoopView {
  readonly view: PublicMatchView;
  readonly events: readonly GameEvent[];
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
  readonly onFinished: (result: MatchResult) => void | Promise<void>;
}

interface PublishedMatch {
  readonly view: PublicMatchView;
  readonly events: readonly GameEvent[];
}

interface AdvancedTick extends PublishedMatch {
  readonly result: MatchResult | null;
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
  onEvents,
  onFinished,
}: UseMatchLoopOptions): MatchLoopView {
  const stateRef = useRef<MatchState | null>(null);
  if (stateRef.current === null) stateRef.current = createMatch(config);

  const [published, setPublished] = useState<PublishedMatch>(() => ({
    events: [],
    view: createPublicMatchView(stateRef.current!),
  }));
  const aiRef = useRef(ai);
  const onEventsRef = useRef(onEvents);
  const onFinishedRef = useRef(onFinished);
  const commandQueueRef = useRef<TimedCommand[]>([]);
  const pauseReasonsRef = useRef(new Set<PauseReason>());
  const accumulatorRef = useRef(0);
  const previousTimestampRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);

  aiRef.current = ai;
  onEventsRef.current = onEvents;
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
      const tick = createPublicMatchView(state).tick + 1;
      const observation = createAiObservation(state, 'opponent');
      const aiCommands = aiRef.current.update(observation, tick);
      const playerCommands = drainCommandsForTick(tick);
      const step: MatchStep = stepMatch(state, [...playerCommands, ...aiCommands]);
      stateRef.current = step.state;
      const view = createPublicMatchView(step.state);

      const result = resultFor(view.status);
      let completion: MatchResult | null = null;
      if (result !== null) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          completion = result;
        }
        runningRef.current = false;
        commandQueueRef.current = [];
        accumulatorRef.current = 0;
        previousTimestampRef.current = null;
      }
      return { view, events: step.events, result: completion };
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
      let terminalResult: MatchResult | null = null;
      const frameEvents: GameEvent[] = [];
      while (
        accumulatorRef.current + STEP_EPSILON_MS >= STEP_MS
        && steps < MAX_STEPS_PER_FRAME
        && runningRef.current
      ) {
        accumulatorRef.current = Math.max(0, accumulatorRef.current - STEP_MS);
        const advanced = advanceOneTick();
        latestView = advanced.view;
        frameEvents.push(...advanced.events);
        terminalResult = advanced.result;
        steps += 1;
      }
      if (latestView !== null) {
        setPublished({ view: latestView, events: frameEvents });
        if (frameEvents.length > 0) {
          try {
            onEventsRef.current?.(frameEvents, latestView);
          } catch {
            // Optional presentation feedback cannot own the match clock.
          }
        }
      }
      if (terminalResult !== null) void onFinishedRef.current(terminalResult);
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
    events: published.events,
    dispatch,
    setPaused,
    stop,
  };
}
