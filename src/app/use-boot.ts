import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressRepository, ProgressState } from '../progression';
import {
  PlatformError,
  type PlatformErrorCode,
} from '../platform/apps-in-toss-platform';
import type { UserIdentity } from '../platform/platform-port';
import type { AppServices } from './app-services';

export type BootState =
  | { status: 'loading' }
  | {
    status: 'ready';
    identity: UserIdentity;
    progress: ProgressState;
    progressRepository: ProgressRepository;
    notice: string | null;
  }
  | {
    status: 'blocked';
    code: 'UPDATE_REQUIRED' | 'INVALID_CATEGORY';
    message: string;
  }
  | { status: 'retryable-error'; retry: () => void; message: string };

const BLOCKED_MESSAGES: Record<'UPDATE_REQUIRED' | 'INVALID_CATEGORY', string> = {
  UPDATE_REQUIRED: 'Update Toss to continue.',
  INVALID_CATEGORY: 'This app is not registered as a game.',
};

const RETRYABLE_MESSAGE = 'The game service is temporarily unavailable.';
const LOAD_FAILURE_NOTICE = 'Progress is available in memory, but persistence could not be loaded.';
const RECOVERY_NOTICE = 'Corrupt saved progress was backed up and reset.';

function blockedCode(
  code: PlatformErrorCode,
): 'UPDATE_REQUIRED' | 'INVALID_CATEGORY' | null {
  if (code === 'UPDATE_REQUIRED' || code === 'INVALID_CATEGORY') return code;
  return null;
}

export function useBoot({
  platform,
  progressRepositoryFactory,
  assetManager,
}: AppServices): BootState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const attemptTokenRef = useRef(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const attemptToken = ++attemptTokenRef.current;

    async function boot() {
      try {
        const portraitResultPromise = platform.lockPortrait().then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        const commonAssetsPromise = Promise.resolve()
          .then(() => assetManager.loadCommon())
          .catch((): 'fallback' => 'fallback');
        const identity = await platform.getIdentity();
        if (!active || attemptToken !== attemptTokenRef.current) return;
        const progressRepository = progressRepositoryFactory.forIdentity(identity);
        const [portraitResult, , loadResult] = await Promise.all([
          portraitResultPromise,
          commonAssetsPromise,
          progressRepository.load(),
        ]);
        if (!active || attemptToken !== attemptTokenRef.current) return;
        if (!portraitResult.ok) throw portraitResult.error;

        const notice = loadResult.ok
          ? loadResult.recoveredFromCorruption ? RECOVERY_NOTICE : null
          : LOAD_FAILURE_NOTICE;
        setState({
          status: 'ready',
          identity,
          progress: loadResult.state,
          progressRepository,
          notice,
        });
      } catch (error) {
        if (!active || attemptToken !== attemptTokenRef.current) return;
        if (error instanceof PlatformError) {
          const code = blockedCode(error.code);
          if (code !== null) {
            setState({ status: 'blocked', code, message: BLOCKED_MESSAGES[code] });
            return;
          }
        }
        setState({ status: 'retryable-error', retry, message: RETRYABLE_MESSAGE });
      }
    }

    void boot();
    return () => {
      active = false;
    };
  }, [assetManager, attempt, platform, progressRepositoryFactory, retry]);

  return state;
}
