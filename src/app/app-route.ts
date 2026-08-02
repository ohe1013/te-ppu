import { isFinalFloor, type Floor } from '../progression';

export type { Floor } from '../progression';

export type MatchResult = 'win' | 'loss' | 'draw';

export type AppRoute =
  | { name: 'boot' }
  | { name: 'tower' }
  | { name: 'floor-intro'; floor: Floor }
  | { name: 'match'; floor: Floor; seed: number }
  | { name: 'result'; floor: Floor; result: MatchResult }
  | { name: 'ending' };

export type AppRouteEvent =
  | { type: 'boot-ready' }
  | { type: 'select-floor'; floor: Floor }
  | { type: 'start-match'; seed: number }
  | { type: 'match-finished'; result: MatchResult }
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
        ? { name: 'floor-intro', floor: event.floor }
        : route;
    case 'floor-intro':
      return event.type === 'start-match'
        ? { name: 'match', floor: route.floor, seed: event.seed }
        : route;
    case 'match':
      return event.type === 'match-finished'
        ? { name: 'result', floor: route.floor, result: event.result }
        : route;
    case 'result':
      if (event.type === 'retry') {
        return { name: 'match', floor: route.floor, seed: event.seed };
      }
      if (event.type === 'continue') {
        return isFinalFloor(route.floor) && route.result === 'win'
          ? { name: 'ending' }
          : { name: 'tower' };
      }
      return route;
    case 'ending':
      return route;
  }
}
