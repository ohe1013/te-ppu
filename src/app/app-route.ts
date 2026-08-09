import { isFinalFloor, type Floor } from '../progression';
import type { EncounterIndex } from '../progression';

export type { Floor } from '../progression';

export type MatchResult = 'win' | 'loss' | 'draw';
export type OnboardingIntent = 'start-run' | 'change-player';

export type AppRoute =
  | { name: 'boot' }
  | { name: 'title' }
  | { name: 'name-entry'; intent: OnboardingIntent }
  | { name: 'character-select'; intent: OnboardingIntent; initials: string }
  | { name: 'ranking' }
  | { name: 'tower' }
  | { name: 'floor-intro'; floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2 }
  | { name: 'match'; floor: Floor; encounterIndex: EncounterIndex; wins: 0 | 1 | 2; seed: number }
  | {
      name: 'result';
      floor: Floor;
      encounterIndex: EncounterIndex;
      wins: 0 | 1 | 2;
      result: MatchResult;
      seriesComplete: boolean;
    }
  | { name: 'owl-reveal' }
  | { name: 'owl-match'; seed: number }
  | { name: 'owl-result'; result: MatchResult }
  | { name: 'ending' };

export type AppRouteEvent =
  | { type: 'boot-ready' }
  | { type: 'start-run'; hasProfile: boolean }
  | { type: 'open-ranking' }
  | { type: 'change-player' }
  | { type: 'name-completed'; initials: string }
  | { type: 'character-selected' }
  | { type: 'return-to-title' }
  | { type: 'select-floor'; floor: Floor }
  | { type: 'start-match'; seed: number }
  | { type: 'match-finished'; result: MatchResult }
  | { type: 'start-owl-match'; seed: number }
  | { type: 'owl-match-finished'; result: MatchResult }
  | { type: 'retry'; seed: number }
  | { type: 'continue' }
  | { type: 'return-to-tower' };

export function reduceRoute(route: AppRoute, event: AppRouteEvent): AppRoute {
  if (
    event.type === 'return-to-title'
    && (route.name === 'name-entry' || route.name === 'character-select' || route.name === 'ranking')
  ) {
    return { name: 'title' };
  }

  if (
    event.type === 'return-to-tower'
    && route.name !== 'boot'
    && route.name !== 'title'
    && route.name !== 'name-entry'
    && route.name !== 'character-select'
    && route.name !== 'ranking'
  ) {
    return route.name === 'tower' ? route : { name: 'tower' };
  }

  switch (route.name) {
    case 'boot':
      return event.type === 'boot-ready' ? { name: 'title' } : route;
    case 'title':
      if (event.type === 'start-run') {
        return event.hasProfile
          ? { name: 'tower' }
          : { name: 'name-entry', intent: 'start-run' };
      }
      if (event.type === 'open-ranking') return { name: 'ranking' };
      if (event.type === 'change-player') {
        return { name: 'name-entry', intent: 'change-player' };
      }
      return route;
    case 'name-entry':
      return event.type === 'name-completed'
        ? {
            name: 'character-select',
            intent: route.intent,
            initials: event.initials,
          }
        : route;
    case 'character-select':
      if (event.type !== 'character-selected') return route;
      return route.intent === 'start-run' ? { name: 'tower' } : { name: 'title' };
    case 'ranking':
      return route;
    case 'tower':
      return event.type === 'select-floor'
        ? { name: 'floor-intro', floor: event.floor, encounterIndex: 0, wins: 0 }
        : route;
    case 'floor-intro':
      return event.type === 'start-match'
        ? {
            name: 'match',
            floor: route.floor,
            encounterIndex: route.encounterIndex,
            wins: route.wins,
            seed: event.seed,
          }
        : route;
    case 'match':
      return event.type === 'match-finished'
        ? {
            name: 'result',
            floor: route.floor,
            encounterIndex: route.encounterIndex,
            wins: route.wins,
            result: event.result,
            seriesComplete: event.result === 'win' && route.encounterIndex === 2,
          }
        : route;
    case 'result':
      if (event.type === 'retry') {
        return {
          name: 'match',
          floor: route.floor,
          encounterIndex: 0,
          wins: 0,
          seed: event.seed,
        };
      }
      if (event.type === 'continue') {
        if (route.result !== 'win') return { name: 'tower' };
        if (!route.seriesComplete) {
          return {
            name: 'floor-intro',
            floor: route.floor,
            encounterIndex: (route.encounterIndex + 1) as EncounterIndex,
            wins: (route.wins + 1) as 0 | 1 | 2,
          };
        }
        return isFinalFloor(route.floor) ? { name: 'owl-reveal' } : { name: 'tower' };
      }
      return route;
    case 'owl-reveal':
      return event.type === 'start-owl-match'
        ? { name: 'owl-match', seed: event.seed }
        : route;
    case 'owl-match':
      return event.type === 'owl-match-finished'
        ? { name: 'owl-result', result: event.result }
        : route;
    case 'owl-result':
      if (event.type === 'continue') {
        return route.result === 'win'
          ? { name: 'ending' }
          : { name: 'owl-reveal' };
      }
      return route;
    case 'ending':
      return route;
  }
}
