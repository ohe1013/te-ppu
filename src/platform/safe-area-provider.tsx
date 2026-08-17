import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from 'react';
import type { PlatformPort, SafeArea } from './platform-port';

const SafeAreaContext = createContext<SafeArea | null>(null);

export interface SafeAreaProviderProps extends PropsWithChildren {
  readonly platform: PlatformPort;
}

export function SafeAreaProvider({ children, platform }: SafeAreaProviderProps) {
  const [safeArea, setSafeArea] = useState(() => platform.getInitialSafeArea());

  useEffect(() => {
    setSafeArea(platform.getInitialSafeArea());
    return platform.subscribeSafeArea(setSafeArea);
  }, [platform]);

  const useCapacitorInsets = platform.kind === 'android';
  const top = useCapacitorInsets
    ? 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))'
    : `${safeArea.top}px`;
  const right = useCapacitorInsets
    ? 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))'
    : `${safeArea.right}px`;
  const bottom = useCapacitorInsets
    ? 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))'
    : `${safeArea.bottom}px`;
  const left = useCapacitorInsets
    ? 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))'
    : `${safeArea.left}px`;

  const style: CSSProperties & Record<`--${string}`, string> = {
    '--safe-area-top': top,
    '--safe-area-right': right,
    '--safe-area-bottom': bottom,
    '--safe-area-left': left,
    '--native-close-exclusion-top': useCapacitorInsets
      ? `calc(${top} + 10px)`
      : `${safeArea.top + 10}px`,
    '--native-close-exclusion-right': useCapacitorInsets
      ? `calc(${right} + 10px)`
      : `${safeArea.right + 10}px`,
  };

  return (
    <SafeAreaContext.Provider value={safeArea}>
      <div data-safe-area-provider style={style}>{children}</div>
    </SafeAreaContext.Provider>
  );
}

export function useSafeArea(): SafeArea {
  const value = useContext(SafeAreaContext);
  if (value === null) {
    throw new Error('useSafeArea must be used inside SafeAreaProvider.');
  }
  return value;
}
