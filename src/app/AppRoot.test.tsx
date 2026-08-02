// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ProgressLoadResult,
  ProgressRepository,
  ProgressSaveResult,
  ProgressState,
  Floor,
} from '../progression/index';
import { PlatformError } from '../platform/apps-in-toss-platform';
import type { PlatformPort } from '../platform/platform-port';
import {
  AppRoot,
  type MatchRouteViewProps,
} from './AppRoot';
import type { AppServices } from './app-services';

vi.mock('../render/BattleCanvas', () => ({
  BattleCanvas: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const floorOneProgress: ProgressState = {
  schemaVersion: 2,
  highestUnlockedFloor: 1,
  clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

const floorThreeProgress: ProgressState = {
  schemaVersion: 2,
  highestUnlockedFloor: 3,
  clearedFloors: { 1: true, 2: true, 3: false, 4: false, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

const floorFourProgress: ProgressState = {
  schemaVersion: 2,
  highestUnlockedFloor: 4,
  clearedFloors: { 1: true, 2: true, 3: true, 4: false, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
};

const floorFiveProgress: ProgressState = {
  schemaVersion: 2,
  highestUnlockedFloor: 5,
  clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
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

class DeferredSaveRepository extends TestProgressRepository {
  private readonly pendingSave: Promise<ProgressSaveResult>;
  private settlePendingSave: ((result: ProgressSaveResult) => void) | undefined;

  constructor(initial: ProgressState) {
    super(initial);
    this.pendingSave = new Promise((resolve) => {
      this.settlePendingSave = resolve;
    });
  }

  override async save(state: ProgressState): Promise<ProgressSaveResult> {
    this.saves.push(cloneProgress(state));
    return this.pendingSave;
  }

  settle(result: ProgressSaveResult) {
    this.settlePendingSave?.(result);
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

async function enterMatch(
  user: ReturnType<typeof userEvent.setup>,
  floor: Floor,
  reactionMs: number,
) {
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

  it('mounts the real match screen through the default production route', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const repository = new TestProgressRepository(floorOneProgress);
    const services: AppServices = {
      platform: createTestPlatform(),
      progressRepository: repository,
    };
    render(
      <AppRoot
        services={services}
        createMatchSeed={() => 117}
      />,
    );

    await enterMatch(user, 1, 800);

    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-floor', '1');
    expect(screen.getByRole('region', { name: 'PLAYER battle status' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'RIVAL battle status' }))
      .toBeInTheDocument();
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });

  it('passes live settings to a match and persists match settings through TowerController', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    const services: AppServices = {
      platform: createTestPlatform(),
      progressRepository: repository,
    };
    render(
      <AppRoot
        services={services}
        createMatchSeed={() => 119}
        renderMatch={(props) => (
          <section data-testid="settings-match">
            <span>{String(props.settings.soundEnabled)}</span>
            <button
              type="button"
              onClick={() => void props.onSettingsChange({ soundEnabled: false })}
            >
              disable sound
            </button>
          </section>
        )}
      />,
    );

    await screen.findByTestId('tower-screen');
    await user.click(screen.getByRole('button', { name: '1층 선택' }));
    await user.click(screen.getByRole('button', { name: '대전 시작' }));
    expect(screen.getByTestId('settings-match')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'disable sound' }));

    await waitFor(() => expect(repository.saves).toHaveLength(1));
    expect(repository.saves[0]?.settings).toEqual({
      hapticsEnabled: true,
      soundEnabled: false,
    });
    expect(screen.getByText('false')).toBeInTheDocument();
  });

  it('routes tower to intro, match, result, retry, and back to tower', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository({
      ...floorOneProgress,
      clearedFloors: { 1: true, 2: false, 3: false, 4: false, 5: false },
    });
    renderGame(repository);

    await enterMatch(user, 1, 800);
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

  it.each([
    ['cleared replay', floorThreeProgress, 1, '클리어 완료 · 재도전 가능'],
    ['available', floorThreeProgress, 3, '도전 가능'],
    ['locked', floorOneProgress, 2, '잠김'],
  ] as const)('exposes the %s floor status to assistive technology', async (
    _name,
    initialProgress,
    floor,
    description,
  ) => {
    renderGame(new TestProgressRepository(initialProgress));

    await screen.findByTestId('tower-screen');
    expect(screen.getByRole('button', {
      name: `${floor}층 선택`,
      description,
    })).toBeInTheDocument();
  });

  it('renders all five floor choices with floor four available and floor five locked', async () => {
    renderGame(new TestProgressRepository(floorFourProgress));

    await screen.findByTestId('tower-screen');
    expect(screen.getAllByRole('button', { name: /층 선택/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
    expect(screen.getByRole('button', {
      name: '3층 선택',
      description: '클리어 완료 · 재도전 가능',
    })).toBeEnabled();
  });

  it.each([
    [1, floorOneProgress, 800],
    [2, floorThreeProgress, 633],
    [3, floorThreeProgress, 450],
    [4, floorFourProgress, 317],
    [5, floorFiveProgress, 200],
  ] as const)('shows the exact floor-%i AI reaction timing', async (
    floor,
    initialProgress,
    reactionMs,
  ) => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(initialProgress));

    await enterMatch(user, floor, reactionMs);
  });

  it.each(['loss', 'draw'] as const)('does not unlock floor two after a %s', async (result) => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await enterMatch(user, 1, 800);
    await user.click(screen.getByRole('button', { name: `finish ${result}` }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();
    expect(repository.saves[0]).toMatchObject({
      highestUnlockedFloor: 1,
      clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
    });
  });

  it('unlocks floors four and five through victories without ending early', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorThreeProgress);
    renderGame(repository);

    await enterMatch(user, 3, 450);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();

    await enterMatch(user, 4, 317);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeEnabled();
  });

  it('reaches the ending after a floor-five victory', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await enterMatch(user, 5, 200);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByTestId('ending-screen')).toBeInTheDocument();
  });

  it.each(['loss', 'draw'] as const)(
    'returns to the tower instead of ending after a floor-five %s',
    async (result) => {
      const user = userEvent.setup();
      const repository = new TestProgressRepository(floorFiveProgress);
      renderGame(repository);

      await enterMatch(user, 5, 200);
      await user.click(screen.getByRole('button', { name: `finish ${result}` }));
      await screen.findByTestId('result-screen');
      await waitFor(() => expect(repository.saves).toHaveLength(1));
      await user.click(screen.getByRole('button', { name: '계속' }));

      expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('ending-screen')).not.toBeInTheDocument();
    },
  );

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

    await enterMatch(user, 1, 800);
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

  it('keeps result navigation locked until a deferred save settles as failed', async () => {
    const user = userEvent.setup();
    const repository = new DeferredSaveRepository(floorOneProgress);
    renderGame(repository);

    await enterMatch(user, 1, 800);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('result-screen');

    expect(screen.getByRole('status')).toHaveTextContent('진행 상황 저장 중');
    expect(screen.getByRole('button', { name: '다시 대전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '계속' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '계속' }));
    expect(screen.getByTestId('result-screen')).toBeInTheDocument();

    await act(async () => repository.settle({
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    }));

    expect(await screen.findByRole('button', { name: '저장 다시 시도' })).toBeInTheDocument();
    expect(screen.getByTestId('result-screen')).toBeInTheDocument();
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
