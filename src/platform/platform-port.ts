import type { RuntimeMode } from '../app/runtime-mode';

export type SafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type UserIdentity =
  | { kind: 'local'; key: 'local-browser' }
  | { kind: 'apps-in-toss'; key: string };

export type HapticType = 'tickWeak' | 'tap' | 'success' | 'error';

export interface PlatformPort {
  readonly kind: RuntimeMode;
  getIdentity(): Promise<UserIdentity>;
  getInitialSafeArea(): SafeArea;
  subscribeSafeArea(listener: (value: SafeArea) => void): () => void;
  lockPortrait(): Promise<void>;
  haptic(type: HapticType): Promise<void>;
  close(): Promise<void>;
}
