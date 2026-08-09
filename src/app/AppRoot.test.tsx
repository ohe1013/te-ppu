// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetManager } from '../assets';
import {
  DEFAULT_PROGRESS,
  cloneProgressState,
  type ProgressLoadResult,
  type ProgressRepository,
  type ProgressRepositoryFactory,
  type ProgressSaveResult,
  type ProgressState,
  type Floor,
  getFloorEncounter,
} from '../progression/index';
import { PlatformError } from '../platform/apps-in-toss-platform';
import type { AudioPort } from '../platform/audio-port';
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
  vi.useRealTimers();
});

function progressFor(
  highestUnlockedFloor: 1 | 2 | 3 | 4 | 5,
  clearedFloors: ProgressState['difficultyProgress']['easy']['clearedFloors'],
): ProgressState {
  const progress = cloneProgressState(DEFAULT_PROGRESS);
  progress.difficultyProgress.easy = {
    highestUnlockedFloor,
    clearedFloors: { ...clearedFloors },
    owlDefeated: false,
  };
  progress.profile = { initials: 'RVT', characterId: 'hero-engineer' };
  return progress;
}

const floorOneProgress = progressFor(1, { 1: false, 2: false, 3: false, 4: false, 5: false });
const floorThreeProgress = progressFor(3, { 1: true, 2: true, 3: false, 4: false, 5: false });
const floorFourProgress = progressFor(4, { 1: true, 2: true, 3: true, 4: false, 5: false });
const floorFiveProgress = progressFor(5, { 1: true, 2: true, 3: true, 4: true, 5: false });

function cloneProgress(state: ProgressState): ProgressState {
  return cloneProgressState(state);
}

class TestProgressRepository implements ProgressRepository {
  loads = 0;
  readonly saves: ProgressState[] = [];

  constructor(
    private readonly initial: ProgressState,
    private readonly saveResults: ProgressSaveResult[] = [],
  ) {}

  async load(): Promise<ProgressLoadResult> {
    this.loads += 1;
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

function createAssetManager(
  loadCommon: AssetManager['loadCommon'] = async () => 'fallback',
): AssetManager {
  return {
    loadCommon,
    loadFloor: async () => 'fallback',
    prefetchFloor: () => undefined,
    releaseFloor: () => undefined,
    getCommonAssets: () => null,
    getFloorAssets: () => null,
    destroy: vi.fn(),
  };
}

function createAudioPort(): AudioPort {
  return {
    destroy: vi.fn(async () => undefined),
    play: vi.fn(),
    resume: vi.fn(async () => undefined),
    setEnabled: vi.fn(),
    setMusic: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
  };
}

function factoryFor(repository: ProgressRepository): ProgressRepositoryFactory {
  return { forIdentity: () => repository };
}

function TestMatch({ floor, encounterIndex, wins, onFinished, specialEncounter }: MatchRouteViewProps): ReactNode {
  const encounter = specialEncounter ?? getFloorEncounter(floor, encounterIndex);
  return (
    <section
      data-encounter-kind={specialEncounter === undefined ? 'floor' : 'owl'}
      data-testid="match-screen"
    >
      <h1>{floor}층 대전</h1>
      <h2>{encounter.displayName}</h2>
      <output data-testid="match-encounter">{encounterIndex}:{wins}</output>
      <button type="button" onClick={() => void onFinished('win')}>finish win</button>
      <button type="button" onClick={() => void onFinished('loss')}>finish loss</button>
      <button type="button" onClick={() => void onFinished('draw')}>finish draw</button>
    </section>
  );
}

function renderGame(
  repository: ProgressRepository,
  platform: PlatformPort = createTestPlatform(),
  assetManager: AssetManager = createAssetManager(),
  audioPort: AudioPort = createAudioPort(),
) {
  let seed = 100;
  const services: AppServices = {
    audioPort,
    platform,
    progressRepositoryFactory: factoryFor(repository),
    assetManager,
  };
  return render(
    <AppRoot
      services={services}
      createMatchSeed={() => seed++}
      renderMatch={(props) => <TestMatch {...props} />}
    />,
  );
}

async function enterTower(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByTestId('tower-screen') === null) {
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: 'START RUN' }));
  }
  await screen.findByTestId('tower-screen');
}

async function enterInitials(
  user: ReturnType<typeof userEvent.setup>,
  initials: string,
) {
  for (const initial of initials) {
    await user.click(screen.getByRole('button', { name: initial }));
  }
  await user.click(screen.getByRole('button', { name: 'END' }));
}

