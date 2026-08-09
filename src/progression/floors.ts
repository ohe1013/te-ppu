export const FLOORS = [1, 2, 3, 4, 5] as const;

export type Floor = typeof FLOORS[number];
export type ClearedFloors = Record<Floor, boolean>;

export const FINAL_FLOOR: Floor = 5;

export function isFloor(value: unknown): value is Floor {
  return typeof value === 'number' && FLOORS.includes(value as Floor);
}

export function isFinalFloor(floor: Floor): boolean {
  return floor === FINAL_FLOOR;
}
