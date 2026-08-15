// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMatch,
  createPublicMatchView,
  type PublicMatchView,
  type SideId,
} from '../../core/index';
import type { GameEventBatch } from '../../app/use-match-loop';
import {
  useAttackFeedback,
  type UseAttackFeedbackOptions,
} from './use-attack-feedback';

class FrameClock {
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  private nextHandle = 1;
  private timestamp = 0;

  install(): void {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.callbacks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      this.callbacks.delete(handle);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => this.timestamp);
  }

  advanceBy(milliseconds: number): void {
    this.timestamp += milliseconds;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    act(() => {
      for (const callback of callbacks) callback(this.timestamp);
    });
  }

  get pendingFrames(): number {
    return this.callbacks.size;
  }
}

function viewAt(tick: number, comboFor: SideId = 'player', combo = 1): PublicMatchView {
  const view = createPublicMatchView(createMatch({ countdownTicks: 0, matchSeed: 41 }));
  return {
    ...view,
    tick,
    sides: {
      ...view.sides,
      [comboFor]: {
        ...view.sides[comboFor],
        combo,
      },
    },
  };
}

function batch(tick: number, side: SideId = 'player', amount = 1): GameEventBatch {
  return {
    tick,
    events: [{ type: 'attack-sent', side, amount }],
    view: viewAt(tick, side),
  };
}

function FeedbackProbe(props: UseAttackFeedbackOptions) {
  const feedback = useAttackFeedback(props);
  return (
    <output data-testid="feedback">
      {feedback === null
        ? 'none'
        : `${feedback.id}:${feedback.phase}:${feedback.displacementPx}`}
    </output>
  );
}

let clock: FrameClock;

beforeEach(() => {
  clock = new FrameClock();
  clock.install();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useAttackFeedback', () => {
  it('starts one attack in its launch phase', () => {
    render(<FeedbackProbe eventBatches={[batch(7)]} reducedMotion={false} />);

    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:7:0:launch:2');
    expect(clock.pendingFrames).toBe(1);
  });

  it('fires impact exactly once when launch crosses 150 ms', () => {
    const onImpact = vi.fn();
    render(
      <FeedbackProbe
        eventBatches={[batch(8)]}
        onImpact={onImpact}
        reducedMotion={false}
      />,
    );

    clock.advanceBy(149);
    expect(onImpact).not.toHaveBeenCalled();

    clock.advanceBy(1);
    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:8:0:impact:2');
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(onImpact).toHaveBeenCalledWith(expect.objectContaining({ id: 'attack:8:0' }));

    clock.advanceBy(20);
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it('does not restart or repeat impact when the same batch is rerendered', () => {
    const attack = batch(9);
    const onImpact = vi.fn();
    const { rerender } = render(
      <FeedbackProbe
        eventBatches={[attack]}
        onImpact={onImpact}
        reducedMotion={false}
      />,
    );
    clock.advanceBy(150);

    rerender(
      <FeedbackProbe
        eventBatches={[attack]}
        onImpact={onImpact}
        reducedMotion={false}
      />,
    );
    clock.advanceBy(1);

    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:9:0:impact:2');
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it('plays catch-up batches in tick order without dropping either cue', () => {
    const onImpact = vi.fn();
    render(
      <FeedbackProbe
        eventBatches={[batch(12, 'opponent'), batch(10, 'player')]}
        onImpact={onImpact}
        reducedMotion={false}
      />,
    );

    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:10:0:launch');
    clock.advanceBy(150);
    expect(onImpact).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'attack:10:0' }));

    clock.advanceBy(220);
    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:12:0:launch');
    clock.advanceBy(150);
    expect(onImpact).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'attack:12:0' }));
  });

  it('keeps semantic phases but removes displacement for reduced motion', () => {
    const onImpact = vi.fn();
    render(
      <FeedbackProbe
        eventBatches={[batch(13, 'player', 5)]}
        onImpact={onImpact}
        reducedMotion
      />,
    );

    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:13:0:launch:0');
    clock.advanceBy(150);
    expect(screen.getByTestId('feedback')).toHaveTextContent('attack:13:0:impact:0');
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending animation frame on unmount', () => {
    const { unmount } = render(
      <FeedbackProbe eventBatches={[batch(14)]} reducedMotion={false} />,
    );
    expect(clock.pendingFrames).toBe(1);

    unmount();

    expect(clock.pendingFrames).toBe(0);
  });

  it('stops reentrant RAF work when impact synchronously unmounts with a cue queued', () => {
    let unmount: () => void = () => undefined;
    const onImpact = vi.fn(() => unmount());
    ({ unmount } = render(
      <FeedbackProbe
        eventBatches={[batch(15), batch(16)]}
        onImpact={onImpact}
        reducedMotion={false}
      />,
    ));

    clock.advanceBy(150);

    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(clock.pendingFrames).toBe(0);

    clock.advanceBy(1_000);
    expect(onImpact).toHaveBeenCalledTimes(1);
    expect(clock.pendingFrames).toBe(0);
  });
});
