import { isFloor, type Floor } from './floors';
import {
  getFloorEncounter,
  type EncounterIndex,
  type FloorEncounter,
  type FloorSeriesState,
} from './encounters';
import type { FloorResult } from './tower';

export type SeriesResolution =
  | {
      readonly kind: 'next-encounter';
      readonly series: FloorSeriesState;
      readonly encounter: FloorEncounter;
    }
  | { readonly kind: 'floor-win'; readonly floor: Floor }
  | { readonly kind: 'series-loss'; readonly floor: Floor };

function assertValidSeries(series: FloorSeriesState): void {
  if (
    !isFloor(series.floor)
    || ![0, 1, 2].includes(series.encounterIndex)
    || ![0, 1, 2].includes(series.wins)
    || series.encounterIndex !== series.wins
  ) {
    throw new RangeError('Invalid floor series.');
  }
}

export function startFloorSeries(floor: Floor): FloorSeriesState {
  if (!isFloor(floor)) throw new RangeError('Invalid floor series.');
  return { floor, encounterIndex: 0, wins: 0 };
}

export function resolveEncounter(
  series: FloorSeriesState,
  result: FloorResult,
): SeriesResolution {
  assertValidSeries(series);

  if (result !== 'WIN') return { kind: 'series-loss', floor: series.floor };
  if (series.encounterIndex === 2) return { kind: 'floor-win', floor: series.floor };

  const nextIndex = (series.encounterIndex + 1) as EncounterIndex;
  const nextSeries: FloorSeriesState = {
    floor: series.floor,
    encounterIndex: nextIndex,
    wins: (series.wins + 1) as 0 | 1 | 2,
  };
  return {
    kind: 'next-encounter',
    series: nextSeries,
    encounter: getFloorEncounter(series.floor, nextIndex),
  };
}
