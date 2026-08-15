import { describe, expect, it } from 'vitest';
import type { AttackFeedbackPresentation } from '../ui/match/attack-feedback';
import { boardImpactOffset } from './attack-impact-geometry';

const playerRect = { x: 0, y: 40, width: 100, height: 200 };
const opponentRect = { x: 140, y: 40, width: 100, height: 200 };

const impactFeedback: AttackFeedbackPresentation = {
  amount: 4,
  combo: 2,
  comboLabel: '2 COMBO',
  displacementPx: 6,
  id: 'attack:12:0',
  intensity: 'strong',
  phase: 'impact',
  phaseProgress: 0.25,
  reducedMotion: false,
  source: 'player',
  target: 'opponent',
};

describe('board impact geometry', () => {
  it('stays still without a target impact presentation', () => {
    const launchFeedback = { ...impactFeedback, phase: 'launch' as const };

    expect(boardImpactOffset(null, 'opponent', playerRect, opponentRect))
      .toEqual({ x: 0, y: 0 });
    expect(boardImpactOffset(launchFeedback, 'opponent', playerRect, opponentRect))
      .toEqual({ x: 0, y: 0 });
    expect(boardImpactOffset(impactFeedback, 'player', playerRect, opponentRect))
      .toEqual({ x: 0, y: 0 });
  });

  it('nudges only the target in a deterministic bounded source-to-target direction', () => {
    const offset = boardImpactOffset(
      impactFeedback,
      'opponent',
      playerRect,
      opponentRect,
    );

    expect(offset.x).toBeCloseTo(4.5);
    expect(offset.y).toBeCloseTo(0);
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(6);
    expect(boardImpactOffset(impactFeedback, 'opponent', playerRect, opponentRect))
      .toEqual(offset);
  });

  it.each([
    { phaseProgress: -1, x: 0 },
    { phaseProgress: 1, x: 0 },
    { phaseProgress: 2, x: 0 },
  ])('clamps impact progress $phaseProgress before damping', ({ phaseProgress, x }) => {
    expect(boardImpactOffset(
      { ...impactFeedback, phaseProgress },
      'opponent',
      playerRect,
      opponentRect,
    ).x).toBeCloseTo(x);
  });

  it('returns zero when reduced-motion presentation supplies zero displacement', () => {
    expect(boardImpactOffset(
      { ...impactFeedback, displacementPx: 0, reducedMotion: true },
      'opponent',
      playerRect,
      opponentRect,
    )).toEqual({ x: 0, y: 0 });
  });
});
