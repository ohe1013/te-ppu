import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';
import type { PlayerCharacterId, PlayerProfile } from '../../src/player';
import type {
  Difficulty,
  DifficultyRunProgress,
  ProgressState,
} from '../../src/progression';

export const LOCAL_PROGRESS_KEY = 'te-ppu.progress.identity.local.local-browser';

export type SeedProfile = PlayerProfile;

type DifficultyRunOverrides = Omit<Partial<DifficultyRunProgress>, 'clearedFloors'> & {
  readonly clearedFloors?: Partial<DifficultyRunProgress['clearedFloors']>;
};

export interface SeedProgressOverrides {
  readonly difficultyProgress?: Partial<Record<Difficulty, DifficultyRunOverrides>>;
  readonly localBestScores?: ProgressState['localBestScores'];
  readonly pendingLeaderboardSubmissions?: ProgressState['pendingLeaderboardSubmissions'];
  readonly selectedDifficulty?: Difficulty;
  readonly settings?: Partial<ProgressState['settings']>;
  readonly unlockedDifficulties?: Partial<ProgressState['unlockedDifficulties']>;
}

const CHARACTER_NAMES: Readonly<Record<PlayerCharacterId, string>> = {
  'hero-engineer': '리벳',
  'cloud-courier': '루미',
  'star-alchemist': '세라',
};

function emptyDifficultyRun(): DifficultyRunProgress {
  return {
    highestUnlockedFloor: 1,
    clearedFloors: { 1: false, 2: false, 3: false, 4: false, 5: false },
    owlDefeated: false,
  };
}

function difficultyRun(
  overrides: DifficultyRunOverrides | undefined,
): DifficultyRunProgress {
  const empty = emptyDifficultyRun();
  return {
    ...empty,
    ...overrides,
    clearedFloors: { ...empty.clearedFloors, ...overrides?.clearedFloors },
  };
}

export async function chooseArcadeLetters(page: Page, initials: string): Promise<void> {
  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new RangeError(`Arcade initials must be exactly three uppercase letters: ${initials}`);
  }
  for (const letter of initials) {
    await page.getByRole('button', { name: letter, exact: true }).click();
  }
}

export async function seedReturningProfile(
  page: Page,
  profile: SeedProfile,
  overrides: SeedProgressOverrides = {},
): Promise<void> {
  const progress = {
    schemaVersion: 4,
    profile: { ...profile },
    localBestScores: overrides.localBestScores === undefined
      ? { easy: null, normal: null, hard: null }
      : { ...overrides.localBestScores },
    pendingLeaderboardSubmissions: {
      ...overrides.pendingLeaderboardSubmissions,
    },
    selectedDifficulty: overrides.selectedDifficulty ?? 'easy',
    unlockedDifficulties: {
      easy: true,
      normal: false,
      hard: false,
      ...overrides.unlockedDifficulties,
    },
    difficultyProgress: {
      easy: difficultyRun(overrides.difficultyProgress?.easy),
      normal: difficultyRun(overrides.difficultyProgress?.normal),
      hard: difficultyRun(overrides.difficultyProgress?.hard),
    },
    settings: {
      soundEnabled: true,
      hapticsEnabled: true,
      ...overrides.settings,
    },
  } satisfies ProgressState;

  await page.addInitScript(({ key, serialized }) => {
    window.localStorage.setItem(key, serialized);
  }, { key: LOCAL_PROGRESS_KEY, serialized: JSON.stringify(progress) });
}

export async function completeFirstRunProfile(
  page: Page,
  initials: string,
  characterId: PlayerCharacterId,
): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByRole('button', { name: '도전 시작' }).click();
  await expect(page.getByTestId('name-entry-screen')).toBeVisible();
  await chooseArcadeLetters(page, initials);
  await page.getByRole('button', { name: 'END' }).click();
  await expect(page.getByTestId('character-select-screen')).toBeVisible();
  await page.getByRole('button', { name: CHARACTER_NAMES[characterId] }).click();
  await page.getByRole('button', { name: 'SELECT' }).click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();
}

interface BrowserErrorGuard {
  detach(): void;
  throwIfCaptured(): void;
}

export function createBrowserErrorGuard(page: Page): BrowserErrorGuard {
  const errors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  };
  const onPageError = (error: Error) => {
    errors.push(`pageerror: ${error.message}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return {
    detach() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
    throwIfCaptured() {
      if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    },
  };
}

export { expect };
export const test = base.extend<{ browserErrorGuard: void }>({
  browserErrorGuard: [async ({ page }, use) => {
    const guard = createBrowserErrorGuard(page);
    try {
      await use();
    } finally {
      guard.detach();
      guard.throwIfCaptured();
    }
  }, { auto: true }],
});

export async function openTower(page: Page): Promise<number> {
  const startedAt = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '도전 시작' }).click();
  await expect(page.getByTestId('tower-screen')).toBeVisible({ timeout: 10_000 });
  return Date.now() - startedAt;
}

export async function openMatch(page: Page): Promise<void> {
  await openTower(page);
  await page.getByRole('button', { name: '1층 선택' }).click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await expect(page.getByRole('group', { name: '게임 조작' })).toBeEnabled();
}
