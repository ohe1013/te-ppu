// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PlatformPort, SafeArea } from './platform-port';
import { SafeAreaProvider, useSafeArea } from './safe-area-provider';

function SafeAreaProbe() {
  const safeArea = useSafeArea();
  return <output data-testid="safe-area-value">{JSON.stringify(safeArea)}</output>;
}

function fakePlatform(initial: SafeArea) {
  let listener: ((value: SafeArea) => void) | null = null;
  let cleanupCount = 0;
  const platform: PlatformPort = {
    kind: 'browser',
    getIdentity: async () => ({ kind: 'local', key: 'local-browser' }),
    getInitialSafeArea: () => initial,
    subscribeSafeArea: (next) => {
      listener = next;
      return () => {
        cleanupCount += 1;
        listener = null;
      };
    },
    lockPortrait: async () => undefined,
    haptic: async () => undefined,
    close: async () => undefined,
  };

  return {
    platform,
    emit(value: SafeArea) {
      listener?.(value);
    },
    get cleanupCount() {
      return cleanupCount;
    },
  };
}

describe('SafeAreaProvider', () => {
  it('updates CSS insets, reserves the native close area, and unsubscribes', () => {
    const fake = fakePlatform({ top: 47, right: 3, bottom: 21, left: 2 });
    const { unmount } = render(
      <SafeAreaProvider platform={fake.platform}>
        <SafeAreaProbe />
      </SafeAreaProvider>,
    );
    const host = screen.getByTestId('safe-area-value').parentElement;

    expect(host).toHaveStyle({
      '--safe-area-top': '47px',
      '--safe-area-right': '3px',
      '--safe-area-bottom': '21px',
      '--safe-area-left': '2px',
      '--native-close-exclusion-top': '57px',
      '--native-close-exclusion-right': '13px',
    });

    act(() => fake.emit({ top: 51, right: 4, bottom: 22, left: 3 }));
    expect(screen.getByTestId('safe-area-value')).toHaveTextContent(
      '{"top":51,"right":4,"bottom":22,"left":3}',
    );

    unmount();
    expect(fake.cleanupCount).toBe(1);
  });
});
