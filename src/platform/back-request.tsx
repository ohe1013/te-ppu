import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { PlatformPort } from './platform-port';

interface BackHandlerEntry {
  readonly id: symbol;
  readonly order: number;
  readonly priority: number;
  readonly handlerRef: { current: () => void };
}

interface BackHandlerRegistration {
  readonly id: symbol;
  readonly priority: number;
  readonly handlerRef: { current: () => void };
}

type RegisterBackHandler = (entry: BackHandlerRegistration) => () => void;

const BackRequestContext = createContext<RegisterBackHandler | null>(null);

export interface PlatformBackProviderProps {
  readonly children: ReactNode;
  readonly platform: PlatformPort;
}

export function PlatformBackProvider({
  children,
  platform,
}: PlatformBackProviderProps) {
  const entriesRef = useRef(new Map<symbol, BackHandlerEntry>());
  const nextOrderRef = useRef(0);

  const register = useCallback<RegisterBackHandler>((registration) => {
    const entry: BackHandlerEntry = {
      ...registration,
      order: nextOrderRef.current,
    };
    nextOrderRef.current += 1;
    entriesRef.current.set(registration.id, entry);
    return () => {
      entriesRef.current.delete(registration.id);
    };
  }, []);

  useEffect(() => {
    if (platform.subscribeBackRequest === undefined) return undefined;
    return platform.subscribeBackRequest(() => {
      let selected: BackHandlerEntry | undefined;
      for (const entry of entriesRef.current.values()) {
        if (
          selected === undefined
          || entry.priority > selected.priority
          || (entry.priority === selected.priority && entry.order > selected.order)
        ) {
          selected = entry;
        }
      }
      selected?.handlerRef.current();
    });
  }, [platform]);

  const contextValue = useMemo(() => register, [register]);

  return (
    <BackRequestContext.Provider value={contextValue}>
      {children}
    </BackRequestContext.Provider>
  );
}

export interface PlatformBackOptions {
  readonly enabled?: boolean;
  readonly priority: number;
}

export function usePlatformBack(
  handler: () => void,
  { enabled = true, priority }: PlatformBackOptions,
): void {
  const register = useContext(BackRequestContext);
  const idRef = useRef(Symbol('platform-back-handler'));
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (register === null || !enabled) return undefined;
    return register({
      id: idRef.current,
      priority,
      handlerRef,
    });
  }, [enabled, priority, register]);
}
