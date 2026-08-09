import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type GameEvent,
  type PublicMatchView,
  type SideId,
} from '../../core/index';

type EventBatch = {
  readonly events: readonly GameEvent[];
  readonly tick: number;
  readonly view: PublicMatchView;
};

function viewAt(
  tick: number,
  {
    combo = 0,
    comboFor,
    dangerFor,
    status = 'playing',
  }: {
    readonly combo?: number;
    readonly comboFor?: SideId;
    readonly dangerFor?: SideId;
    readonly status?: PublicMatchView['status'];
  } = {},
): PublicMatchView {
  const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 41 }));
  const dangerBoard = view.sides[dangerFor ?? 'player'].board.map((cell, index) => (
    dangerFor !== undefined && index === 0 ? { kind: 'I' as const } : cell
  ));
  const sides = { ...view.sides };
  if (dangerFor !== undefined) {
    sides[dangerFor] = {
      ...sides[dangerFor],
      board: dangerBoard,
      incoming: 4,
    };
  }
  if (comboFor !== undefined) {
    sides[comboFor] = {
      ...sides[comboFor],
      combo,
    };
  }
  return {
    ...view,
    status,
    tick,
    sides,
  };
}

async function portraitRuntime() {
  return import('./portrait-state');
}

describe('portrait state', () => {
  it('resolves terminal, hit, attack, danger, focus, smug, and idle in priority order', async () => {
    const { resolvePortraitState } = await portraitRuntime();

    expect(resolvePortraitState({
      tick: 100,
      hitUntil: 110,
      attackUntil: 118,
      danger: true,
      terminal: null,
    })).toBe('hit');
    expect(resolvePortraitState({
      tick: 110,
      hitUntil: 110,
      attackUntil: 118,
      danger: true,
      terminal: null,
    })).toBe('attack');
    expect(resolvePortraitState({
      tick: 118,
      hitUntil: 110,
      attackUntil: 118,
      danger: true,
      dangerState: 'rage',
      terminal: null,
    })).toBe('rage');
    expect(resolvePortraitState({
      tick: 118,
      hitUntil: 110,
      attackUntil: 118,
      danger: false,
      focusUntil: 130,
      smugUntil: 140,
      terminal: null,
    })).toBe('focus');
    expect(resolvePortraitState({
      tick: 130,
      hitUntil: 110,
      attackUntil: 118,
      danger: false,
      focusUntil: 130,
      smugUntil: 140,
      terminal: null,
    })).toBe('smug');
    expect(resolvePortraitState({
      tick: 140,
      hitUntil: 110,
      attackUntil: 118,
      danger: false,
      terminal: null,
    })).toBe('idle');
    expect(resolvePortraitState({
      tick: 100,
      hitUntil: 999,
      attackUntil: 999,
      danger: true,
      terminal: 'defeat',
    })).toBe('defeat');
  });

  it('stores absolute event deadlines from ordered batch views and keeps terminal poses permanent', async () => {
    const {
      createPortraitMemory,
      reducePortraitBatches,
      resolvePortraitState,
    } = await portraitRuntime();
    const early: EventBatch = {
      events: [{ type: 'attack-sent', side: 'opponent', amount: 2 }],
      tick: 18,
      view: viewAt(18, { dangerFor: 'opponent' }),
    };
    const later: EventBatch = {
      events: [
        { type: 'lines-cleared', side: 'player', amount: 2 },
        { type: 'freeze-applied', side: 'opponent', item: 'freeze' },
      ],
      tick: 19,
      view: viewAt(19, { combo: 2, comboFor: 'player' }),
    };

    const opponent = reducePortraitBatches(createPortraitMemory(), {
      batches: [later, early],
      floor: 1,
      latestView: viewAt(20),
      role: 'lieutenant',
      side: 'opponent',
    });
    expect(opponent.attackUntil).toBe(36);
    expect(opponent.hitUntil).toBe(44);
    expect(opponent.smugUntil).toBe(57);
    expect(resolvePortraitState({
      ...opponent,
      danger: false,
      tick: 43,
    })).toBe('hit');
    expect(resolvePortraitState({
      ...opponent,
      danger: false,
      tick: 44,
    })).toBe('smug');

    const hero = reducePortraitBatches(createPortraitMemory(), {
      batches: [later],
      floor: 1,
      latestView: viewAt(20),
      role: 'hero',
      side: 'player',
    });
    expect(hero.focusUntil).toBe(37);

    const terminal = reducePortraitBatches(opponent, {
      batches: [{
        events: [{ type: 'match-ended', side: 'player' }],
        tick: 45,
        view: viewAt(45, { status: 'player-won' }),
      }],
      floor: 1,
      latestView: viewAt(46, { status: 'playing' }),
      role: 'lieutenant',
      side: 'opponent',
    });
    expect(terminal.terminal).toBe('defeat');
    expect(resolvePortraitState({
      ...terminal,
      danger: true,
      tick: 1_000,
    })).toBe('defeat');
  });

  it('uses the owning batch combo for hero focus instead of borrowing a later snapshot', async () => {
    const {
      createPortraitMemory,
      reducePortraitBatches,
      resolvePortraitState,
    } = await portraitRuntime();
    const earlierCombo: EventBatch = {
      events: [{ amount: 2, side: 'player', type: 'lines-cleared' }],
      tick: 18,
      view: viewAt(18, { combo: 2, comboFor: 'player' }),
    };
    const laterSingle: EventBatch = {
      events: [{ amount: 1, side: 'player', type: 'lines-cleared' }],
      tick: 19,
      view: viewAt(19, { combo: 1, comboFor: 'player' }),
    };

    const hero = reducePortraitBatches(createPortraitMemory(), {
      batches: [laterSingle, earlierCombo],
      floor: 1,
      latestView: viewAt(20, { combo: 8, comboFor: 'player' }),
      role: 'hero',
      side: 'player',
    });

    expect(hero.focusUntil).toBe(36);
    expect(resolvePortraitState({ ...hero, tick: 35 })).toBe('focus');
    expect(resolvePortraitState({ ...hero, tick: 36 })).toBe('idle');
  });

  it('uses exact effect deadlines and later same-tick batch snapshots', async () => {
    const {
      createPortraitMemory,
      reducePortraitBatches,
      resolvePortraitState,
    } = await portraitRuntime();
    const hit = reducePortraitBatches(createPortraitMemory(), {
      batches: [{
        events: [
          { amount: 1, side: 'player', type: 'garbage-landed' },
          { item: 'freeze', side: 'player', type: 'freeze-applied' },
        ],
        tick: 10,
        view: viewAt(10),
      }],
      floor: 1,
      latestView: viewAt(10),
      role: 'hero',
      side: 'player',
    });
    expect(hit.hitUntil).toBe(35);
    expect(resolvePortraitState({ ...hit, tick: 34 })).toBe('hit');
    expect(resolvePortraitState({ ...hit, tick: 35 })).toBe('idle');

    const hero = reducePortraitBatches(createPortraitMemory(), {
      batches: [{
        events: [
          { item: 'row-clear', side: 'player', type: 'item-used' },
          { amount: 2, side: 'player', type: 'lines-cleared' },
        ],
        tick: 20,
        view: viewAt(20, { combo: 2, comboFor: 'player' }),
      }],
      floor: 1,
      latestView: viewAt(20, { combo: 2, comboFor: 'player' }),
      role: 'hero',
      side: 'player',
    });
    expect(hero.attackUntil).toBe(38);
    expect(hero.focusUntil).toBe(38);
    expect(resolvePortraitState({ ...hero, tick: 37 })).toBe('attack');
    expect(resolvePortraitState({ ...hero, tick: 38 })).toBe('idle');

    const lieutenant = reducePortraitBatches(createPortraitMemory(), {
      batches: [{
        events: [{ amount: 1, side: 'opponent', type: 'attack-sent' }],
        tick: 30,
        view: viewAt(30),
      }],
      floor: 1,
      latestView: viewAt(30),
      role: 'lieutenant',
      side: 'opponent',
    });
    expect(lieutenant.attackUntil).toBe(48);
    expect(lieutenant.smugUntil).toBe(69);
    expect(resolvePortraitState({ ...lieutenant, tick: 47 })).toBe('attack');
    expect(resolvePortraitState({ ...lieutenant, tick: 48 })).toBe('smug');
    expect(resolvePortraitState({ ...lieutenant, tick: 69 })).toBe('idle');

    const safeLater = reducePortraitBatches(createPortraitMemory(), {
      batches: [
        {
          events: [{ item: 'queue-swap', side: 'opponent', type: 'item-used' }],
          tick: 70,
          view: viewAt(70, { dangerFor: 'opponent' }),
        },
        {
          events: [{ item: 'queue-swap', side: 'opponent', type: 'item-used' }],
          tick: 70,
          view: viewAt(70),
        },
      ],
      floor: 1,
      latestView: viewAt(70),
      role: 'lieutenant',
      side: 'opponent',
    });
    expect(safeLater.danger).toBe(false);
  });

  it('uses public batch snapshots for danger and maps terminal floor outcomes exactly', async () => {
    const {
      createPortraitMemory,
      dangerForSide,
      reducePortraitBatches,
      resolvePortraitState,
    } = await portraitRuntime();
    const dangerBatch: EventBatch = {
      events: [{ type: 'item-used', side: 'opponent', item: 'queue-swap' }],
      tick: 30,
      view: viewAt(30, { dangerFor: 'opponent' }),
    };
    const latest = viewAt(31);
    expect(dangerForSide(dangerBatch.view.sides.opponent)).toBe(true);
    expect(dangerForSide(latest.sides.opponent)).toBe(false);

    const demon = reducePortraitBatches(createPortraitMemory(), {
      batches: [dangerBatch],
      floor: 5,
      latestView: dangerBatch.view,
      role: 'demon-king',
      side: 'opponent',
    });
    expect(demon.danger).toBe(true);
    expect(resolvePortraitState({
      ...demon,
      dangerState: 'rage',
      tick: 30,
    })).toBe('attack');
    expect(resolvePortraitState({
      ...demon,
      dangerState: 'rage',
      tick: 48,
    })).toBe('rage');

    const safeDemon = reducePortraitBatches(demon, {
      batches: [],
      floor: 5,
      latestView: latest,
      role: 'demon-king',
      side: 'opponent',
    });
    expect(safeDemon.danger).toBe(false);

    const playerLoss = reducePortraitBatches(createPortraitMemory(), {
      batches: [{
        events: [{ type: 'match-ended', side: 'opponent' }],
        tick: 50,
        view: viewAt(50, { status: 'opponent-won' }),
      }],
      floor: 1,
      latestView: viewAt(50, { status: 'opponent-won' }),
      role: 'lieutenant',
      side: 'opponent',
    });
    expect(playerLoss.terminal).toBe('smug');

    const demonWin = reducePortraitBatches(createPortraitMemory(), {
      batches: [{
        events: [{ type: 'match-ended', side: 'opponent' }],
        tick: 50,
        view: viewAt(50, { status: 'opponent-won' }),
      }],
      floor: 5,
      latestView: viewAt(50, { status: 'opponent-won' }),
      role: 'demon-king',
      side: 'opponent',
    });
    expect(demonWin.terminal).toBe('idle');
  });

  it('uses supplied state art, then idle art, without fabricating a URL', async () => {
    const { createPortraitPresentation } = await portraitRuntime();

    expect(createPortraitPresentation('attack', { idle: '/hero-idle.webp' }, 'PLAYER'))
      .toEqual({
        alt: 'PLAYER attack portrait',
        state: 'attack',
        url: '/hero-idle.webp',
      });
    expect(createPortraitPresentation('panic', undefined, 'RIVAL')).toEqual({
      alt: 'RIVAL panic portrait',
      state: 'panic',
    });
  });
});
