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
  const onImpactRef = useRef(onImpact);
  const reducedMotionRef = useRef(reducedMotion);
  const runFrameRef = useRef<(timestamp: number) => void>(() => undefined);
  const [presentation, setPresentation] = useState<AttackFeedbackPresentation | null>(null);

  onImpactRef.current = onImpact;
  reducedMotionRef.current = reducedMotion;

  const requestNextFrame = () => {
    if (frame.current !== null || active.current === null) return;
    frame.current = requestAnimationFrame((timestamp) => {
      frame.current = null;
      runFrameRef.current(timestamp);
    });
  };

  runFrameRef.current = (timestamp) => {
    const current = active.current;
    if (current === null) return;

    const elapsed = Math.max(0, timestamp - current.startedAt);
    if (elapsed >= ATTACK_LAUNCH_MS && !impactedIds.current.has(current.cue.id)) {
      impactedIds.current.add(current.cue.id);
      onImpactRef.current?.(current.cue);
    }

    const nextPresentation = attackFeedbackAtElapsed(
      current.cue,
      elapsed,
      reducedMotionRef.current,
    );
    if (nextPresentation !== null) {
      setPresentation(nextPresentation);
      requestNextFrame();
      return;
    }

    const nextCue = pending.current.shift();
    if (nextCue === undefined) {
      active.current = null;
      setPresentation(null);
      return;
    }

    active.current = { cue: nextCue, startedAt: timestamp };
    setPresentation(attackFeedbackAtElapsed(nextCue, 0, reducedMotionRef.current));
    requestNextFrame();
  };

  useEffect(() => {
    for (const cue of attackFeedbackCuesForBatches(eventBatches)) {
      if (handledIds.current.has(cue.id)) continue;
      handledIds.current.add(cue.id);
      pending.current.push(cue);
    }

    if (active.current === null) {
      const nextCue = pending.current.shift();
      if (nextCue !== undefined) {
        active.current = { cue: nextCue, startedAt: performance.now() };
        setPresentation(attackFeedbackAtElapsed(nextCue, 0, reducedMotion));
      }
    } else {
      const elapsed = performance.now() - active.current.startedAt;
      const updated = attackFeedbackAtElapsed(active.current.cue, elapsed, reducedMotion);
      if (updated !== null) setPresentation(updated);
    }

    requestNextFrame();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [eventBatches, reducedMotion]);

  return presentation;
}
