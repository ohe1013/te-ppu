import { App } from '@capacitor/app';
import type {
  HapticType,
  PlatformPort,
  SafeArea,
  UserIdentity,
} from './platform-port';

const ZERO_SAFE_AREA: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

export interface AndroidBackListenerHandle {
  remove(): Promise<void>;
}

export interface AndroidAppSdk {
  addListener(
    eventName: 'backButton',
    listener: () => void,
  ): Promise<AndroidBackListenerHandle>;
  exitApp(): Promise<void>;
}

const defaultSdk: AndroidAppSdk = {
  addListener(eventName, listener) {
    return App.addListener(eventName, listener);
  },
  exitApp() {
    return App.exitApp();
  },
};

export function createAndroidPlatform(
  sdk: AndroidAppSdk = defaultSdk,
): PlatformPort {
  return {
    kind: 'android',

    async getIdentity(): Promise<UserIdentity> {
      return { kind: 'local', key: 'local-browser' };
    },

    getInitialSafeArea(): SafeArea {
      return ZERO_SAFE_AREA;
    },

    subscribeSafeArea(): () => void {
      return () => undefined;
    },

    subscribeBackRequest(listener: () => void): () => void {
      let active = true;
      let cleanedUp = false;
      const handle = sdk.addListener('backButton', () => {
        if (active) listener();
      });

      return () => {
        if (cleanedUp) return;
        cleanedUp = true;
        active = false;
        void handle.then((registered) => registered.remove()).catch(() => undefined);
      };
    },

    async lockPortrait(): Promise<void> {},

    async haptic(_type: HapticType): Promise<void> {},

    close(): Promise<void> {
      return sdk.exitApp();
    },
  };
}
