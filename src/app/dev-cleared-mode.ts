import type { RuntimeMode } from './runtime-mode';

export interface DevClearedModeInput {
  readonly isDev: boolean;
  readonly mode: string;
  readonly runtimeMode: RuntimeMode;
  readonly flag: string | undefined;
}

export function isDevClearedProgressEnabled({
  isDev,
  mode,
  runtimeMode,
  flag,
}: DevClearedModeInput): boolean {
  return isDev
    && mode === 'dev-cleared'
    && runtimeMode === 'browser'
    && flag === 'true';
}