async function chooseCharacter(
  user: ReturnType<typeof userEvent.setup>,
  characterId: 'hero-engineer' | 'cloud-courier' | 'star-alchemist',
) {
  const card = document.querySelector<HTMLButtonElement>(
    `[data-character-id="${characterId}"]`,
  );
  if (card === null) throw new Error(`missing character card ${characterId}`);
  await user.click(card);
  await user.click(screen.getByRole('button', { name: 'SELECT' }));
}

async function enterMatch(
  user: ReturnType<typeof userEvent.setup>,
  floor: Floor,
  _reactionMs: number,
) {
  await enterTower(user);
  await user.click(screen.getByRole('button', { name: `${floor}층 선택` }));
  expect(screen.getByTestId('floor-intro-screen')).toBeInTheDocument();
  expect(screen.queryByText(/AI 반응 간격/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  expect(screen.getByTestId('match-screen')).toBeInTheDocument();
}

async function finishWin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'finish win' }));
  await screen.findByTestId('result-screen');
}

async function continueToNextEncounter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '다음 상대' }));
  await screen.findByTestId('floor-intro-screen');
  await user.click(screen.getByRole('button', { name: '대전 시작' }));
  await screen.findByTestId('match-screen');
}

async function completeFloor(
  user: ReturnType<typeof userEvent.setup>,
  continueAfterFinal = true,
) {
  for (let encounterIndex = 0; encounterIndex < 3; encounterIndex += 1) {
    await finishWin(user);
    if (encounterIndex < 2) {
      await continueToNextEncounter(user);
    }
  }
  if (continueAfterFinal) {
    await user.click(screen.getByRole('button', { name: '탑으로' }));
  }
}

