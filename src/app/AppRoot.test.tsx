// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetManager,
  CommonAssets,
  LoadedImageRef,
  PlayerCharacterAssets,
} from '../assets';
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
  PLAYER_CHARACTER_IDS,
  PLAYER_CHARACTERS,
  type PlayerCharacterId,
} from '../player';
import type { GameEvent } from '../core';
import {
  createLocalLeaderboardRepository,
  type LeaderboardEntry,
  type LeaderboardReadResult,
  type LeaderboardRepository,
  type LeaderboardWriteResult,
} from '../leaderboard';
import {
  AppRoot,
  type MatchRouteViewProps,
} from './AppRoot';
import type { AppServices } from './app-services';
import {
  TowerController,
  type CompleteEncounterResult,
} from './towerController';

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

function scoreRecord(
  overrides: Partial<NonNullable<ProgressState['localBestScores']['easy']>> = {},
): NonNullable<ProgressState['localBestScores']['easy']> {
  return {
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
    ...overrides,
  };
}

function remoteEntry(
  userId: string,
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  const { achievedAt: _achievedAt, ...record } = scoreRecord(overrides);
  return {
    ...record,
    userId,
    updatedAt: '2026-08-10T01:00:00.000Z',
    ...overrides,
  };
}

function leaderboardRepository(
  kind: LeaderboardRepository['kind'],
  overrides: Partial<LeaderboardRepository> = {},
): LeaderboardRepository {
  return {
    kind,
    getTop: vi.fn(async (): Promise<LeaderboardReadResult> => ({
      ok: true,
      source: kind,
      currentUserId: kind === 'firestore' ? 'firebase-user' : null,
      entries: [],
    })),
    submitBest: vi.fn(async (): Promise<LeaderboardWriteResult> => ({ ok: true, source: kind })),
    ...overrides,
  };
}

