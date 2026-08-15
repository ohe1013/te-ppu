// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './use-reduced-motion';

function MotionProbe() {
  return <output data-testid="motion">{String(useReducedMotion())}</output>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('falls back to false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    render(<MotionProbe />);

    expect(screen.getByTestId('motion')).toHaveTextContent('false');
  });

  it('publishes the initial preference and subsequent changes', () => {
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const query = {
      matches: true,
      addEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === 'change') changeListener = listener;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => query));

    render(<MotionProbe />);
    expect(screen.getByTestId('motion')).toHaveTextContent('true');

    act(() => changeListener?.({ matches: false } as MediaQueryListEvent));

    expect(screen.getByTestId('motion')).toHaveTextContent('false');
  });

  it('removes the exact change listener during cleanup', () => {
    let changeListener: EventListenerOrEventListenerObject | undefined;
    const query = {
      matches: false,
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') changeListener = listener;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => query));

    const { unmount } = render(<MotionProbe />);
    unmount();

    expect(query.removeEventListener).toHaveBeenCalledWith('change', changeListener);
  });
});
