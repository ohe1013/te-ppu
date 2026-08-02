// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ProgressLoadResult,
  ProgressRepository,
  ProgressSaveResult,
  ProgressState,
} from '../progression/index';
import { PlatformError } from '../platform/apps-in-toss-platform';
import type { PlatformPort } from '../platform/platform-port';
import {
  AppRoot,
  type MatchRouteViewProps,
} from './AppRoot';
import type { AppServices } from './app-services';

afterEach(cleanup);

const floorOneProgress: ProgressState = {
  schemaVersion: 1,
  highestUnlockedFloor: 1,
  clearedFloors: { 1: false, 2: false, 3: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

const floorThreeProgress: ProgressState = {
  schemaVersion: 1,
  highestUnlockedFloor: 3,
  clearedFloors: { 1: true, 2: true, 3: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

function cloneProgress(state: ProgressState): ProgressState {
  return {
    ...state,
    clearedFloors: { ...state.clearedFloors },
    settings: { ...state.settings },
  };
}

class TestProgressRepository implements ProgressRepository {
  readonly saves: ProgressState[] = [];

  constructor(
    private readonly initial: ProgressState,
    private readonly saveResults: ProgressSaveResult[] = [],
  ) {}

  async load(): Promise<ProgressLoadResult> {
    return {
      ok: true,
      state: cloneProgress(this.initial),
      recoveredFromCorruption: false,
    };
  }

  async save(state: ProgressState): Promise<ProgressSaveResult> {
    this.saves.push(cloneProgress(state));
    return this.saveResults.shift() ?? { ok: true };
  }
}

function createTestPlatform(
  getIdentity: PlatformPort['getIdentity'] = async () => ({
    kind: 'local',
    key: 'local-browser',
  }),
): PlatformPort {
  return {
    kind: 'browser',
    getIdentity,
    getInitialSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    subscribeSafeArea: () => () => undefined,
    lockPortrait: async () => undefined,
    haptic: async () => undefined,
    close: async () => undefined,
  };
}

function TestMatch({ floor, onFinished }: MatchRouteViewProps): ReactNode {
  return (
    <section data-testid="match-screen">
      <h1>{floor}층 대전</h1>
      <button type="button" onClick={() => void onFinished('win')}>finish win</button>
      <button type="button" onClick={() => void onFinished('loss')}>finish loss</button>
      <button type="button" onClick={() => void onFinished('draw')}>finish draw</button>
    </section>
  );
}

function renderGame(
  repository: ProgressRepository,
  platform: PlatformPort = createTestPlatform(),
) {
  let seed = 100;
  const services: AppServices = { platform, progressRepository: repository };
  return render(
    <AppRoot
      services={services}
      createMatchSeed={() => seed++}
      renderMatch={(props) => <TestMatch {...props} />}
    />,
  );
}

async function enterMatch(user: ReturnType<typeof userEvent.setup>, floor: 1 | 2 | 3) {
  const reactionMs = { 1: 800, 2: 450, 3: 200 }[floor];
  await screen.findByTestId('tower-screen');
  await user.click(screen.getByRole('button', { name: `${floor}층 선택` }));
  expect(screen.getByTestId('floor-intro-screen')).toBeInTheDocument();
  expect(screen.getByText(`AI 반응 간격: ${reactionMs}ms`)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  expect(screen.getByTestId('match-screen')).toBeInTheDocument();
}

describe('AppRoot', () => {
  it('mounts the app shell while boot work is still pending', () => {
    const never = new Promise<never>(() => undefined);
    const repository = new TestProgressRepository(floorOneProgress);
    const { unmount } = renderGame(repository, createTestPlatform(() => never));

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('boot-screen')).toBeInTheDocument();
    unmount();
  });

  it('routes tower to intro, match, result, retry, and back to tower', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository({
      ...floorOneProgress,
      clearedFloors: { 1: true, 2: false, 3: false },
    });
    renderGame(repository);

    await enterMatch(user, 1);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: '다시 대전' }));
    expect(screen.getByTestId('match-screen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeEnabled();
  });

  it.each(['loss', 'draw'] as const)('does not unlock floor two after a %s', async (result) => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await enterMatch(user, 1);
    await user.click(screen.getByRole('button', { name: `finish ${result}` }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();
    expect(repository.saves[0]).toMatchObject({
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false },
    });
  });

  it('shows the ending after a floor-three victory', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorThreeProgress);
    renderGame(repository);

    await enterMatch(user, 3);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByTestId('ending-screen')).toBeInTheDocument();
  });

  it('renders in-memory progress and retries a failed save through TowerController', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress, [
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    renderGame(repository);

    await enterMatch(user, 1);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    expect(screen.getByText('최고 해금 층: 2')).toBeInTheDocument();
    const retrySave = await screen.findByRole('button', { name: '저장 다시 시도' });

    await user.click(retrySave);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '저장 다시 시도' })).not.toBeInTheDocument();
    });
    expect(repository.saves).toHaveLength(2);
    expect(repository.saves[1]).toEqual(repository.saves[0]);
  });

  it('keeps retryable boot errors inside the app shell and retries them', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const platform = createTestPlatform(async () => {
      attempts += 1;
      if (attempts === 1) throw new PlatformError('RETRYABLE_SDK_ERROR');
      return { kind: 'apps-in-toss', key: 'user-7' };
    });
    renderGame(new TestProgressRepository(floorOneProgress), platform);

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retry);

    await screen.findByTestId('tower-screen');
    expect(attempts).toBe(2);
  });
});
