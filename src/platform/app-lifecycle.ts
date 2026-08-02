import type { AudioPort } from './audio-port';

type BackgroundSource = 'visibility' | 'page' | 'focus';

export interface AppLifecycleOptions {
  readonly audio: Pick<AudioPort, 'resume' | 'suspend'>;
  readonly countdownStepMs?: number;
  readonly documentTarget?: Document;
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
  onCountdownChange,
  resetAll,
  setPaused,
  windowTarget = window,
}: AppLifecycleOptions): AppLifecycleCoordinator {
  const sources = new Set<BackgroundSource>();
  let phase: 'foreground' | 'background' | 'countdown' | 'destroyed' = 'foreground';
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function clearCountdown(): void {
    generation += 1;
    if (countdownTimer !== null) clearTimeout(countdownTimer);
    countdownTimer = null;
  }

  function enterBackground(): void {
    if (phase === 'destroyed' || phase === 'background') return;
    clearCountdown();
    phase = 'background';
    onCountdownChange(null);
    setPaused('background', true);
    resetAll();
    ignoreRejection(() => audio.suspend());
  }

  function finishCountdown(expectedGeneration: number): void {
    countdownTimer = null;
    void (async () => {
      try {
        await audio.resume();
      } catch {
        // Audio availability must never keep the match permanently paused.
      }
      if (
        phase !== 'countdown'
        || generation !== expectedGeneration
        || sources.size > 0
      ) return;
      phase = 'foreground';
      onCountdownChange(null);
      // setPaused resets the match loop frame timestamp before it unpauses.
      setPaused('background', false);
    })();
  }

  function beginCountdown(): void {
    if (phase !== 'background' || sources.size > 0) return;
    clearCountdown();
    phase = 'countdown';
    const expectedGeneration = generation;
    let count = 3;
    onCountdownChange(count);

    const advance = () => {
      countdownTimer = setTimeout(() => {
        if (phase !== 'countdown' || generation !== expectedGeneration) return;
        if (count > 1) {
          count -= 1;
          onCountdownChange(count);
          advance();
          return;
        }
        finishCountdown(expectedGeneration);
      }, countdownStepMs);
    };
    advance();
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