function cloneProgress(state: ProgressState): ProgressState {
  return cloneProgressState(state);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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
  private readonly pendingSaves: Array<(result: ProgressSaveResult) => void> = [];

  override async save(state: ProgressState): Promise<ProgressSaveResult> {
    this.saves.push(cloneProgress(state));
    return new Promise((resolve) => {
      this.pendingSaves.push(resolve);
    });
  }

  settle(result: ProgressSaveResult) {
    this.pendingSaves.shift()?.(result);
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

function image(url: string): LoadedImageRef {
  return { url } as LoadedImageRef;
}

function playerAssets(characterId: PlayerCharacterId): PlayerCharacterAssets {
  const root = `/assets/characters/${characterId}`;
  return {
    fullArt: image(`${root}/full.webp`),
    portraits: {
      idle: image(`${root}/portrait-idle.webp`),
      focus: image(`${root}/portrait-focus.webp`),
      attack: image(`${root}/portrait-attack.webp`),
      hit: image(`${root}/portrait-hit.webp`),
      win: image(`${root}/portrait-win.webp`),
      loss: image(`${root}/portrait-loss.webp`),
    },
  };
}

function selectedPlayerCommonAssets(): CommonAssets {
  return {
    generation: 1,
    players: {
      'hero-engineer': playerAssets('hero-engineer'),
      'cloud-courier': playerAssets('cloud-courier'),
      'star-alchemist': playerAssets('star-alchemist'),
    },
    owl: {
      fullArt: image('/assets/characters/owl-companion/full.webp'),
      portraits: { idle: image('/assets/characters/owl-companion/portrait-idle.webp') },
    },
    rivals: {},
    tiles: {},
    items: {},
    icons: {},
    audio: { sfx: {}, bgm: {} },
  } as unknown as CommonAssets;
}

function createLoadedAssetManager(commonAssets = selectedPlayerCommonAssets()): AssetManager {
  return {
    ...createAssetManager(async () => 'ready'),
    getCommonAssets: () => commonAssets,
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

function TestMatch({
  floor,
  encounterIndex,
  wins,
  onFinished,
  onScoreEvents,
  player,
  playerAssets: selectedAssets,
  runScore,
  specialEncounter,
}: MatchRouteViewProps): ReactNode {
  const encounter = specialEncounter ?? getFloorEncounter(floor, encounterIndex);
  const scoreEvents = [
    { type: 'lines-cleared', side: 'player', amount: 1 },
    { type: 'attack-sent', side: 'player', amount: 1 },
    { type: 'item-used', side: 'player', item: 'freeze' },
  ] satisfies readonly GameEvent[];
  return (
    <section
      data-encounter-kind={specialEncounter === undefined ? 'floor' : 'owl'}
      data-player-attack={selectedAssets?.portraits.attack?.url ?? 'missing'}
      data-player-focus={selectedAssets?.portraits.focus?.url ?? 'missing'}
      data-player-full-art={selectedAssets?.fullArt?.url ?? 'missing'}
      data-player-hit={selectedAssets?.portraits.hit?.url ?? 'missing'}
      data-player-id={player?.id ?? 'missing'}
      data-player-idle={selectedAssets?.portraits.idle?.url ?? 'missing'}
      data-player-loss={selectedAssets?.portraits.loss?.url ?? 'missing'}
      data-player-win={selectedAssets?.portraits.win?.url ?? 'missing'}
      data-testid="match-screen"
    >
      <h1>{floor}층 대전</h1>
      <h2>{encounter.displayName}</h2>
      <h3>{player?.name}</h3>
      <p>{player?.title}</p>
      <output data-testid="match-encounter">{encounterIndex}:{wins}</output>
      <output data-testid="run-score">점수 {String(runScore).padStart(6, '0')}</output>
      <button type="button" onClick={() => onScoreEvents(scoreEvents)}>
        emit score events
      </button>
      <button
        type="button"
        onClick={() => void onFinished({ result: 'win', durationTicks: 600 })}
      >
        finish win
      </button>
      <button
        type="button"
        onClick={() => void onFinished({ result: 'loss', durationTicks: 300 })}
      >
        finish loss
      </button>
      <button
        type="button"
        onClick={() => void onFinished({ result: 'draw', durationTicks: 300 })}
      >
        finish draw
      </button>
      <button
        type="button"
        onClick={() => {
          void onFinished({ result: 'loss', durationTicks: 300 });
          void onFinished({ result: 'loss', durationTicks: 300 });
        }}
      >
        finish loss twice
      </button>
    </section>
  );
}

type RetainedMatchCallbacks = Pick<MatchRouteViewProps, 'onFinished' | 'onScoreEvents'>;

function retainMatchCallbacks(props: MatchRouteViewProps): RetainedMatchCallbacks {
  return {
    onFinished: props.onFinished,
    onScoreEvents: props.onScoreEvents,
  };
}

function renderGame(
  repository: ProgressRepository,
  platform: PlatformPort = createTestPlatform(),
  assetManager: AssetManager = createAssetManager(),
  audioPort: AudioPort = createAudioPort(),
  nowIso: () => string = () => '2026-08-10T12:34:56.000Z',
  onRenderMatch: (props: MatchRouteViewProps) => void = () => undefined,
  leaderboard: LeaderboardRepository = createLocalLeaderboardRepository(),
) {
  let seed = 100;
  const services: AppServices = {
    audioPort,
    platform,
    progressRepositoryFactory: factoryFor(repository),
    assetManager,
    leaderboardRepository: leaderboard,
  };
  return render(
    <AppRoot
      services={services}
      createMatchSeed={() => seed++}
      nowIso={nowIso}
      renderMatch={(props) => {
        onRenderMatch(props);
        return <TestMatch {...props} />;
      }}
    />,
  );
}

async function enterTower(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByTestId('tower-screen') === null) {
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
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

async function advanceRunToFloor(
  user: ReturnType<typeof userEvent.setup>,
  targetFloor: Floor,
) {
  for (let floor = 1 as Floor; floor < targetFloor; floor = (floor + 1) as Floor) {
    await enterMatch(user, floor, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    await screen.findByTestId('tower-screen');
  }
}

async function reachOwlReveal(user: ReturnType<typeof userEvent.setup>) {
  await advanceRunToFloor(user, 5);
  await enterMatch(user, 5, 0);
  await completeFloor(user, false);
  await user.click(screen.getByRole('button', { name: '탑으로' }));
  await screen.findByTestId('owl-reveal-screen');
}

function expectSelectedMatchPlayer(
  characterId: PlayerCharacterId,
  name: string,
  title: string,
): void {
  const match = screen.getByTestId('match-screen');
  const root = `/assets/characters/${characterId}`;
  expect(match).toHaveAttribute('data-player-id', characterId);
  expect(match).toHaveAttribute('data-player-full-art', `${root}/full.webp`);
  for (const state of ['idle', 'focus', 'attack', 'hit', 'win', 'loss'] as const) {
    expect(match).toHaveAttribute(`data-player-${state}`, `${root}/portrait-${state}.webp`);
  }
  expect(within(match).getByText(name)).toBeInTheDocument();
  expect(within(match).getByText(title)).toBeInTheDocument();
}

describe('AppRoot', () => {
  it('mounts one modal host after the active title screen', async () => {
    renderGame(new TestProgressRepository(floorOneProgress));

    await screen.findByTestId('title-screen');
    const shell = screen.getByTestId('app-shell');
    const host = shell.querySelector('[data-modal-root]');
    expect(host).not.toBeNull();
    expect(shell.querySelectorAll('[data-modal-root]')).toHaveLength(1);
    expect(shell.lastElementChild).toBe(host);
  });

  it('shows title after boot and saves a first profile before entering the tower', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(DEFAULT_PROGRESS);
    renderGame(repository);

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(screen.queryByTestId('tower-screen')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(await screen.findByTestId('name-entry-screen')).toBeVisible();
    await enterInitials(user, 'RVT');
    expect(await screen.findByTestId('character-select-screen')).toBeVisible();
    await chooseCharacter(user, 'hero-engineer');

    expect(await screen.findByTestId('tower-screen')).toBeVisible();
    expect(repository.saves.at(-1)?.profile).toEqual({
      initials: 'RVT',
      characterId: 'hero-engineer',
    });
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('passes every manifest-loaded player full art to character selection cards and backdrop', async () => {
    const user = userEvent.setup();
    renderGame(
      new TestProgressRepository(DEFAULT_PROGRESS),
      createTestPlatform(),
      createLoadedAssetManager(),
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    await enterInitials(user, 'ART');
    const selectionScreen = await screen.findByTestId('character-select-screen');

    for (const characterId of PLAYER_CHARACTER_IDS) {
      const player = PLAYER_CHARACTERS[characterId];
      const expectedUrl = `/assets/characters/${characterId}/full.webp`;
      const card = selectionScreen.querySelector<HTMLButtonElement>(
        `[data-character-id="${characterId}"]`,
      );
      if (card === null) throw new Error(`missing character card ${characterId}`);

      expect(within(card).getByRole('img', { name: `${player.name} 전신 일러스트` }))
        .toHaveAttribute('src', expectedUrl);
      await user.click(card);
      expect(selectionScreen.querySelector('img.screen-backdrop--art'))
        .toHaveAttribute('src', expectedUrl);
    }
  });

  it('sends a returning player from title directly to the tower without another save', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 시작' }));

    expect(await screen.findByTestId('tower-screen')).toBeVisible();
    expect(screen.queryByTestId('name-entry-screen')).not.toBeInTheDocument();
    expect(repository.saves).toEqual([]);
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent('점수 000000');
  });

  it('returns to title and resumes the same active score run', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );

    await user.click(screen.getByRole('button', { name: '처음으로' }));
    expect(await screen.findByTestId('title-screen')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 계속' }));

    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeEnabled();
  });

  it('keeps an active score run when PLAYER CHANGE is cancelled', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    await user.click(screen.getByRole('button', { name: '처음으로' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '플레이어 변경' }));
    await user.click(screen.getByRole('button', { name: 'BACK' }));

    expect(await screen.findByRole('button', { name: '도전 계속' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 계속' }));
    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );
  });

  it('keeps an active score run after ranking back', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    await user.click(screen.getByRole('button', { name: '처음으로' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));
    await user.click(screen.getByRole('button', { name: 'BACK' }));

    expect(await screen.findByRole('button', { name: '도전 계속' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 계속' }));
    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );
  });

  it('clears an active score run after replacing the player profile', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    await user.click(screen.getByRole('button', { name: '처음으로' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '플레이어 변경' }));
    await enterInitials(user, 'LUM');
    await chooseCharacter(user, 'cloud-courier');

    expect(await screen.findByRole('button', { name: '도전 시작' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('clears an active score run after retrying player replacement', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress, [
      { ok: true },
      { ok: false, error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' } },
      { ok: true },
    ]);
    renderGame(repository);

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    await user.click(screen.getByRole('button', { name: '처음으로' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '플레이어 변경' }));
    await enterInitials(user, 'LUM');
    await chooseCharacter(user, 'cloud-courier');
    await user.click(await screen.findByRole('button', { name: 'RETRY SAVE' }));

    expect(await screen.findByRole('button', { name: '도전 시작' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('persists PLAYER CHANGE and returns to title', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '플레이어 변경' }));
    await enterInitials(user, 'LUM');
    await chooseCharacter(user, 'cloud-courier');

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(screen.getByText('LUM')).toBeInTheDocument();
    expect(repository.saves.at(-1)?.profile).toEqual({
      initials: 'LUM',
      characterId: 'cloud-courier',
    });
    expect(screen.queryByTestId('tower-run-status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('locks profile selection behind a focus-trapped retry modal and retries the failed snapshot', async () => {
    const user = userEvent.setup();
    const repository = new DeferredSaveRepository(DEFAULT_PROGRESS);
    renderGame(repository);

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    await enterInitials(user, 'RVT');
    const selectionScreen = await screen.findByTestId('character-select-screen');
    const starCard = document.querySelector<HTMLButtonElement>(
      '[data-character-id="star-alchemist"]',
    );
    if (starCard === null) throw new Error('missing star-alchemist character card');
    await user.click(starCard);
    const backgroundButtons = within(selectionScreen).getAllByRole('button');
    await user.click(screen.getByRole('button', { name: 'SELECT' }));

    expect(screen.getByRole('status')).toHaveTextContent('SAVING PLAYER PROFILE');
    expect(backgroundButtons).toHaveLength(9);
    expect(selectionScreen).toHaveAttribute('inert');
    for (const button of backgroundButtons) expect(button).toBeDisabled();

    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', 'Backspace']) {
      fireEvent.keyDown(selectionScreen, { key });
    }
    for (const button of backgroundButtons) fireEvent.click(button);

    expect(selectionScreen).toHaveAttribute(
      'data-selected-character-id',
      'star-alchemist',
    );
    expect(screen.queryByTestId('tower-screen')).not.toBeInTheDocument();
    expect(repository.saves).toHaveLength(1);

    await act(async () => repository.settle({
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    }));

    const retryDialog = await screen.findByRole('dialog', { name: 'PROFILE SAVE FAILED' });
    expect(retryDialog).toHaveAttribute('aria-modal', 'true');
    const retry = within(retryDialog).getByRole('button', { name: 'RETRY SAVE' });
    expect(retry).toHaveFocus();
    expect(selectionScreen).toHaveAttribute('inert');
    for (const button of backgroundButtons) expect(button).toBeDisabled();

    await user.tab();
    expect(retry).toHaveFocus();
    await user.tab({ shift: true });
    expect(retry).toHaveFocus();

    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', 'Backspace']) {
      fireEvent.keyDown(selectionScreen, { key });
    }
    for (const button of backgroundButtons) fireEvent.click(button);

    expect(selectionScreen).toHaveAttribute(
      'data-selected-character-id',
      'star-alchemist',
    );
    expect(screen.queryByTestId('title-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tower-screen')).not.toBeInTheDocument();
    expect(repository.saves).toHaveLength(1);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(repository.saves).toHaveLength(2));
    expect(repository.saves[1]).toEqual(repository.saves[0]);
    expect(repository.saves[1]?.profile).toEqual({
      initials: 'RVT',
      characterId: 'star-alchemist',
    });
    expect(selectionScreen).toBeVisible();

    await act(async () => repository.settle({ ok: true }));
    expect(await screen.findByTestId('tower-screen')).toBeVisible();
  });

  it('renders local records without reading, submitting, or exposing stored migration candidates', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord();
    progress.pendingLeaderboardSubmissions.easy = progress.localBestScores.easy;
    const repository = new TestProgressRepository(progress);
    const localLeaderboard = leaderboardRepository('local');
    renderGame(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      localLeaderboard,
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));

    expect(await screen.findByTestId('ranking-screen')).toBeVisible();
    expect(screen.getByText('43,210')).toBeInTheDocument();
    expect(screen.getByText('LOCAL RECORDS')).toBeInTheDocument();
    expect(screen.queryByText('ONLINE RANKING SYNC PENDING')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /NORMAL/ })).toBeDisabled();
    expect(localLeaderboard.getTop).not.toHaveBeenCalled();
    expect(localLeaderboard.submitBest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'BACK' }));
    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(screen.queryByText('ONLINE RANKING SYNC PENDING')).not.toBeInTheDocument();
  });

  it('preserves remote ranks, removes a stale current-user row, and appends one unknown-rank local fallback', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord();
    const remote = leaderboardRepository('firestore', {
      getTop: vi.fn(async () => ({
        ok: true as const,
        source: 'firestore' as const,
        currentUserId: 'current-user',
        entries: [
          remoteEntry('current-user', { score: 40_000, durationTicks: 2_000 }),
          remoteEntry('other-user', {
            initials: 'RVT',
            characterId: 'cloud-courier',
          }),
        ],
      })),
    });
    renderGame(
      new TestProgressRepository(progress),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));
    const table = await screen.findByRole('table', { name: 'TOP 20 ranking' });

    expect(within(table).queryByText('40,000')).not.toBeInTheDocument();
    expect(within(table).getAllByText('43,210')).toHaveLength(2);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('2')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('LOCAL')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('?')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('LOCAL')).toBeInTheDocument();
  });

  it.each([
    {
      label: 'higher score',
      local: { score: 1_000, durationTicks: 100 },
      remote: { score: 50_000, durationTicks: 5_000 },
      visibleScore: '50,000',
      hiddenScore: '1,000',
    },
    {
      label: 'equal score with a shorter duration',
      local: { score: 50_000, durationTicks: 5_000 },
      remote: { score: 50_000, durationTicks: 4_999 },
      visibleScore: '50,000',
      hiddenScore: null,
    },
  ])('keeps the current-user remote row when it has a $label', async ({
    local,
    remote: remoteScore,
    visibleScore,
    hiddenScore,
  }) => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord(local);
    const remote = leaderboardRepository('firestore', {
      getTop: vi.fn(async () => ({
        ok: true as const,
        source: 'firestore' as const,
        currentUserId: 'current-user',
        entries: [remoteEntry('current-user', {
          initials: 'REM',
          characterId: 'cloud-courier',
          ...remoteScore,
        })],
      })),
    });
    renderGame(
      new TestProgressRepository(progress),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));
    const table = await screen.findByRole('table', { name: 'TOP 20 ranking' });

    expect(within(table).getByText(visibleScore)).toBeInTheDocument();
    if (hiddenScore !== null) expect(within(table).queryByText(hiddenScore)).not.toBeInTheDocument();
    expect(within(table).getByText('REM')).toBeInTheDocument();
    expect(within(table).queryByText('RVT')).not.toBeInTheDocument();
    expect(within(table).queryByText('LOCAL')).not.toBeInTheDocument();
    expect(within(table).getByText('1')).toBeInTheDocument();
  });

  it('does not append a local duplicate when the current-user remote row is score-equivalent', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord();
    const remote = leaderboardRepository('firestore', {
      getTop: vi.fn(async () => ({
        ok: true as const,
        source: 'firestore' as const,
        currentUserId: 'current-user',
        entries: [remoteEntry('current-user', {
          initials: 'REM',
          characterId: 'cloud-courier',
        })],
      })),
    });
    renderGame(
      new TestProgressRepository(progress),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));
    const table = await screen.findByRole('table', { name: 'TOP 20 ranking' });

    expect(within(table).getAllByText('43,210')).toHaveLength(1);
    expect(within(table).getByText('REM')).toBeInTheDocument();
    expect(within(table).queryByText('RVT')).not.toBeInTheDocument();
    expect(within(table).queryByText('LOCAL')).not.toBeInTheDocument();
    expect(within(table).getByText('1')).toBeInTheDocument();
  });

  it('keeps the selected local best visible when the online ranking read fails', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord();
    const remote = leaderboardRepository('firestore', {
      getTop: vi.fn(async (): Promise<LeaderboardReadResult> => ({
        ok: false as const,
        reason: 'READ_FAILED' as const,
        entries: [],
      })),
    });
    renderGame(
      new TestProgressRepository(progress),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '랭킹' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ONLINE RANKING UNAVAILABLE');
    expect(screen.getByText('43,210')).toBeInTheDocument();
    expect(screen.getByText('LOCAL')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('offers one pending retry per title or ranking entry without StrictMode or failure rerender loops', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord();
    progress.pendingLeaderboardSubmissions.easy = scoreRecord();
    const submitBest = vi.fn(async () => ({
      ok: false as const,
      reason: 'WRITE_FAILED' as const,
    }));
    const getTop = vi.fn(async () => ({
      ok: true as const,
      source: 'firestore' as const,
      currentUserId: 'current-user',
      entries: [],
    }));
    const services: AppServices = {
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(new TestProgressRepository(progress)),
      assetManager: createAssetManager(),
      leaderboardRepository: leaderboardRepository('firestore', { getTop, submitBest }),
    };
    render(
      <StrictMode>
        <AppRoot
          services={services}
          createMatchSeed={() => 1}
          renderMatch={(props) => <TestMatch {...props} />}
        />
      </StrictMode>,
    );

    await screen.findByTestId('title-screen');
    await waitFor(() => expect(submitBest).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('온라인 랭킹 동기화 대기 중');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(submitBest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '랭킹' }));
    await waitFor(() => expect(submitBest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getTop).toHaveBeenCalledTimes(1));
    expect(screen.getByText('ONLINE RANKING SYNC PENDING')).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(submitBest).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'BACK' }));
    await screen.findByTestId('title-screen');
    await waitFor(() => expect(submitBest).toHaveBeenCalledTimes(3));
    expect(getTop).toHaveBeenCalledTimes(1);
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
      leaderboardRepository: createLocalLeaderboardRepository(),
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
      leaderboardRepository: createLocalLeaderboardRepository(),
    };
    render(
      <AppRoot
        services={services}
        createMatchSeed={() => 117}
      />,
    );

    await enterMatch(user, 1, 800);

    expect(screen.getByTestId('match-screen')).toHaveAttribute('data-floor', '1');
    expect(screen.getByRole('region', { name: '리벳 대전 상태' }))
      .toBeInTheDocument();
    expect(screen.getByRole('region', { name: '기어 창고장 대전 상태' }))
      .toBeInTheDocument();
    expect(screen.getByTestId('match-status')).toHaveTextContent('대전 준비');
    expect(screen.getByTestId('match-tick')).toHaveTextContent('0');
  });

  it.each([
    ['cloud-courier', '루미', '바람길의 전령'],
    ['star-alchemist', '세라', '빛의 추적자'],
  ] as const)(
    'propagates %s from AppRoot through every player-visible story and battle route',
    async (characterId, name, title) => {
      const user = userEvent.setup();
      const selectedProgress = cloneProgressState(floorFiveProgress);
      selectedProgress.profile = { initials: 'ACE', characterId };
      renderGame(
        new TestProgressRepository(selectedProgress),
        createTestPlatform(),
        createLoadedAssetManager(),
      );

      await advanceRunToFloor(user, 5);
      await user.click(screen.getByRole('button', { name: '5층 선택' }));

      const introIdentity = await screen.findByRole('group', {
        name: `${name} player identity`,
      });
      expect(introIdentity).toHaveAttribute('data-character-id', characterId);
      expect(introIdentity).toHaveTextContent(title);
      expect(screen.getByAltText(`${name} full illustration`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/full.webp`,
      );
      expect(screen.getByAltText(`${name} idle portrait`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/portrait-idle.webp`,
      );

      await user.click(screen.getByRole('button', { name: '대전 시작' }));
      expectSelectedMatchPlayer(characterId, name, title);

      for (let encounterIndex = 0; encounterIndex < 3; encounterIndex += 1) {
        await user.click(screen.getByRole('button', { name: 'finish win' }));
        const resultIdentity = await screen.findByRole('group', {
          name: `${name} result identity`,
        });
        expect(resultIdentity).toHaveAttribute('data-character-id', characterId);
        expect(resultIdentity).toHaveTextContent(title);
        expect(screen.getByAltText(`${name} result full illustration`)).toHaveAttribute(
          'src',
          `/assets/characters/${characterId}/full.webp`,
        );
        expect(screen.getByAltText(`${name} win portrait`)).toHaveAttribute(
          'src',
          `/assets/characters/${characterId}/portrait-win.webp`,
        );
        if (encounterIndex < 2) {
          await user.click(screen.getByRole('button', { name: '다음 상대' }));
          await user.click(screen.getByRole('button', { name: '대전 시작' }));
          expectSelectedMatchPlayer(characterId, name, title);
        }
      }

      await user.click(screen.getByRole('button', { name: '탑으로' }));
      await screen.findByTestId('owl-reveal-screen');
      await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
      expectSelectedMatchPlayer(characterId, name, title);
      await user.click(screen.getByRole('button', { name: 'finish win' }));

      const owlIdentity = await screen.findByRole('group', {
        name: `${name} owl result identity`,
      });
      expect(owlIdentity).toHaveAttribute('data-character-id', characterId);
      expect(owlIdentity).toHaveTextContent(title);
      expect(screen.getByAltText(`${name} owl result full illustration`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/full.webp`,
      );
      expect(screen.getByAltText(`${name} win portrait`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/portrait-win.webp`,
      );

      await user.click(screen.getByRole('button', { name: '엔딩 보기' }));
      const endingIdentity = await screen.findByRole('group', {
        name: `${name} ending identity`,
      });
      expect(endingIdentity).toHaveAttribute('data-character-id', characterId);
      expect(endingIdentity).toHaveTextContent(title);
      expect(screen.getByAltText(`${name} ending full illustration`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/full.webp`,
      );
      expect(screen.getByAltText(`${name} win portrait`)).toHaveAttribute(
        'src',
        `/assets/characters/${characterId}/portrait-win.webp`,
      );
    },
  );

  it('uses hero-engineer only as the display fallback for corrupted in-memory profiles', async () => {
    const user = userEvent.setup();
    const corrupted = cloneProgressState(floorOneProgress);
    corrupted.profile = {
      initials: 'BAD',
      characterId: 'corrupted-character-id',
    } as unknown as ProgressState['profile'];
    renderGame(
      new TestProgressRepository(corrupted),
      createTestPlatform(),
      createLoadedAssetManager(),
    );

    await enterTower(user);
    await user.click(screen.getByRole('button', { name: '1층 선택' }));

    const fallback = await screen.findByRole('group', { name: '리벳 player identity' });
    expect(fallback).toHaveAttribute('data-character-id', 'hero-engineer');
    expect(screen.getByAltText('리벳 full illustration')).toHaveAttribute(
      'src',
      '/assets/characters/hero-engineer/full.webp',
    );
  });

  it('passes live settings to a match and persists match settings through TowerController', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    const services: AppServices = {
      audioPort: createAudioPort(),
      platform: createTestPlatform(),
      progressRepositoryFactory: factoryFor(repository),
      assetManager: createAssetManager(),
      leaderboardRepository: createLocalLeaderboardRepository(),
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
      bgmVolume: 70,
      sfxVolume: 100,
      soundEnabled: false,
    });
    expect(screen.getByText('false')).toBeInTheDocument();
  });

  it('continues the ranked floor series without exposing a same-run retry', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(
      progressFor(1, { 1: true, 2: false, 3: false, 4: false, 5: false }),
    );
    renderGame(repository);

    await enterMatch(user, 1, 800);
    await finishWin(user);

    expect(screen.queryByRole('button', { name: '다시 대전' })).not.toBeInTheDocument();
    await continueToNextEncounter(user);
    expect(screen.getByTestId('match-encounter')).toHaveTextContent('1:1');
    await finishWin(user);
    await continueToNextEncounter(user);
    await finishWin(user);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '다음 층' }));
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2층 선택' })).toBeEnabled();
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 2층 · 점수 005000',
    );
  });

  it('does not let historical unlocks bypass the active run required floor', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorFiveProgress));

    await enterTower(user);
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '3층 선택' })).toBeDisabled();
    const forbiddenFloor = screen.getByRole('button', { name: '5층 선택' });
    expect(forbiddenFloor).toBeDisabled();
    forbiddenFloor.removeAttribute('disabled');
    fireEvent.click(forbiddenFloor);
    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('floor-intro-screen')).not.toBeInTheDocument();
  });

  it('retains the final floor bundle through ending and releases it only after returning to title', async () => {
    const user = userEvent.setup();
    const manager: AssetManager = {
      ...createAssetManager(),
      loadFloor: vi.fn(async () => 'fallback' as const),
      prefetchFloor: vi.fn(),
      releaseFloor: vi.fn(),
    };
    renderGame(new TestProgressRepository(floorFiveProgress), createTestPlatform(), manager);

    await advanceRunToFloor(user, 5);
    vi.mocked(manager.prefetchFloor).mockClear();
    vi.mocked(manager.releaseFloor).mockClear();
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

  it('renders all five floor choices but enables only the active run floor', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorFourProgress));

    await enterTower(user);
    expect(screen.getAllByRole('button', { name: /층 선택/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: '1층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3층 선택' })).toBeDisabled();
  });

  it('persists difficulty selection and exposes the active difficulty on the app shell', async () => {
    const user = userEvent.setup();
    const unlocked = cloneProgressState(floorOneProgress);
    unlocked.unlockedDifficulties.normal = true;
    const repository = new TestProgressRepository(unlocked);
    renderGame(repository);

    await enterTower(user);
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
    await user.click(screen.getByRole('button', { name: '보통' }));

    await waitFor(() => expect(repository.saves).toHaveLength(1));
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'normal');
    expect(screen.getByTestId('tower-screen')).toHaveAttribute('data-difficulty', 'normal');
    expect(screen.getByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('locks difficulty after match progress so record, AI, and background cannot diverge', async () => {
    const user = userEvent.setup();
    const unlocked = cloneProgressState(floorOneProgress);
    unlocked.unlockedDifficulties.normal = true;
    const repository = new TestProgressRepository(unlocked);
    renderGame(repository);

    await enterMatch(user, 1, 0);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: '다음 층' }));

    expect(screen.getByRole('button', { name: '쉬움' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '보통' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('도전 중에는 난이도를 바꿀 수 없습니다.');
    fireEvent.click(screen.getByRole('button', { name: '보통' }));
    expect(repository.saves).toHaveLength(1);
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
    expect(screen.getByTestId('tower-screen')).toHaveAttribute('data-difficulty', 'easy');
  });

  it('feeds each match event batch once and carries the accumulated score into results', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
    await user.click(screen.getByRole('button', { name: 'emit score events' }));
    expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000250');
    await user.click(screen.getByRole('button', { name: 'finish win' }));

    expect(await screen.findByTestId('result-score')).toHaveTextContent('RUN SCORE 001250');
  });

  it('omits the tower-back action from an intermediate floor intro', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    const result = await screen.findByTestId('result-screen');
    await user.click(within(result).getByRole('button'));
    const intro = await screen.findByTestId('floor-intro-screen');

    expect(intro).toHaveAttribute('data-encounter-index', '1');
    expect(within(intro).getAllByRole('button')).toHaveLength(1);
    await user.click(within(intro).getByRole('button'));
    expect(await screen.findByTestId('match-encounter')).toHaveTextContent('1:1');
  });

  it('ignores retained normal-match callbacks after save and throughout a fresh match', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    let retained: RetainedMatchCallbacks | undefined;
    const staleEvents = [
      { type: 'lines-cleared', side: 'player', amount: 1 },
      { type: 'attack-sent', side: 'player', amount: 1 },
      { type: 'item-used', side: 'player', item: 'freeze' },
    ] satisfies readonly GameEvent[];
    renderGame(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      (props) => {
        if (retained === undefined && props.specialEncounter === undefined) {
          retained = retainMatchCallbacks(props);
        }
      },
    );

    await enterMatch(user, 1, 0);
    if (retained === undefined) throw new Error('normal match callbacks were not retained');
    const oldMatch = retained;
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    const endedResult = await screen.findByTestId('result-screen');
    await waitFor(() => expect(within(endedResult).getByRole('button')).toBeEnabled());
    const savesAfterResult = repository.saves.length;

    act(() => oldMatch.onScoreEvents(staleEvents));
    await expect(act(async () => {
      await oldMatch.onFinished({ result: 'loss', durationTicks: 300 });
    })).resolves.toBeUndefined();
    expect(screen.getByTestId('result-score')).toHaveTextContent('RUN SCORE 000000');
    expect(repository.saves).toHaveLength(savesAfterResult);

    await user.click(within(endedResult).getByRole('button'));
    await screen.findByTestId('title-screen');
    await enterMatch(user, 1, 0);
    const savesBeforeFreshCallbacks = repository.saves.length;

    act(() => oldMatch.onScoreEvents(staleEvents));
    await expect(act(async () => {
      await oldMatch.onFinished({ result: 'loss', durationTicks: 300 });
    })).resolves.toBeUndefined();
    expect(screen.getByTestId('match-screen')).toBeInTheDocument();
    expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
    expect(repository.saves).toHaveLength(savesBeforeFreshCallbacks);

    await user.click(screen.getByRole('button', { name: 'emit score events' }));
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    expect(await screen.findByTestId('result-score')).toHaveTextContent('RUN SCORE 001250');
  });

  it('ignores retained owl-match callbacks after save and throughout a fresh normal match', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    let retained: RetainedMatchCallbacks | undefined;
    const staleEvents = [
      { type: 'lines-cleared', side: 'player', amount: 1 },
      { type: 'attack-sent', side: 'player', amount: 1 },
      { type: 'item-used', side: 'player', item: 'freeze' },
    ] satisfies readonly GameEvent[];
    renderGame(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      (props) => {
        if (retained === undefined && props.specialEncounter !== undefined) {
          retained = retainMatchCallbacks(props);
        }
      },
    );

    await reachOwlReveal(user);
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    if (retained === undefined) throw new Error('owl match callbacks were not retained');
    const oldMatch = retained;
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    const endedResult = await screen.findByTestId('owl-result-screen');
    await waitFor(() => expect(within(endedResult).getByRole('button')).toBeEnabled());
    const savesAfterResult = repository.saves.length;

    act(() => oldMatch.onScoreEvents(staleEvents));
    await expect(act(async () => {
      await oldMatch.onFinished({ result: 'loss', durationTicks: 300 });
    })).resolves.toBeUndefined();
    expect(screen.getByTestId('owl-result-score')).toHaveTextContent('RUN SCORE 025000');
    expect(repository.saves).toHaveLength(savesAfterResult);

    await user.click(within(endedResult).getByRole('button'));
    await screen.findByTestId('title-screen');
    await enterMatch(user, 1, 0);
    const savesBeforeFreshCallbacks = repository.saves.length;

    act(() => oldMatch.onScoreEvents(staleEvents));
    await expect(act(async () => {
      await oldMatch.onFinished({ result: 'loss', durationTicks: 300 });
    })).resolves.toBeUndefined();
    expect(screen.getByTestId('match-screen')).toBeInTheDocument();
    expect(screen.getByTestId('run-score')).toHaveTextContent('점수 000000');
    expect(repository.saves).toHaveLength(savesBeforeFreshCallbacks);

    await user.click(screen.getByRole('button', { name: 'emit score events' }));
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    expect(await screen.findByTestId('result-score')).toHaveTextContent('RUN SCORE 001250');
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

    await advanceRunToFloor(user, floor);
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
    await user.click(screen.getByRole('button', { name: '도전 종료' }));

    expect(await screen.findByTestId('title-screen')).toBeVisible();
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]?.localBestScores.easy).toMatchObject({
      score: 0,
      durationTicks: 300,
      reachedFloor: 1,
      encountersWon: 0,
      achievedAt: '2026-08-10T12:34:56.000Z',
    });
  });

  it.each(['loss', 'draw'] as const)(
    'lets the latest successful score snapshot supersede an earlier failed normal %s save',
    async (result) => {
      const originalCompleteEncounter = TowerController.prototype.completeEncounter;
      const completionSpy = vi.spyOn(TowerController.prototype, 'completeEncounter')
        .mockImplementation(function persistNormalCompletion(
          this: TowerController,
          floorResult,
        ): Promise<CompleteEncounterResult> {
          const completion = originalCompleteEncounter.call(this, floorResult);
          const progressSave = this.updateSettings({});
          return Promise.all([completion, progressSave]).then(([
            completionResult,
            progressSaveResult,
          ]) => {
            if (progressSaveResult.ok) return completionResult;
            return {
              ok: false,
              reason: progressSaveResult.reason,
              route: completionResult.route,
              encounter: completionResult.encounter,
              series: completionResult.series,
              floorCompleted: completionResult.floorCompleted,
            };
          });
        });

      try {
        const user = userEvent.setup();
        const repository = new TestProgressRepository(floorOneProgress, [
          {
            ok: false,
            error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
          },
          { ok: true },
        ]);
        renderGame(repository);

        await enterMatch(user, 1, 0);
        await user.click(screen.getByRole('button', { name: `finish ${result}` }));
        const resultScreen = await screen.findByTestId('result-screen');
        await waitFor(() => expect(repository.saves).toHaveLength(2));

        expect(repository.saves[0]?.localBestScores.easy).toBeNull();
        expect(repository.saves[1]?.localBestScores.easy).toMatchObject({
          score: 0,
          durationTicks: 300,
          reachedFloor: 1,
          encountersWon: 0,
          owlDefeated: false,
          achievedAt: '2026-08-10T12:34:56.000Z',
        });
        expect(repository.saves[1]?.pendingLeaderboardSubmissions.easy).toEqual(
          repository.saves[1]?.localBestScores.easy,
        );
        expect(within(resultScreen).queryByRole('alert')).not.toBeInTheDocument();
        const continueButton = within(
          resultScreen.querySelector<HTMLElement>('.screen-actions')!,
        ).getByRole('button');
        expect(continueButton).toBeEnabled();

        await user.click(continueButton);
        expect(await screen.findByTestId('title-screen')).toBeVisible();
        expect(repository.saves).toHaveLength(2);
      } finally {
        completionSpy.mockRestore();
      }
    },
  );

  it('submits an accepted final score only after its local save succeeds and does not await the remote write', async () => {
    const user = userEvent.setup();
    const progressRepository = new DeferredSaveRepository(floorOneProgress);
    const remoteWrite = deferred<LeaderboardWriteResult>();
    const submitBest = vi.fn(() => remoteWrite.promise);
    const remote = leaderboardRepository('firestore', { submitBest });
    renderGame(
      progressRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    const result = await screen.findByTestId('result-screen');
    const endRun = within(result).getByRole('button');

    expect(submitBest).not.toHaveBeenCalled();
    expect(endRun).toBeDisabled();

    await act(async () => progressRepository.settle({ ok: true }));
    await waitFor(() => expect(submitBest).toHaveBeenCalledTimes(1));
    expect(submitBest).toHaveBeenCalledWith(expect.objectContaining({
      difficulty: 'easy',
      score: 0,
      durationTicks: 300,
      achievedAt: '2026-08-10T12:34:56.000Z',
    }));
    expect(endRun).toBeEnabled();

    await act(async () => {
      remoteWrite.resolve({ ok: false, reason: 'WRITE_FAILED' });
      await remoteWrite.promise;
    });
    expect(screen.getByTestId('result-screen')).toBeInTheDocument();
  });

  it('keeps a failed pending-clear save out of the local result blocker and retries it from title', async () => {
    const user = userEvent.setup();
    const progressRepository = new TestProgressRepository(floorOneProgress, [
      { ok: true },
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    const secondWrite = deferred<LeaderboardWriteResult>();
    let writes = 0;
    const submitBest = vi.fn(() => {
      writes += 1;
      return writes === 1
        ? Promise.resolve({ ok: true as const, source: 'firestore' as const })
        : secondWrite.promise;
    });
    const remote = leaderboardRepository('firestore', { submitBest });
    renderGame(
      progressRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    const result = await screen.findByTestId('result-screen');
    await waitFor(() => expect(progressRepository.saves).toHaveLength(2));

    expect(progressRepository.saves[0]?.pendingLeaderboardSubmissions.easy).toBeDefined();
    expect(progressRepository.saves[1]?.pendingLeaderboardSubmissions.easy).toBeUndefined();
    expect(within(result).queryByRole('alert')).not.toBeInTheDocument();
    const resultActions = result.querySelector<HTMLElement>('.screen-actions');
    if (resultActions === null) throw new Error('result actions should be present');
    const endRun = within(resultActions).getByRole('button');
    expect(endRun).toBeEnabled();
    await user.click(endRun);

    await screen.findByTestId('title-screen');
    await waitFor(() => expect(submitBest).toHaveBeenCalledTimes(2));
    expect(screen.getByText('온라인 랭킹 동기화 대기 중')).toBeInTheDocument();

    await act(async () => {
      secondWrite.resolve({ ok: true, source: 'firestore' });
      await secondWrite.promise;
    });
    await waitFor(() => expect(progressRepository.saves).toHaveLength(3));
    expect(progressRepository.saves[2]).toEqual(progressRepository.saves[1]);
    await waitFor(() => {
      expect(screen.queryByText('온라인 랭킹 동기화 대기 중')).not.toBeInTheDocument();
    });
  });

  it('does not submit when the final local score save fails', async () => {
    const user = userEvent.setup();
    const progressRepository = new TestProgressRepository(floorOneProgress, [{
      ok: false,
      error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
    }]);
    const remote = leaderboardRepository('firestore');
    renderGame(
      progressRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(remote.submitBest).not.toHaveBeenCalled();
  });

  it('does not submit a non-accepted final score merely because recordScore returns ok', async () => {
    const user = userEvent.setup();
    const progress = cloneProgressState(floorOneProgress);
    progress.localBestScores.easy = scoreRecord({ score: 1_000, durationTicks: 5_000 });
    const progressRepository = new TestProgressRepository(progress);
    const remote = leaderboardRepository('firestore');
    renderGame(
      progressRepository,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      remote,
    );

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    const result = await screen.findByTestId('result-screen');
    await waitFor(() => expect(within(result).getByRole('button')).toBeEnabled());

    expect(progressRepository.saves).toEqual([]);
    expect(remote.submitBest).not.toHaveBeenCalled();
  });

  it('retries a failed final score save without recording the run twice', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress, [
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    renderGame(repository);

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss twice' }));
    const result = await screen.findByTestId('result-screen');
    const endRun = screen.getByRole('button', { name: '도전 종료' });
    expect(endRun).toBeDisabled();
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]?.localBestScores.easy).toMatchObject({
      score: 0,
      durationTicks: 300,
      achievedAt: '2026-08-10T12:34:56.000Z',
    });

    await user.click(endRun);
    expect(result).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '저장 다시 시도' }));
    await waitFor(() => expect(repository.saves).toHaveLength(2));
    expect(repository.saves[1]).toEqual(repository.saves[0]);
    expect(screen.getByRole('button', { name: '도전 종료' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '도전 종료' }));
    expect(await screen.findByTestId('title-screen')).toBeVisible();
  });

  it('uses duration as the local-best tie break with the injected ISO timestamp', async () => {
    const user = userEvent.setup();
    const initial = cloneProgressState(floorOneProgress);
    initial.localBestScores.easy = {
      schemaVersion: 1,
      initials: 'OLD',
      characterId: 'cloud-courier',
      difficulty: 'easy',
      score: 0,
      durationTicks: 400,
      reachedFloor: 1,
      encountersWon: 0,
      owlDefeated: false,
      achievedAt: '2026-08-09T00:00:00.000Z',
    };
    const repository = new TestProgressRepository(initial);
    renderGame(repository, undefined, undefined, undefined, () => '2026-08-10T23:59:59.000Z');

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    await screen.findByTestId('result-screen');

    expect(repository.saves.at(-1)?.localBestScores.easy).toMatchObject({
      initials: 'RVT',
      characterId: 'hero-engineer',
      score: 0,
      durationTicks: 300,
      achievedAt: '2026-08-10T23:59:59.000Z',
    });
  });

  it('starts a new attempt at zero after an ended run returns to title', async () => {
    const user = userEvent.setup();
    renderGame(new TestProgressRepository(floorOneProgress));

    await enterMatch(user, 1, 0);
    await user.click(screen.getByRole('button', { name: 'emit score events' }));
    await user.click(screen.getByRole('button', { name: 'finish loss' }));
    expect(await screen.findByTestId('result-score')).toHaveTextContent('RUN SCORE 000250');
    await user.click(screen.getByRole('button', { name: '도전 종료' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '도전 시작' }));

    expect(await screen.findByTestId('tower-run-status')).toHaveTextContent(
      '도전 중 · 다음 1층 · 점수 000000',
    );
  });

  it('unlocks floors four and five through victories without ending early', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorOneProgress);
    renderGame(repository);

    await advanceRunToFloor(user, 3);
    await enterMatch(user, 3, 450);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: '다음 층' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4층 선택' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeDisabled();

    await enterMatch(user, 4, 317);
    await completeFloor(user, false);
    await waitFor(() => expect(repository.saves).toHaveLength(4));
    await user.click(screen.getByRole('button', { name: '다음 층' }));

    expect(screen.getByTestId('tower-screen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5층 선택' })).toBeEnabled();
  });

  it('reaches the ending after defeating the floor-five boss and hidden owl', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await reachOwlReveal(user);
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('owl-result-screen');
    expect(screen.getByTestId('owl-result-score')).toHaveTextContent('RUN SCORE 031000');
    await user.click(screen.getByRole('button', { name: '엔딩 보기' }));

    expect(screen.getByTestId('ending-screen')).toBeInTheDocument();
    expect(screen.getByTestId('ending-score')).toHaveTextContent('FINAL SCORE 031000');
    expect(repository.saves.at(-1)?.localBestScores.easy).toMatchObject({
      score: 31_000,
      durationTicks: 9_600,
      reachedFloor: 5,
      encountersWon: 16,
      owlDefeated: true,
      achievedAt: '2026-08-10T12:34:56.000Z',
    });
    expect(repository.saves.at(-1)?.pendingLeaderboardSubmissions.easy).toEqual(
      repository.saves.at(-1)?.localBestScores.easy,
    );
  });

  it('lets the latest successful owl score snapshot supersede its failed progression save', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress, [
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    renderGame(repository);

    await reachOwlReveal(user);
    expect(repository.saves).toHaveLength(5);
    await user.click(within(screen.getByTestId('owl-reveal-screen')).getByRole('button'));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    const owlResult = await screen.findByTestId('owl-result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(7));

    expect(repository.saves[5]?.difficultyProgress.easy.owlDefeated).toBe(true);
    expect(repository.saves[5]?.localBestScores.easy).toBeNull();
    expect(repository.saves[6]?.difficultyProgress.easy.owlDefeated).toBe(true);
    expect(repository.saves[6]?.unlockedDifficulties.normal).toBe(true);
    expect(repository.saves[6]?.localBestScores.easy).toMatchObject({
      score: 31_000,
      reachedFloor: 5,
      encountersWon: 16,
      owlDefeated: true,
    });
    expect(repository.saves[6]?.pendingLeaderboardSubmissions.easy).toEqual(
      repository.saves[6]?.localBestScores.easy,
    );
    expect(within(owlResult).queryByRole('alert')).not.toBeInTheDocument();
    const continueButton = within(
      owlResult.querySelector<HTMLElement>('.screen-actions')!,
    ).getByRole('button');
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    expect(await screen.findByTestId('ending-screen')).toBeInTheDocument();
    expect(repository.saves).toHaveLength(7);
  });

  it('blocks an owl result when the latest score snapshot fails and retries that snapshot', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress, [
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      {
        ok: false,
        error: { code: 'WRITE_FAILED', message: 'Progress could not be saved.' },
      },
      { ok: true },
    ]);
    renderGame(repository);

    await reachOwlReveal(user);
    await user.click(within(screen.getByTestId('owl-reveal-screen')).getByRole('button'));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    const owlResult = await screen.findByTestId('owl-result-screen');
    await waitFor(() => expect(repository.saves).toHaveLength(7));

    const alert = within(owlResult).getByRole('alert');
    const continueButton = within(
      owlResult.querySelector<HTMLElement>('.screen-actions')!,
    ).getByRole('button');
    expect(continueButton).toBeDisabled();
    await user.click(within(alert).getByRole('button'));

    await waitFor(() => expect(repository.saves).toHaveLength(8));
    expect(repository.saves[7]).toEqual(repository.saves[6]);
    expect(within(owlResult).queryByRole('alert')).not.toBeInTheDocument();
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(await screen.findByTestId('ending-screen')).toBeInTheDocument();
  });

  it('reveals the hidden owl boss after the floor-five victory', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await reachOwlReveal(user);

    expect(await screen.findByTestId('owl-reveal-screen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    expect(await screen.findByTestId('match-screen')).toHaveAttribute(
      'data-encounter-kind',
      'owl',
    );
  });

  it('does not expose tower re-entry after the final floor commits the run to the owl fight', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await reachOwlReveal(user);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it.each(['loss', 'draw'] as const)(
    'records an owl %s once and returns to title instead of reopening the owl',
    async (result) => {
      const user = userEvent.setup();
      const repository = new TestProgressRepository(floorFiveProgress);
      renderGame(repository);

      await reachOwlReveal(user);
      await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
      await screen.findByTestId('match-screen');
      await user.click(screen.getByRole('button', { name: `finish ${result}` }));

      expect(await screen.findByTestId('owl-result-score')).toHaveTextContent(
        'RUN SCORE 025000',
      );
      expect(repository.saves.at(-1)?.localBestScores.easy).toMatchObject({
        score: 25_000,
        durationTicks: 9_300,
        reachedFloor: 5,
        encountersWon: 15,
        owlDefeated: false,
      });
      await user.click(screen.getByRole('button', { name: '도전 종료' }));
      expect(await screen.findByTestId('title-screen')).toBeVisible();
      expect(screen.queryByTestId('owl-reveal-screen')).not.toBeInTheDocument();
    },
  );

  it('unlocks Normal only after the hidden owl is defeated', async () => {
    const user = userEvent.setup();
    const repository = new TestProgressRepository(floorFiveProgress);
    renderGame(repository);

    await reachOwlReveal(user);
    await user.click(screen.getByRole('button', { name: '부엉이와 대결' }));
    await screen.findByTestId('match-screen');
    await user.click(screen.getByRole('button', { name: 'finish win' }));
    await screen.findByTestId('owl-result-screen');
    await user.click(screen.getByRole('button', { name: '엔딩 보기' }));

    await screen.findByTestId('ending-screen');
    expect(screen.getByTestId('ending-screen')).toHaveAttribute('data-next-difficulty', 'normal');
    await user.click(screen.getByRole('button', { name: '타이틀로 돌아가기' }));
    await screen.findByTestId('title-screen');
    await user.click(screen.getByRole('button', { name: '도전 시작' }));
    await screen.findByTestId('tower-screen');
    expect(screen.getByRole('button', { name: '보통' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '보통' }));

    await waitFor(() => expect(screen.getByTestId('app-shell')).toHaveAttribute(
      'data-difficulty',
      'normal',
    ));
  });

  it.each(['loss', 'draw'] as const)(
    'ends the ranked run after a floor-five %s',
    async (result) => {
      const user = userEvent.setup();
      const repository = new TestProgressRepository(floorFiveProgress);
      renderGame(repository);

      await advanceRunToFloor(user, 5);
      await enterMatch(user, 5, 200);
      await user.click(screen.getByRole('button', { name: `finish ${result}` }));
      await screen.findByTestId('result-screen');
      await user.click(screen.getByRole('button', { name: '도전 종료' }));

      expect(await screen.findByTestId('title-screen')).toBeVisible();
      expect(screen.queryByTestId('ending-screen')).not.toBeInTheDocument();
      expect(repository.saves.at(-1)?.localBestScores.easy).toMatchObject({
        reachedFloor: 5,
        encountersWon: 12,
        owlDefeated: false,
      });
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
    expect(screen.queryByRole('button', { name: '다시 대전' })).not.toBeInTheDocument();
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
      leaderboardRepository: createLocalLeaderboardRepository(),
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
      leaderboardRepository: createLocalLeaderboardRepository(),
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
