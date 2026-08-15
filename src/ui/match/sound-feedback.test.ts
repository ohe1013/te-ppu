import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type GameEvent,
  type PublicMatchView,
} from '../../core';
import { attackSoundFeedback, soundFeedbackForEvents } from './sound-feedback';

function viewWithPlayerCombo(combo: number, status: PublicMatchView['status'] = 'playing') {
  const base = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 41 }));
  return {
    ...base,
    status,
    sides: {
      ...base.sides,
      player: { ...base.sides.player, combo },
    },
  } satisfies PublicMatchView;
}

describe('soundFeedbackForEvents', () => {
  it('keeps first cue order, deduplicates by strongest intensity, and ducks only strong clears', () => {
    const events: GameEvent[] = [
      { type: 'lines-cleared', side: 'player', amount: 2 },
      { type: 'item-used', side: 'player', item: 'freeze' },
      { type: 'lines-cleared', side: 'opponent', amount: 4 },
      { type: 'attack-sent', side: 'player', amount: 4 },
      { type: 'garbage-raised', side: 'player', amount: 4 },
      { type: 'piece-locked', side: 'player' },
    ];

    expect(soundFeedbackForEvents(events, viewWithPlayerCombo(3))).toEqual([
      { cue: 'clear', options: { intensity: 3, duckMusic: true } },
      { cue: 'item', options: { intensity: 0, duckMusic: false } },
      { cue: 'land', options: { intensity: 0, duckMusic: false } },
    ]);
  });

  it('leaves attack sound to the impact timeline', () => {
    expect(soundFeedbackForEvents([
      { type: 'attack-sent', side: 'player', amount: 4 },
    ], viewWithPlayerCombo(3))).toEqual([]);
  });

  it('plays one landing cue for each positive garbage batch regardless of row count', () => {
    expect(soundFeedbackForEvents([
      { type: 'garbage-raised', side: 'player', amount: 1 },
    ], viewWithPlayerCombo(0))).toEqual([
      { cue: 'land', options: { intensity: 0, duckMusic: false } },
    ]);
    expect(soundFeedbackForEvents([
      { type: 'garbage-raised', side: 'player', amount: 4 },
    ], viewWithPlayerCombo(0))).toEqual([
      { cue: 'land', options: { intensity: 0, duckMusic: false } },
    ]);
    expect(soundFeedbackForEvents([
      { type: 'garbage-landed', side: 'player', amount: 4 },
    ], viewWithPlayerCombo(0))).toEqual([]);
  });

  it('maps terminal status without inventing a cue for a draw', () => {
    const ended: GameEvent[] = [{ type: 'match-ended', side: 'player' }];
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'player-won')))
      .toEqual([{ cue: 'win', options: { intensity: 0, duckMusic: false } }]);
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'opponent-won')))
      .toEqual([{ cue: 'loss', options: { intensity: 0, duckMusic: false } }]);
    expect(soundFeedbackForEvents(ended, viewWithPlayerCombo(0, 'draw'))).toEqual([]);
  });
});

describe('attackSoundFeedback', () => {
  it('clamps attack strength and ducks only a strong impact', () => {
    expect(attackSoundFeedback(1)).toEqual({
      cue: 'attack',
      options: { intensity: 0, duckMusic: false },
    });
    expect(attackSoundFeedback(4)).toEqual({
      cue: 'attack',
      options: { intensity: 3, duckMusic: true },
    });
  });
});
