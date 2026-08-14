// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatformPort } from './platform-port';
import { PlatformBackProvider, usePlatformBack } from './back-request';

afterEach(cleanup);

function createBackPlatform() {
  let listener: (() => void) | undefined;
  let subscribeCount = 0;
  let cleanupCount = 0;

  const platform: PlatformPort = {
    kind: 'android',
    close: async () => undefined,
    getIdentity: async () => ({ kind: 'local', key: 'local-browser' }),
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    haptic: async () => undefined,
    lockPortrait: async () => undefined,
    subscribeBackRequest(nextListener) {
      subscribeCount += 1;
      listener = nextListener;
      return () => {
        cleanupCount += 1;
        listener = undefined;
      };
    },
    subscribeSafeArea: () => () => undefined,
  };

  return {
    platform,
    emitBack() {
      listener?.();
    },
    get cleanupCount() {
      return cleanupCount;
    },
    get subscribeCount() {
      return subscribeCount;
    },
  };
}

function Harness({
  calls,
  enabled = true,
  label,
  priority,
}: {
  readonly calls: string[];
  readonly enabled?: boolean;
  readonly label: string;
  readonly priority: number;
}) {
  usePlatformBack(() => calls.push(label), { enabled, priority });
  return null;
}

describe('PlatformBackProvider', () => {
  it('subscribes once and dispatches only to the highest-priority enabled handler', () => {
    const back = createBackPlatform();
    const calls: string[] = [];
    const view = render(
      <PlatformBackProvider platform={back.platform}>
        <Harness calls={calls} label="screen" priority={10} />
        <Harness calls={calls} label="modal" priority={100} />
      </PlatformBackProvider>,
    );

    act(() => back.emitBack());
    expect(calls).toEqual(['modal']);
    expect(back.subscribeCount).toBe(1);

    view.rerender(
      <PlatformBackProvider platform={back.platform}>
        <Harness calls={calls} label="screen" priority={10} />
        <Harness calls={calls} enabled={false} label="modal" priority={100} />
      </PlatformBackProvider>,
    );
    act(() => back.emitBack());
    expect(calls).toEqual(['modal', 'screen']);
    expect(back.subscribeCount).toBe(1);

    view.unmount();
    expect(back.cleanupCount).toBe(1);
  });

  it('uses the latest callback without replacing the platform subscription', () => {
    const back = createBackPlatform();
    const calls: string[] = [];
    const view = render(
      <PlatformBackProvider platform={back.platform}>
        <Harness calls={calls} label="first" priority={10} />
      </PlatformBackProvider>,
    );

    view.rerender(
      <PlatformBackProvider platform={back.platform}>
        <Harness calls={calls} label="latest" priority={10} />
      </PlatformBackProvider>,
    );
    act(() => back.emitBack());

    expect(calls).toEqual(['latest']);
    expect(back.subscribeCount).toBe(1);
  });

  it('uses the newest registration when enabled handlers share a priority', () => {
    const back = createBackPlatform();
    const calls: string[] = [];
    render(
      <PlatformBackProvider platform={back.platform}>
        <Harness calls={calls} label="older" priority={10} />
        <Harness calls={calls} label="newer" priority={10} />
      </PlatformBackProvider>,
    );

    act(() => back.emitBack());
    expect(calls).toEqual(['newer']);
  });

  it('is inert when rendered without a provider', () => {
    const calls: string[] = [];
    render(<Harness calls={calls} label="orphan" priority={10} />);
    expect(calls).toEqual([]);
  });
});
