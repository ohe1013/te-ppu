import type { RuntimeMode } from './runtime-mode';

export interface DevClearedModeInput {
  readonly isDev: boolean;
  readonly runtimeMode: RuntimeMode;
  readonly flag: string | undefined;
}

export function isDevClearedProgressEnabled({
  isDev,
  runtimeMode,
  flag,
}: DevClearedModeInput): boolean {
  return isDev && runtimeMode === 'browser' && flag === 'true';
}
