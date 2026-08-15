import type { GameEventBatch } from '../../app/use-match-loop';
import type { SideId } from '../../core/index';

export type AttackIntensity = 'light' | 'medium' | 'strong';
export type AttackFeedbackPhase = 'launch' | 'impact' | 'settle';

export interface AttackFeedbackCue {
  readonly id: string;
  readonly source: SideId;
  readonly target: SideId;
  readonly amount: number;
  readonly combo: number;
  readonly intensity: AttackIntensity;
  readonly comboLabel: string | null;
}

export interface AttackFeedbackPresentation extends AttackFeedbackCue {
  readonly phase: AttackFeedbackPhase;
  readonly phaseProgress: number;
  readonly displacementPx: 0 | 2 | 4 | 6;
  readonly reducedMotion: boolean;
}

export const ATTACK_LAUNCH_MS = 150;
export const ATTACK_SETTLE_MS = 100;

const IMPACT_MS: Readonly<Record<AttackIntensity, number>> = {
  light: 120,
  medium: 150,
  strong: 180,
};

const DISPLACEMENT_PX: Readonly<Record<AttackIntensity, 2 | 4 | 6>> = {
  light: 2,
  medium: 4,
  strong: 6,
};

function intensityFor(amount: number, combo: number): AttackIntensity {
  if (amount >= 4 || combo >= 3) return 'strong';
  if (amount >= 2 || combo >= 2) return 'medium';
  return 'light';
}

function positiveInteger(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const amount = Math.trunc(value);
  return amount > 0 ? amount : null;
}

function otherSide(side: SideId): SideId {
  return side === 'player' ? 'opponent' : 'player';
}

function comboLabelFor(combo: number): string | null {
  return combo >= 2 ? `${combo} COMBO` : null;
}

export function attackFeedbackCuesForBatches(
  batches: readonly GameEventBatch[],
): readonly AttackFeedbackCue[] {
  const orderedBatches = batches
    .map((batch, index) => ({ batch, index }))
    .sort((left, right) => left.batch.tick - right.batch.tick || left.index - right.index);
  const cues: AttackFeedbackCue[] = [];

  for (const { batch } of orderedBatches) {
    batch.events.forEach((event, eventIndex) => {
      if (event.type !== 'attack-sent') return;
      const amount = positiveInteger(event.amount);
      if (amount === null) return;

      const combo = batch.view.sides[event.side].combo;
      cues.push({
        id: `attack:${batch.tick}:${eventIndex}`,
        source: event.side,
        target: otherSide(event.side),
        amount,
        combo,
        intensity: intensityFor(amount, combo),
        comboLabel: comboLabelFor(combo),
      });
    });
  }

  return cues;
}

function presentation(
  cue: AttackFeedbackCue,
  phase: AttackFeedbackPhase,
  phaseProgress: number,
  reducedMotion: boolean,
): AttackFeedbackPresentation {
  return {
    ...cue,
    phase,
    phaseProgress,
    displacementPx: reducedMotion ? 0 : DISPLACEMENT_PX[cue.intensity],
    reducedMotion,
  };
}

export function attackFeedbackAtElapsed(
  cue: AttackFeedbackCue,
  elapsedMs: number,
  reducedMotion: boolean,
): AttackFeedbackPresentation | null {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const impactMs = IMPACT_MS[cue.intensity];
  const impactEnd = ATTACK_LAUNCH_MS + impactMs;
  const total = impactEnd + ATTACK_SETTLE_MS;
  if (elapsed >= total) return null;
  if (elapsed < ATTACK_LAUNCH_MS) {
    return presentation(cue, 'launch', elapsed / ATTACK_LAUNCH_MS, reducedMotion);
  }
  if (elapsed < impactEnd) {
    return presentation(cue, 'impact', (elapsed - ATTACK_LAUNCH_MS) / impactMs, reducedMotion);
  }
  return presentation(cue, 'settle', (elapsed - impactEnd) / ATTACK_SETTLE_MS, reducedMotion);
}