describe('AppRoot', () => {
  it('shows title after boot and saves a first profile before entering the tower', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(DEFAULT_PROGRESS);
    renderGame(repository);

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(screen.queryByTestId('tower-screen')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'START RUN' }));
    expect(await screen.findByTestId('name-entry-screen')).toBeVisible();
    await enterInitials(user, 'RVT');
    expect(await screen.findByTestId('character-select-screen')).toBeVisible();
    await chooseCharacter(user, 'hero-engineer');

    expect(await screen.findByTestId('tower-screen')).toBeVisible();
    expect(repository.saves.at(-1)?.profile).toEqual({
      initials: 'RVT',
      characterId: 'hero-engineer',
    });
  });

  it('sends a returning player from title directly to the tower without another save', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'START RUN' }));

    expect(await screen.findByTestId('tower-screen')).toBeVisible();
    expect(screen.queryByTestId('name-entry-screen')).not.toBeInTheDocument();
    expect(repository.saves).toEqual([]);
  });

  it('persists PLAYER CHANGE and returns to title', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: 'PLAYER CHANGE' }));
    await enterInitials(user, 'LUM');
    await chooseCharacter(user, 'cloud-courier');

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(screen.getByText('LUM')).toBeInTheDocument();
    expect(repository.saves.at(-1)?.profile).toEqual({
      initials: 'LUM',
      characterId: 'cloud-courier',
    });
  });

  it('keeps profile selection visible after save failure and retries before routing', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(DEFAULT_PROGRESS, [
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    renderGame(repository);

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: 'START RUN' }));
    await enterInitials(user, 'RVT');
    await chooseCharacter(user, 'star-alchemist');

    expect(await screen.findByRole('alert')).toHaveTextContent('PROFILE SAVE FAILED');
    expect(screen.getByTestId('character-select-screen')).toBeVisible();
    expect(screen.queryByTestId('tower-screen')).not.toBeInTheDocument();
    expect(repository.saves).toHaveLength(1);

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('character-select-screen')).toBeVisible();
    expect(repository.saves).toHaveLength(1);

    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('character-select-screen')).toBeVisible();
    expect(screen.queryByTestId('title-screen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'RETRY SAVE' }));
    expect(await screen.findByTestId('tower-screen')).toBeVisible();
    expect(repository.saves).toHaveLength(2);
    expect(repository.saves[1]).toEqual(repository.saves[0]);
  });

  it('renders local ranking props without using a leaderboard service', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = {
      schemaVersion: 1,
      initials: 'RVT',
      characterId: 'hero-engineer',
      difficulty: 'easy',
      score: 43_210,
      durationTicks: 2_400,
      reachedFloor: 4,
      encountersWon: 9,
      owlDefeated: false,
      achievedAt: '2026-08-10T00:00:00.000Z',
    };
    progress.pendingLeaderboardSubmissions.easy = progress.localBestScores.easy;
    const repository = new TestProgressRepository(progress);
    renderGame(repository);

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: 'RANKING' }));

    expect(await screen.findByTestId('ranking-screen')).toBeVisible();
    expect(screen.getByText('43,210')).toBeInTheDocument();
    expect(screen.getByText('LOCAL RESULTS')).toBeInTheDocument();
    expect(screen.getByText('SCORE SYNC PENDING')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /NORMAL/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'BACK' }));
    expect(await screen.findByTestId('title-screen')).toBeVisible();
  });

  it('persists match progress through the exact repository selected during boot', async () => {
    const user = userEvent.setup();
    const repositoryA = new TestProgressRepository(floorOneProgress);
    const repositoryB = new TestProgressRepository(floorOneProgress);
    const progressRepositoryFactory = {
      forIdentity: vi.fn(() => repositoryA),
    } satisfies ProgressRepositoryFactory;
    const services = {
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory,
      assetManager: createAssetManager(),
    } satisfies AppServices;
    render(
      <AppRoot
        services={services}
        createMatchSeed={() => 100}
        renderMatch={(props) => <TestMatch {...props} />}
      />,
    );

    await enterMatch(user, 1, 800);
    await finishWin(user);
    expect(repositoryA.saves).toHaveLength(0);
    await continueToNextEncounter(user);
    await finishWin(user);
    expect(repositoryA.saves).toHaveLength(0);
    await continueToNextEncounter(user);
    await finishWin(user);
    await waitFor(() => expect(repositoryA.saves).toHaveLength(1));
    expect(repositoryA.loads).toBe(1);
    expect(repositoryB.loads).toBe(0);
    expect(repositoryB.saves).toHaveLength(0);
    expect(progressRepositoryFactory.forIdentity).toHaveBeenCalledOnce();
  });

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
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(repository),
      assetManager: createAssetManager(),
    };
    render(
      <AppRoot
        services={services}
        createMatchSeed={() => 117}
      />,
    );

    await enterMatch(user, 1, 800);

    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-floor', '1');
    expect(screen.getByRole('region', { name: '견습 마도공학자 battle status' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: '기어 창고장 battle status' }))
      .toBeInTheDocument();
    expect(screen.getByTestId('match-status')).toHaveTextContent('countdown');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });

  it('passes live settings to a match and persists match settings through TowerController', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    const services: AppServices = {
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(repository),
      assetManager: createAssetManager(),
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

    await enterTower(user);
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
    const repository = new TestProgressRepository(
      progressFor(1, { 1: true, 2: false, 3: false, 4: false, 5: false }),
    );
    renderGame(repository);

    await enterMatch(user, 1, 800);
    await finishWin(user);

    await user.click(screen.getByRole('button', { name: '다시 대전' }));
    expect(screen.getByTestId('match-screen')).toBeInTheDocument();
    expect(screen.getByTestId('match-encounter')).toHaveTextContent('0:0');
    await finishWin(user);
    await continueToNextEncounter(user);
    expect(screen.getByTestId('match-encounter')).toHaveTextContent('1:1');
    await finishWin(user);
    await user.click(screen.getByRole('button', { name: '다음 상대' }));
    await screen.findByTestId('floor-intro-screen');
    await user.click(screen.getByRole('button', { name: '타워로' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();

    await enterMatch(user, 1, 800);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '다음 층' }));
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
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(initialProgress));

    await enterTower(user);
    expect(screen.getByRole('button', {
      name: `${floor}층 선택`,
      description,
    })).toBeInTheDocument();
  });

  it('retains the final floor bundle through ending and releases it only after returning to tower', async () => {
    const user = userEvent.setup();
    const manager: AssetManager = {
      ...createAssetManager(),
      loadFloor: vi.fn(async () => 'fallback' as const),
      prefetchFloor: vi.fn(),
      releaseFloor: vi.fn(),
    };
    renderGame(new TestProgressRepository(floorFiveProgress), createTestPlatform(), manager);

    await enterTower(user);
    await user.click(screen.getByRole('button', { name: '5층 선택' }));
    await waitFor(() => expect(manager.loadFloor).toHaveBeenCalledWith(5));
    expect(manager.prefetchFloor).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('floor-intro-screen').querySelectorAll('button')[1]!);
    await screen.findByTestId('match-screen');
    await completeFloor(user, false);
    const resultButtons = screen.getByTestId('result-screen').querySelectorAll('button');
    await user.click(resultButtons[resultButtons.length - 1]!);
    await screen.findByTestId('owl-reveal-screen');
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('owl-result-screen');
    await user.click(screen.getByRole('button', { name: '엔딩 보기' }));
    const ending = await screen.findByTestId('ending-screen');

    expect(manager.releaseFloor).not.toHaveBeenCalledWith(5);
    await user.click(ending.querySelector('button')!);
    await waitFor(() => expect(manager.releaseFloor).toHaveBeenCalledWith(5));
  });

  it('renders all five floor choices with floor four available and floor five locked', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorFourProgress));

    await enterTower(user);
    expect(screen.getAllByRole('button', { name: /층 선택/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
    expect(screen.getByRole('button', {
      name: '3층 선택',
      description: '클리어 완료 · 재도전 가능',
    })).toBeEnabled();
  });

  it('persists difficulty selection and exposes the active difficulty on the app shell', async () => {
    const user = userEvent.setup();
    const unlocked = cloneProgressState(floorOneProgress);
    unlocked.unlockedDifficulties.normal = true;
    const repository = new TestProgressRepository(unlocked);
    renderGame(repository);

    await enterTower(user);
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
    await user.click(screen.getByRole('button', { name: 'NORMAL' }));

    await waitFor(() => expect(repository.saves).toHaveLength(1));
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'normal');
    expect(screen.getByTestId('tower-screen')).toHaveAttribute('data-difficulty', 'normal');
  });

  it.each([
    [1, floorOneProgress, 800],
    [2, floorThreeProgress, 633],
    [3, floorThreeProgress, 450],
    [4, floorFourProgress, 317],
    [5, floorFiveProgress, 200],
  ] as const)('shows the current floor-%i rival identity', async (
    floor,
    initialProgress,
    reactionMs,
  ) => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(initialProgress));

    await enterMatch(user, floor, reactionMs);
    expect(screen.getByText(getFloorEncounter(floor, 0).displayName)).toBeInTheDocument();
  });

  it.each(['loss', 'draw'] as const)('does not unlock floor two after a %s', async (result) => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await enterMatch(user, 1, 800);
    await user.click(screen.getByRole('button', { name: `finish ${result}` }));
    await screen.findByTestId('result-screen');
    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(screen.getByRole('button', { name: '2층 선택' })).toBeDisabled();
    expect(repository.saves).toHaveLength(0);
  });

  it('unlocks floors four and five through victories without ending early', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorThreeProgress);
    renderGame(repository);

    await enterMatch(user, 3, 450);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '다음 층' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();

    await enterMatch(user, 4, 317);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: '다음 층' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeEnabled();
  });

  it('reaches the ending after defeating the floor-five boss and hidden owl', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await enterMatch(user, 5, 200);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '탑으로' }));
    await screen.findByTestId('owl-reveal-screen');
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('owl-result-screen');
    await user.click(screen.getByRole('button', { name: '엔딩 보기' }));

    expect(screen.getByTestId('ending-screen')).toBeInTheDocument();
  });

  it('reveals the hidden owl boss after the floor-five victory', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await enterMatch(user, 5, 200);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '탑으로' }));

    expect(await screen.findByTestId('owl-reveal-screen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    expect(await screen.findByTestId('match-screen')).toHaveAttribute(
      'data-encounter-kind',
      'owl',
    );
  });

  it('unlocks Normal only after the hidden owl is defeated', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await enterMatch(user, 5, 200);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '탑으로' }));
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('owl-result-screen');
    await user.click(screen.getByRole('button', { name: '엔딩 보기' }));

    await screen.findByTestId('ending-screen');
    expect(screen.getByTestId('ending-screen')).toHaveAttribute('data-next-difficulty', 'normal');
    await user.click(screen.getByRole('button', { name: 'NORMAL 선택하러 가기' }));
    await screen.findByTestId('tower-screen');
    expect(screen.getByRole('button', { name: 'NORMAL' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'NORMAL' }));

    await waitFor(() => expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-difficulty',
      'normal',
    ));
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
      await user.click(screen.getByRole('button', { name: '계속' }));

      expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('ending-screen')).not.toBeInTheDocument();
      expect(repository.saves).toHaveLength(0);
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
    await completeFloor(user, false);
    expect(screen.getByText(/최고 해금/)).toHaveTextContent('최고 해금 2층');
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
    await completeFloor(user, false);

    expect(screen.getByRole('status')).toHaveTextContent('진행 상황 저장 중');
    expect(screen.getByRole('button', { name: '다시 대전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 층' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '다음 층' }));
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

    await screen.findByTestId('title-screen');
    expect(attempts).toBe(2);
  });

  it('reaches the title when non-blocking common asset loading falls back', async () => {
    renderGame(
      new TestProgressRepository(floorOneProgress),
      createTestPlatform(),
      createAssetManager(async () => 'fallback'),
    );

    expect(await screen.findByTestId('title-screen')).toBeInTheDocument();
  });

  it('owns tower-route music and app foreground audio without mounting MatchScreen', async () => {
    const realNow = Date.now;
    let elapsed = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + elapsed);
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibilityState,
    );
    const audioPort = createAudioPort();
    const user = userEvent.setup();
    const result = renderGame(
      new TestProgressRepository(floorOneProgress),
      createTestPlatform(),
      createAssetManager(),
      audioPort,
    );

    await enterTower(user);
    expect(screen.queryByTestId('match-screen')).not.toBeInTheDocument();
    expect(audioPort.setMusic).toHaveBeenCalledWith('tower');

    const countdownCallbacks: Array<() => void> = [];
    vi.stubGlobal('setTimeout', vi.fn((callback: () => void) => {
      countdownCallbacks.push(callback);
      return countdownCallbacks.length;
    }));
    vi.stubGlobal('clearTimeout', vi.fn());
    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(audioPort.suspend).toHaveBeenCalledTimes(1);
    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    for (const nextElapsed of [1_000, 2_000, 3_100]) {
      elapsed = nextElapsed;
      const callback = countdownCallbacks.shift();
      expect(callback).toBeDefined();
      act(() => callback?.());
    }
    expect(audioPort.resume).toHaveBeenCalledTimes(1);

    result.unmount();
  });

  it('delays shared audio and manager destruction across StrictMode root unmounts without cross-manager cancellation', async () => {
    vi.useFakeTimers();
    const firstManager = createAssetManager();
    const secondManager = createAssetManager();
    const firstAudio = createAudioPort();
    const secondAudio = createAudioPort();
    const servicesFor = (assetManager: AssetManager, audioPort: AudioPort): AppServices => ({
      audioPort,
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(new TestProgressRepository(floorOneProgress)),
      assetManager,
    });
    const renderRoot = (assetManager: AssetManager, audioPort: AudioPort) => render(
      <StrictMode>
        <AppRoot
          services={servicesFor(assetManager, audioPort)}
          createMatchSeed={() => 1}
          renderMatch={(props) => <TestMatch {...props} />}
        />
      </StrictMode>,
    );

    const firstRoot = renderRoot(firstManager, firstAudio);
    firstRoot.unmount();
    const remountedFirstRoot = renderRoot(firstManager, firstAudio);
    act(() => vi.advanceTimersByTime(300));
    expect(firstManager.destroy).not.toHaveBeenCalled();
    expect(firstAudio.destroy).not.toHaveBeenCalled();

    remountedFirstRoot.unmount();
    const secondRoot = renderRoot(secondManager, secondAudio);
    secondRoot.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(firstManager.destroy).toHaveBeenCalledTimes(1);
    expect(secondManager.destroy).toHaveBeenCalledTimes(1);
    expect(firstAudio.destroy).toHaveBeenCalledTimes(1);
    expect(secondAudio.destroy).toHaveBeenCalledTimes(1);
  });

  it('ignores a queued stale finalizer callback after a newer same-manager finalizer replaces it', async () => {
    const callbacks: (() => void)[] = [];
    let nextHandle = 0;
    vi.stubGlobal('setTimeout', vi.fn((callback: () => void, delayMs: number) => {
      const handle = ++nextHandle;
      if (delayMs === 300) callbacks.push(callback);
      return handle;
    }));
    vi.stubGlobal('clearTimeout', vi.fn());
    const manager = createAssetManager(() => new Promise(() => undefined));
    const services: AppServices = {
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(new TestProgressRepository(floorOneProgress)),
      assetManager: manager,
    };
    const renderRoot = () => render(
      <AppRoot
        services={services}
        createMatchSeed={() => 1}
        renderMatch={(props) => <TestMatch {...props} />}
      />,
    );

    const firstRoot = renderRoot();
    firstRoot.unmount();
    const stale = callbacks[0];
    const secondRoot = renderRoot();
    secondRoot.unmount();
    const current = callbacks[1];

    expect(stale).toBeDefined();
    expect(current).toBeDefined();
    stale?.();
    expect(manager.destroy).not.toHaveBeenCalled();
    current?.();
    await act(async () => undefined);
    expect(manager.destroy).toHaveBeenCalledTimes(1);
    expect(services.audioPort.destroy).toHaveBeenCalledTimes(1);
  });
});
