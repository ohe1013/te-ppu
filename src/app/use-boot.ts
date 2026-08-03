import { useCallback, useEffect, useState } from 'react';
import type { ProgressState } from '../progression';
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

export function useBoot({ platform, progressRepository, assetManager }: AppServices): BootState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        const assetLoad = Promise.resolve()
          .then(() => assetManager.loadCommon())
          .catch((): 'fallback' => 'fallback');
        const [, identity, loadResult] = await Promise.all([
          platform.lockPortrait(),
          platform.getIdentity(),
          progressRepository.load(),
          assetLoad,
        ]);
        if (!active) return;

        const notice = loadResult.ok
          ? loadResult.recoveredFromCorruption ? RECOVERY_NOTICE : null
          : LOAD_FAILURE_NOTICE;
        setState({
          status: 'ready',
          identity,
          progress: loadResult.state,
          notice,
        });
      } catch (error) {
        if (!active) return;
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
  }, [assetManager, attempt, platform, progressRepository, retry]);

  return state;
}
