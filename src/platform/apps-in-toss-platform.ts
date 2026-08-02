import {
  SafeAreaInsets,
  closeView,
  generateHapticFeedback,
  getUserKeyForGame,
  setDeviceOrientation,
} from '@apps-in-toss/web-framework';
import type {
  HapticType,
  PlatformPort,
  SafeArea,
  UserIdentity,
} from './platform-port';

export type PlatformErrorCode =
  | 'UPDATE_REQUIRED'
  | 'INVALID_CATEGORY'
  | 'RETRYABLE_SDK_ERROR';

export class PlatformError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode) {
    super(code);
    this.name = 'PlatformError';
    this.code = code;
  }
}

type GameUserKeyResult = Awaited<ReturnType<typeof getUserKeyForGame>>;

export interface AppsInTossSdk {
  readonly SafeAreaInsets: {
    get(): SafeArea;
    subscribe(options: { onEvent: (value: SafeArea) => void }): () => void;
  };
  closeView(): Promise<void>;
  generateHapticFeedback(options: { type: HapticType }): Promise<void>;
  getUserKeyForGame(): Promise<GameUserKeyResult>;
  setDeviceOrientation(options: { type: 'portrait' | 'landscape' }): Promise<void>;
}

const defaultSdk: AppsInTossSdk = {
  SafeAreaInsets,
  closeView,
  generateHapticFeedback,
  getUserKeyForGame,
  setDeviceOrientation,
};

export function createAppsInTossPlatform(
  sdk: AppsInTossSdk = defaultSdk,
): PlatformPort {
  return {
    kind: 'apps-in-toss',

    async getIdentity(): Promise<UserIdentity> {
      const result = await sdk.getUserKeyForGame();
      if (result === undefined) throw new PlatformError('UPDATE_REQUIRED');
      if (result === 'INVALID_CATEGORY') throw new PlatformError('INVALID_CATEGORY');
      if (result === 'ERROR') throw new PlatformError('RETRYABLE_SDK_ERROR');
      return { kind: 'apps-in-toss', key: result.hash };
    },

    getInitialSafeArea(): SafeArea {
      return sdk.SafeAreaInsets.get();
    },

    subscribeSafeArea(listener: (value: SafeArea) => void): () => void {
      return sdk.SafeAreaInsets.subscribe({ onEvent: listener });
    },

    lockPortrait(): Promise<void> {
      return sdk.setDeviceOrientation({ type: 'portrait' });
    },

    haptic(type: HapticType): Promise<void> {
      return sdk.generateHapticFeedback({ type });
    },

    close(): Promise<void> {
      return sdk.closeView();
    },
  };
}
