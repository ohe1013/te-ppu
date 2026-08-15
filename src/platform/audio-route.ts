import type { AppRoute } from '../app/app-route';
import type { MusicTrack } from './audio-port';

export function musicForRoute(route: AppRoute): MusicTrack | null {
  switch (route.name) {
    case 'boot':
      return null;
    case 'title':
    case 'name-entry':
    case 'character-select':
    case 'ranking':
    case 'tower':
    case 'floor-intro':
      return 'tower';
    case 'match':
    case 'result':
      if (route.floor <= 2) return 'early-floors';
      if (route.floor <= 4) return 'late-floors';
      return 'demon-king';
    case 'owl-reveal':
    case 'owl-match':
    case 'owl-result':
      return 'demon-king';
    case 'ending':
      return 'ending';
  }
}
