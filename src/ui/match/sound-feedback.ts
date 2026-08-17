import type { GameEvent, PublicMatchView } from '../../core';
import type {
  CueIntensity,
  SoundCue,
  SoundPlaybackOptions,
} from '../../platform/audio-port';

export interface SoundFeedback {
  readonly cue: SoundCue;
  readonly options: Required<SoundPlaybackOptions>;
}

function clampIntensity(value: number): CueIntensity {
  return Math.max(0, Math.min(3, Math.trunc(Number.isFinite(value) ? value : 0))) as CueIntensity;
}

function cueForEvent(event: GameEvent, view: PublicMatchView): SoundCue | null {
  if (event.type === 'piece-locked') return 'land';
  if (
    event.type === 'garbage-raised'
    && typeof event.amount === 'number'
    && event.amount > 0
  ) return 'land';
  if (event.type === 'lines-cleared') return 'clear';
  if (event.type === 'item-acquired' || event.type === 'item-used' || event.type === 'freeze-applied') return 'item';
  if (event.type !== 'match-ended') return null;
  if (view.status === 'player-won') return 'win';
  if (view.status === 'opponent-won') return 'loss';
  return null;
}

function intensityForEvent(event: GameEvent, view: PublicMatchView): CueIntensity {
  if (event.type === 'lines-cleared') {
    const amount = event.amount ?? 1;
    const combo = view.sides[event.side].combo;
    return clampIntensity(Math.max(amount - 1, combo - 1));
  }
  return 0;
}

export function attackSoundFeedback(amount: number): SoundFeedback {
  const intensity = clampIntensity(amount - 1);
  return {
    cue: 'attack',
    options: { intensity, duckMusic: intensity >= 2 },
  };
}

export function soundFeedbackForEvents(
  events: readonly GameEvent[],
  view: PublicMatchView,
): readonly SoundFeedback[] {
  const feedback = new Map<SoundCue, SoundFeedback>();
  for (const event of events) {
    const cue = cueForEvent(event, view);
    if (cue === null) continue;
    const intensity = intensityForEvent(event, view);
    const current = feedback.get(cue);
    if (current !== undefined && current.options.intensity >= intensity) continue;
    feedback.set(cue, {
      cue,
      options: {
        intensity,
        duckMusic: cue === 'clear' && intensity >= 2,
      },
    });
  }
  return [...feedback.values()];
}
