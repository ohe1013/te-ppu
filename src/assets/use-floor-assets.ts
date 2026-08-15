import { useEffect, useRef, useState } from 'react';
import { FINAL_FLOOR, type Floor } from '../progression';
import type { AssetManager, FloorAssetBundle } from './types';

type KeyedFloorAssets = {
  readonly floor: Floor;
  readonly bundle: FloorAssetBundle | null;
  readonly routeVisit: number;
};

function retainedFloors(floor: Floor | null): ReadonlySet<Floor> {
  if (floor === null) return new Set();
  return new Set(floor === FINAL_FLOOR ? [floor] : [floor, (floor + 1) as Floor]);
}

/**
 * Resolves only manager-owned floor bundles.  A mismatched route returns null
 * during render, so a previous floor can never leak into the next screen.
 */
export function useFloorAssets(
  manager: AssetManager,
  floor: Floor | null,
): FloorAssetBundle | null {
  const [published, setPublished] = useState<KeyedFloorAssets | null>(null);
  const desiredRef = useRef<Floor | null>(floor);
  const retainedRef = useRef<ReadonlySet<Floor>>(new Set());
  const tokenRef = useRef(0);
  const routeVisitRef = useRef({ floor, value: 0 });
  if (routeVisitRef.current.floor !== floor) {
    routeVisitRef.current = { floor, value: routeVisitRef.current.value + 1 };
  }
  const routeVisit = routeVisitRef.current.value;
  desiredRef.current = floor;

  useEffect(() => {
    const token = ++tokenRef.current;
    const next = retainedFloors(floor);
    const previous = retainedRef.current;
    retainedRef.current = next;

    for (const oldFloor of previous) {
      if (next.has(oldFloor)) continue;
      queueMicrotask(() => {
        if (tokenRef.current !== token || retainedRef.current.has(oldFloor)) return;
        manager.releaseFloor(oldFloor);
      });
    }

    if (floor === null) return;
    if (floor < FINAL_FLOOR) {
      // The manager owns pending-prefetch retry and rejection handling.
      manager.prefetchFloor((floor + 1) as Floor);
    }

    void (async () => {
      try {
        await manager.loadFloor(floor);
        if (desiredRef.current !== floor || tokenRef.current !== token) return;
        setPublished({ floor, bundle: manager.getFloorAssets(floor), routeVisit });
      } catch {
        if (desiredRef.current !== floor || tokenRef.current !== token) return;
        setPublished({ floor, bundle: null, routeVisit });
      }
    })();
  }, [floor, manager, routeVisit]);

  useEffect(() => () => {
    ++tokenRef.current;
    for (const requestedFloor of retainedRef.current) manager.releaseFloor(requestedFloor);
    retainedRef.current = new Set();
  }, [manager]);

  return published?.floor === floor && published.routeVisit === routeVisit
    ? published.bundle
    : null;
}
