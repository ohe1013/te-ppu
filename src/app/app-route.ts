import { isFinalFloor, type Floor } from '../progression';
import type { EncounterIndex } from '../progression';

export type { Floor } from '../progression';

export type MatchResult = 'win' | 'loss' | 'draw';

export type AppRoute =
  | { name: 'boot' }
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
  | { type: 'select-floor'; floor: Floor }
  | { type: 'start-match'; seed: number }
  | { type: 'match-finished'; result: MatchResult }
  | { type: 'start-owl-match'; seed: number }
  | { type: 'owl-match-finished'; result: MatchResult }
  | { type: 'retry'; seed: number }
  | { type: 'continue' }
  | { type: 'return-to-tower' };

export function reduceRoute(route: AppRoute, event: AppRouteEvent): AppRoute {
  if (event.type === 'return-to-tower' && route.name !== 'boot') {
    return route.name === 'tower' ? route : { name: 'tower' };
  }

  switch (route.name) {
    case 'boot':
      return event.type === 'boot-ready' ? { name: 'tower' } : route;
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
