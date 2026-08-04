import { describe, expect, it } from 'vitest';
import {
  BATTLE_ANIMATIONS,
  BATTLE_EFFECT_LIFETIMES,
  battleAnimationDurationMs,
  battleAnimationFrameNames,
} from './battle-animation-registry';

describe('battle animation registry', () => {
  it('defines the exact authored atlas policies', () => {
    expect(BATTLE_ANIMATIONS['move-dust']).toEqual({
      frames: 4, fps: 20, loop: false, sourceSize: [64, 64], anchor: [.5, 1],
    });
    expect(BATTLE_ANIMATIONS['freeze-overlay']).toEqual({
      frames: 8, fps: 12, loop: true, sourceSize: [64, 64], anchor: [0, 0],
    });
    expect(BATTLE_EFFECT_LIFETIMES['attack-shot']).toEqual({ kind: 'fixed', durationMs: 300 });
    expect(BATTLE_EFFECT_LIFETIMES['freeze-overlay']).toEqual({ kind: 'state', field: 'freezeTicks' });
  });

  it('uses zero-padded authored frame names and derives non-loop duration from fps', () => {
    expect(battleAnimationFrameNames('move-dust')).toEqual([
      'move-dust/00.png', 'move-dust/01.png', 'move-dust/02.png', 'move-dust/03.png',
    ]);
    expect(battleAnimationDurationMs('line-clear')).toBe(200);
  });
});
