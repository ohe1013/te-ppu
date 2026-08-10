import { describe, expect, it } from 'vitest';
import {
  reduceRoute,
  type AppRoute,
  type AppRouteEvent,
} from './app-route';

const taskFiveEvents = [
  { type: 'start-run', hasProfile: false },
  { type: 'open-ranking' },
  { type: 'change-player' },
  { type: 'name-completed', initials: 'RVT' },
  { type: 'character-selected' },
  { type: 'return-to-title' },
] satisfies readonly AppRouteEvent[];

const taskFiveEventsWithoutReturnToTitle = taskFiveEvents.filter(
  (event) => event.type !== 'return-to-title',
);

const invalidEventCases: ReadonlyArray<readonly [
  string,
  AppRoute,
  readonly AppRouteEvent[],
]> = [
  ['boot', { name: 'boot' }, [
    ...taskFiveEvents,
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['tower', { name: 'tower' }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['floor intro', { name: 'floor-intro', floor: 2, encounterIndex: 0, wins: 0 }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
  ]],
  ['match', { name: 'match', floor: 2, encounterIndex: 0, wins: 0, seed: 3 }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
  ]],
  ['result', {
    name: 'result', floor: 2, encounterIndex: 0, wins: 0, result: 'loss', seriesComplete: false,
  }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
  ]],
  ['ending', { name: 'ending' }, [
    ...taskFiveEventsWithoutReturnToTitle,
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['owl reveal', { name: 'owl-reveal' }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
  ]],
  ['owl match', { name: 'owl-match', seed: 7 }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
  ]],
  ['owl result', { name: 'owl-result', result: 'loss' }, [
    ...taskFiveEvents,
    { type: 'boot-ready' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
  ]],
  ['title', { name: 'title' }, [
    { type: 'boot-ready' },
    { type: 'name-completed', initials: 'RVT' },
    { type: 'character-selected' },
    { type: 'return-to-title' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
    { type: 'return-to-tower' },
  ]],
  ['name entry', { name: 'name-entry', intent: 'start-run' }, [
    { type: 'boot-ready' },
    { type: 'start-run', hasProfile: false },
    { type: 'open-ranking' },
    { type: 'change-player' },
    { type: 'character-selected' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['character select', {
    name: 'character-select', intent: 'change-player', initials: 'LUM',
  }, [
    { type: 'boot-ready' },
    { type: 'start-run', hasProfile: false },
    { type: 'open-ranking' },
    { type: 'change-player' },
    { type: 'name-completed', initials: 'RVT' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
  ['ranking', { name: 'ranking' }, [
    { type: 'boot-ready' },
    { type: 'start-run', hasProfile: false },
    { type: 'open-ranking' },
    { type: 'change-player' },
    { type: 'name-completed', initials: 'RVT' },
    { type: 'character-selected' },
    { type: 'select-floor', floor: 1 },
    { type: 'start-match', seed: 1 },
    { type: 'match-finished', result: 'win' },
    { type: 'start-owl-match', seed: 1 },
    { type: 'owl-match-finished', result: 'win' },
    { type: 'retry', seed: 2 },
    { type: 'continue' },
    { type: 'return-to-tower' },
  ]],
];

describe('reduceRoute', () => {
  it('routes boot to title and a first start through name and character selection', () => {
    let route: AppRoute = { name: 'boot' };
    route = reduceRoute(route, { type: 'boot-ready' });
    expect(route).toEqual({ name: 'title' });
    route = reduceRoute(route, { type: 'start-run', hasProfile: false });
    expect(route).toEqual({ name: 'name-entry', intent: 'start-run' });
    route = reduceRoute(route, { type: 'name-completed', initials: 'RVT' });
    expect(route).toEqual({
      name: 'character-select',
      intent: 'start-run',
      initials: 'RVT',
    });
    route = reduceRoute(route, { type: 'character-selected' });
    expect(route).toEqual({ name: 'tower' });
  });

  it('sends a returning start directly to the tower', () => {
    expect(reduceRoute(
      { name: 'title' },
      { type: 'start-run', hasProfile: true },
    )).toEqual({ name: 'tower' });
  });

  it('returns PLAYER CHANGE to title after selection', () => {
    const name = reduceRoute({ name: 'title' }, { type: 'change-player' });
    const character = reduceRoute(name, { type: 'name-completed', initials: 'LUM' });

    expect(name).toEqual({ name: 'name-entry', intent: 'change-player' });
    expect(character).toEqual({
      name: 'character-select',
      intent: 'change-player',
      initials: 'LUM',
    });
    expect(reduceRoute(character, { type: 'character-selected' })).toEqual({ name: 'title' });
  });

  it('opens ranking from title and returns title from presentation routes', () => {
    const ranking = reduceRoute({ name: 'title' }, { type: 'open-ranking' });

    expect(ranking).toEqual({ name: 'ranking' });
    expect(reduceRoute(ranking, { type: 'return-to-title' })).toEqual({ name: 'title' });
    expect(reduceRoute(
      { name: 'name-entry', intent: 'start-run' },
      { type: 'return-to-title' },
    )).toEqual({ name: 'title' });
    expect(reduceRoute(
      { name: 'character-select', intent: 'change-player', initials: 'LUM' },
      { type: 'return-to-title' },
    )).toEqual({ name: 'title' });
  });

  it('carries encounter progress through an intermediate victory', () => {
    const intro = reduceRoute({ name: 'tower' }, { type: 'select-floor', floor: 2 });
    const match = reduceRoute(intro, { type: 'start-match', seed: 73 });
    const result = reduceRoute(match, { type: 'match-finished', result: 'win' });
    const nextIntro = reduceRoute(result, { type: 'continue' });

    expect(intro).toEqual({ name: 'floor-intro', floor: 2, encounterIndex: 0, wins: 0 });
    expect(match).toEqual({
      name: 'match', floor: 2, encounterIndex: 0, wins: 0, seed: 73,
    });
    expect(result).toEqual({
      name: 'result',
      floor: 2,
      encounterIndex: 0,
      wins: 0,
      result: 'win',
      seriesComplete: false,
    });
    expect(nextIntro).toEqual({ name: 'floor-intro', floor: 2, encounterIndex: 1, wins: 1 });
  });

  it('marks only the third victory as a completed series', () => {
    const result = reduceRoute(
      { name: 'match', floor: 5, encounterIndex: 2, wins: 2, seed: 50 },
      { type: 'match-finished', result: 'win' },
    );

    expect(result).toEqual({
      name: 'result',
      floor: 5,
      encounterIndex: 2,
      wins: 2,
      result: 'win',
      seriesComplete: true,
    });
    expect(reduceRoute(result, { type: 'continue' })).toEqual({ name: 'owl-reveal' });
  });

  it('routes the hidden owl match through reveal, result, and ending', () => {
    const reveal = reduceRoute(
      { name: 'result', floor: 5, encounterIndex: 2, wins: 2, result: 'win', seriesComplete: true },
      { type: 'continue' },
    );
    const match = reduceRoute(reveal, { type: 'start-owl-match', seed: 77 });
    const loss = reduceRoute(match, { type: 'owl-match-finished', result: 'loss' });
    const ended = reduceRoute(loss, { type: 'continue' });
    const win = reduceRoute(match, { type: 'owl-match-finished', result: 'win' });

    expect(reveal).toEqual({ name: 'owl-reveal' });
    expect(match).toEqual({ name: 'owl-match', seed: 77 });
    expect(loss).toEqual({ name: 'owl-result', result: 'loss' });
    expect(ended).toEqual({ name: 'title' });
    expect(win).toEqual({ name: 'owl-result', result: 'win' });
    expect(reduceRoute(win, { type: 'continue' })).toEqual({ name: 'ending' });
  });

  it('moves through floor selection, match start, and result', () => {
    const intro = reduceRoute({ name: 'tower' }, { type: 'select-floor', floor: 2 });
    const match = reduceRoute(intro, { type: 'start-match', seed: 73 });
    const result = reduceRoute(match, { type: 'match-finished', result: 'loss' });

    expect(intro).toEqual({ name: 'floor-intro', floor: 2, encounterIndex: 0, wins: 0 });
    expect(match).toEqual({
      name: 'match', floor: 2, encounterIndex: 0, wins: 0, seed: 73,
    });
    expect(result).toEqual({
      name: 'result',
      floor: 2,
      encounterIndex: 0,
      wins: 0,
      result: 'loss',
      seriesComplete: false,
    });
  });

  it('rejects same-run retry after a ranked match resolves', () => {
    const result: AppRoute = {
      name: 'result', floor: 2, encounterIndex: 0, wins: 0, result: 'loss', seriesComplete: false,
    };
    expect(reduceRoute(result, { type: 'retry', seed: 91 })).toBe(result);
  });

  it.each(['loss', 'draw'] as const)('returns to title after a floor-two %s ends the run', (result) => {
    expect(reduceRoute(
      { name: 'result', floor: 2, encounterIndex: 0, wins: 0, result, seriesComplete: false },
      { type: 'continue' },
    )).toEqual({ name: 'title' });
  });

  it('returns to the tower after continuing from floor-three and floor-four victories', () => {
    expect(reduceRoute(
      { name: 'result', floor: 3, encounterIndex: 2, wins: 2, result: 'win', seriesComplete: true },
      { type: 'continue' },
    )).toEqual({ name: 'tower' });
    expect(reduceRoute(
      { name: 'result', floor: 4, encounterIndex: 2, wins: 2, result: 'win', seriesComplete: true },
      { type: 'continue' },
    )).toEqual({ name: 'tower' });
  });

  it('reveals the owl only after continuing from a floor-five victory', () => {
    expect(reduceRoute(
      { name: 'result', floor: 5, encounterIndex: 2, wins: 2, result: 'win', seriesComplete: true },
      { type: 'continue' },
    )).toEqual({ name: 'owl-reveal' });
  });

  it('returns to the tower from an active floor route', () => {
    expect(reduceRoute(
      { name: 'floor-intro', floor: 1, encounterIndex: 0, wins: 0 },
      { type: 'return-to-tower' },
    )).toEqual({ name: 'tower' });
  });

  it('returns to title after the completed ending', () => {
    expect(reduceRoute(
      { name: 'ending' },
      { type: 'return-to-title' },
    )).toEqual({ name: 'title' });
  });

  it.each(invalidEventCases)(
    'keeps the %s route referentially stable for every invalid event',
    (_name, route, events) => {
      for (const event of events) expect(reduceRoute(route, event)).toBe(route);
    },
  );
});
