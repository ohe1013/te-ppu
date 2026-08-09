import { describe, expect, it } from 'vitest';
import { computeAttackRibbon } from './attack-ribbon';

describe('attack ribbon geometry', () => {
  it('interpolates a wide central ribbon between board centers', () => {
    const ribbon = computeAttackRibbon(
      { x: 0, y: 0, width: 100, height: 200 },
      { x: 0, y: 240, width: 100, height: 200 },
      0.5,
    );

    expect(ribbon.x).toBe(50);
    expect(ribbon.y).toBe(220);
    expect(ribbon.length).toBeGreaterThanOrEqual(24);
    expect(ribbon.angle).toBeCloseTo(Math.PI / 2);
  });

  it.each([-1, 2, Number.NaN])('clamps invalid progress %s to the launch path', (progress) => {
    const ribbon = computeAttackRibbon(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 },
      progress,
    );

    expect(ribbon.x).toBe(progress === 2 ? 250 : 50);
    expect(ribbon.y).toBe(50);
  });
});
