import type { AudioPort } from './audio-port';

type BackgroundSource = 'visibility' | 'page' | 'focus';

export interface AppLifecycleOptions {
  readonly audio: Pick<AudioPort, 'resume' | 'suspend'>;
  readonly countdownStepMs?: number;
  readonly documentTarget?: Document;
  readonly now?: () => number;
  readonly onBackgroundChange?: (backgrounded: boolean) => void;
  readonly onCountdownChange: (count: number | null) => void;
  readonly resetAll: () => void;
  readonly setPaused: (reason: 'background', paused: boolean) => void;
  readonly windowTarget?: Window;
}

export interface AppLifecycleCoordinator {
  destroy(): void;
}

function ignoreRejection(operation: () => Promise<void>): void {
  try {
    void operation().catch(() => undefined);
  } catch {
    // Browser/SDK lifecycle effects are deliberately non-fatal.
  }
}

export function createAppLifecycleCoordinator({
  audio,
  countdownStepMs = 1_000,
  documentTarget = document,
  now = Date.now,
  onBackgroundChange,
  onCountdownChange,
  resetAll,
  setPaused,
  windowTarget = window,
}: AppLifecycleOptions): AppLifecycleCoordinator {
  const sources = new Set<BackgroundSource>();
  let phase: 'foreground' | 'background' | 'countdown' | 'destroyed' = 'foreground';
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownDeadline = 0;
  let publishedCountdown: number | null = null;
  let generation = 0;
  const stepMs = Number.isFinite(countdownStepMs)
    ? Math.max(1, Math.floor(countdownStepMs))
    : 1_000;

  function clearCountdown(): void {
    generation += 1;
    if (countdownTimer !== null) clearTimeout(countdownTimer);
    countdownTimer = null;
    countdownDeadline = 0;
    publishedCountdown = null;
  }

  function enterBackground(): void {
    if (phase === 'destroyed' || phase === 'background') return;
    clearCountdown();
    phase = 'background';
    onBackgroundChange?.(true);
    onCountdownChange(null);
    setPaused('background', true);
    resetAll();
    ignoreRejection(() => audio.suspend());
  }

  function finishCountdown(expectedGeneration: number): void {
    countdownTimer = null;
    if (
      phase !== 'countdown'
      || generation !== expectedGeneration
      || sources.size > 0
    ) return;
    phase = 'foreground';
    onBackgroundChange?.(false);
    countdownDeadline = 0;
    publishedCountdown = null;
    onCountdownChange(null);
    // Audio and match time resume in the same turn. A slow or rejected audio
    // operation never owns the deterministic match clock.
    ignoreRejection(() => audio.resume());
    // setPaused resets the match-loop frame timestamp before it unpauses.
    setPaused('background', false);
  }

  function advanceCountdown(expectedGeneration: number): void {
    if (
      phase !== 'countdown'
      || generation !== expectedGeneration
      || sources.size > 0
    ) return;
    const remaining = countdownDeadline - now();
    if (remaining <= 0) {
      finishCountdown(expectedGeneration);
      return;
    }
    const count = Math.min(3, Math.max(1, Math.ceil(remaining / stepMs)));
    if (count !== publishedCountdown) {
      publishedCountdown = count;
      onCountdownChange(count);
    }
    const untilNextBoundary = remaining - ((count - 1) * stepMs);
    countdownTimer = setTimeout(
      () => advanceCountdown(expectedGeneration),
      Math.max(1, Math.ceil(untilNextBoundary)),
    );
  }

  function beginCountdown(): void {
    if (phase !== 'background' || sources.size > 0) return;
    clearCountdown();
    phase = 'countdown';
    const expectedGeneration = generation;
    countdownDeadline = now() + (3 * stepMs);
    advanceCountdown(expectedGeneration);
  }

  function markBackground(source: BackgroundSource): void {
    if (phase === 'destroyed') return;
    const wasEmpty = sources.size === 0;
    sources.add(source);
    if (wasEmpty || phase === 'countdown') enterBackground();
  }

  function markForeground(source: BackgroundSource): void {
    if (phase === 'destroyed') return;
    sources.delete(source);
    if (sources.size === 0) beginCountdown();
  }

  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === 'hidden') markBackground('visibility');
    else markForeground('visibility');
  };
  const onPageHide = () => markBackground('page');
  const onPageShow = () => markForeground('page');
  const onBlur = () => markBackground('focus');
  const onFocus = () => markForeground('focus');

  documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  windowTarget.addEventListener('pagehide', onPageHide);
  windowTarget.addEventListener('pageshow', onPageShow);
  windowTarget.addEventListener('blur', onBlur);
  windowTarget.addEventListener('focus', onFocus);

  if (documentTarget.visibilityState === 'hidden') markBackground('visibility');

  return {
    destroy() {
      if (phase === 'destroyed') return;
      clearCountdown();
      phase = 'destroyed';
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
      windowTarget.removeEventListener('pagehide', onPageHide);
      windowTarget.removeEventListener('pageshow', onPageShow);
      windowTarget.removeEventListener('blur', onBlur);
      windowTarget.removeEventListener('focus', onFocus);
    },
  };
}
