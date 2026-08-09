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

  const style: CSSProperties & Record<`--${string}`, string> = {
    '--safe-area-top': `${safeArea.top}px`,
    '--safe-area-right': `${safeArea.right}px`,
    '--safe-area-bottom': `${safeArea.bottom}px`,
    '--safe-area-left': `${safeArea.left}px`,
    '--native-close-exclusion-top': `${safeArea.top + 10}px`,
    '--native-close-exclusion-right': `${safeArea.right + 10}px`,
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
