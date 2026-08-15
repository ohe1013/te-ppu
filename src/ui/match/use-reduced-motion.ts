import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [query] = useState<MediaQueryList | null>(() => (
    typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null
  ));
  const [reduced, setReduced] = useState(query?.matches ?? false);

  useEffect(() => {
    if (query === null) return undefined;

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);

  return reduced;
}
