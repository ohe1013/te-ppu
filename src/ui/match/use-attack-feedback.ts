import { useEffect, useRef, useState } from 'react';
import type { GameEventBatch } from '../../app/use-match-loop';
import {
  ATTACK_LAUNCH_MS,
  attackFeedbackAtElapsed,
  attackFeedbackCuesForBatches,
  type AttackFeedbackCue,
  type AttackFeedbackPresentation,
} from './attack-feedback';

export interface UseAttackFeedbackOptions {
  readonly eventBatches: readonly GameEventBatch[];
  readonly onImpact?: (cue: AttackFeedbackCue) => void;
  readonly reducedMotion: boolean;
}

interface ActiveAttackFeedback {
  readonly cue: AttackFeedbackCue;
  readonly startedAt: number;
}

export function useAttackFeedback({
  eventBatches,
  onImpact,
  reducedMotion,
}: UseAttackFeedbackOptions): AttackFeedbackPresentation | null {
  const handledIds = useRef(new Set<string>());
  const impactedIds = useRef(new Set<string>());
  const pending = useRef<AttackFeedbackCue[]>([]);
  const active = useRef<ActiveAttackFeedback | null>(null);
  const frame = useRef<number | null>(null);
  const effectGeneration = useRef(0);
  const onImpactRef = useRef(onImpact);
  const reducedMotionRef = useRef(reducedMotion);
  const runFrameRef = useRef<(timestamp: number, generation: number) => void>(
    () => undefined,
  );
  const [presentation, setPresentation] = useState<AttackFeedbackPresentation | null>(null);

  onImpactRef.current = onImpact;
  reducedMotionRef.current = reducedMotion;

  const isCurrentGeneration = (generation: number) => (
    effectGeneration.current === generation
  );

  const requestNextFrame = (generation: number) => {
    if (
      !isCurrentGeneration(generation)
      || frame.current !== null
      || active.current === null
    ) return;
    frame.current = requestAnimationFrame((timestamp) => {
      if (!isCurrentGeneration(generation)) return;
      frame.current = null;
      runFrameRef.current(timestamp, generation);
    });
  };

  runFrameRef.current = (timestamp, generation) => {
    if (!isCurrentGeneration(generation)) return;
    const current = active.current;
    if (current === null) return;

    const elapsed = Math.max(0, timestamp - current.startedAt);
    if (elapsed >= ATTACK_LAUNCH_MS && !impactedIds.current.has(current.cue.id)) {
      impactedIds.current.add(current.cue.id);
      onImpactRef.current?.(current.cue);
      if (!isCurrentGeneration(generation)) return;
    }

    const nextPresentation = attackFeedbackAtElapsed(
      current.cue,
      elapsed,
      reducedMotionRef.current,
    );
    if (nextPresentation !== null) {
      if (!isCurrentGeneration(generation)) return;
      setPresentation(nextPresentation);
      requestNextFrame(generation);
      return;
    }

    const nextCue = pending.current.shift();
    if (nextCue === undefined) {
      active.current = null;
      if (!isCurrentGeneration(generation)) return;
      setPresentation(null);
      return;
    }

    active.current = { cue: nextCue, startedAt: timestamp };
    if (!isCurrentGeneration(generation)) return;
    setPresentation(attackFeedbackAtElapsed(nextCue, 0, reducedMotionRef.current));
    requestNextFrame(generation);
  };

  useEffect(() => {
    const generation = effectGeneration.current + 1;
    effectGeneration.current = generation;

    for (const cue of attackFeedbackCuesForBatches(eventBatches)) {
      if (handledIds.current.has(cue.id)) continue;
      handledIds.current.add(cue.id);
      pending.current.push(cue);
    }

    if (active.current === null) {
      const nextCue = pending.current.shift();
      if (nextCue !== undefined) {
        active.current = { cue: nextCue, startedAt: performance.now() };
        if (isCurrentGeneration(generation)) {
          setPresentation(attackFeedbackAtElapsed(nextCue, 0, reducedMotion));
        }
      }
    } else {
      const elapsed = performance.now() - active.current.startedAt;
      const updated = attackFeedbackAtElapsed(active.current.cue, elapsed, reducedMotion);
      if (updated !== null && isCurrentGeneration(generation)) setPresentation(updated);
    }

    requestNextFrame(generation);
    return () => {
      if (effectGeneration.current === generation) {
        effectGeneration.current += 1;
      }
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [eventBatches, reducedMotion]);

  return presentation;
}
