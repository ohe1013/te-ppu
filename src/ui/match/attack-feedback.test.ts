import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type PublicMatchView,
  type SideId,
} from '../../core/index';
import type { GameEventBatch } from '../../app/use-match-loop';
import {
  attackFeedbackAtElapsed,
  attackFeedbackCuesForBatches,
} from './attack-feedback';

function viewAt(tick: number, comboFor: SideId = 'player', combo = 1): PublicMatchView {
  const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 29 }));
  return {
    ...view,
    tick,
    sides: {
      ...view.sides,
      [comboFor]: {
        ...view.sides[comboFor],
        combo,
      },
    },
  };
}

function batch(
  tick: number,
  side: SideId,
  amount: number | undefined,
  combo = 1,
  sequence = tick,
): GameEventBatch {
  return {
    sequence,
    tick,
    events: [{ type: 'attack-sent', side, amount }],
    view: viewAt(tick, side, combo),
  };
}

function cueFor(amount: number, combo: number) {
  const cue = attackFeedbackCuesForBatches([batch(8, 'player', amount, combo)])[0];
  if (cue === undefined) throw new Error('Expected one attack feedback cue');
  return cue;
}

describe('attack feedback', () => {
  it.each([
    { amount: 1, combo: 1, intensity: 'light', displacementPx: 2 },
    { amount: 2, combo: 1, intensity: 'medium', displacementPx: 4 },
    { amount: 1, combo: 2, intensity: 'medium', displacementPx: 4 },
    { amount: 4, combo: 1, intensity: 'strong', displacementPx: 6 },
    { amount: 1, combo: 3, intensity: 'strong', displacementPx: 6 },
  ] as const)('maps $amount attack and $combo combo to $intensity', (sample) => {
    const cue = cueFor(sample.amount, sample.combo);

    expect(cue.intensity).toBe(sample.intensity);
    expect(attackFeedbackAtElapsed(cue, 0, false)?.displacementPx)
      .toBe(sample.displacementPx);
  });

  it('preserves each sent net amount with its source, target, and owning snapshot combo', () => {
    const cues = attackFeedbackCuesForBatches([
      batch(10, 'player', 3, 2),
      batch(11, 'opponent', 1, 4),
    ]);

    expect(cues).toEqual([
      {
        id: 'attack:10:10:0',
        source: 'player',
        target: 'opponent',
        amount: 3,
        combo: 2,
        intensity: 'medium',
        comboLabel: '2 COMBO',
      },
      {
        id: 'attack:11:11:0',
        source: 'opponent',
        target: 'player',
        amount: 1,
        combo: 4,
        intensity: 'strong',
        comboLabel: '4 COMBO',
      },
    ]);
  });

  it('omits a combo label for a single-chain attack', () => {
    expect(cueFor(1, 1).comboLabel).toBeNull();
  });

  it('normalizes finite positive amounts and skips zero or invalid attacks', () => {
    const cues = attackFeedbackCuesForBatches([
      batch(1, 'player', 2.8),
      batch(2, 'player', 0),
      batch(3, 'player', -1),
      batch(4, 'player', Number.NaN),
      batch(5, 'player', Number.POSITIVE_INFINITY),
      batch(6, 'player', 0.9),
    ]);

    expect(cues).toEqual([
      expect.objectContaining({ amount: 2, id: 'attack:1:1:0' }),
    ]);
  });

  it('uses stable producer identity to order and distinguish matching-tick cues', () => {
    const cues = attackFeedbackCuesForBatches([
      batch(12, 'player', 1, 1, 73),
      batch(10, 'player', 1, 1, 72),
      batch(10, 'opponent', 1, 1, 71),
    ]);

    expect(cues.map((cue) => cue.id)).toEqual([
      'attack:10:71:0',
      'attack:10:72:0',
      'attack:12:73:0',
    ]);
    expect(cues.map((cue) => cue.source)).toEqual([
      'opponent',
      'player',
      'player',
    ]);
  });

  it('uses launch, tier impact, settle, then completion boundaries', () => {
    const cue = cueFor(2, 2);

    expect(attackFeedbackAtElapsed(cue, 149, false)?.phase).toBe('launch');
    expect(attackFeedbackAtElapsed(cue, 150, false)?.phase).toBe('impact');
    expect(attackFeedbackAtElapsed(cue, 299, false)?.phase).toBe('impact');
    expect(attackFeedbackAtElapsed(cue, 300, false)?.phase).toBe('settle');
    expect(attackFeedbackAtElapsed(cue, 400, false)).toBeNull();
  });

  it('clamps negative and non-finite elapsed time to the start of launch', () => {
    const cue = cueFor(1, 1);

    expect(attackFeedbackAtElapsed(cue, -1, false)).toMatchObject({
      phase: 'launch',
      phaseProgress: 0,
    });
    expect(attackFeedbackAtElapsed(cue, Number.NaN, false)).toMatchObject({
      phase: 'launch',
      phaseProgress: 0,
    });
    expect(attackFeedbackAtElapsed(cue, Number.POSITIVE_INFINITY, false)).toMatchObject({
      phase: 'launch',
      phaseProgress: 0,
    });
  });

  it('keeps phases but removes displacement for reduced motion', () => {
    const presentation = attackFeedbackAtElapsed(cueFor(5, 4), 151, true);

    expect(presentation).toMatchObject({
      phase: 'impact',
      displacementPx: 0,
      reducedMotion: true,
    });
  });
});
