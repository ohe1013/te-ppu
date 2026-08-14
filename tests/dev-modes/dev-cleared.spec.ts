import { expect, test } from '@playwright/test';

const DEV_CLEARED_PROGRESS_KEY = 'te-ppu.progress.dev-cleared.identity.local.local-browser';

interface PersistedClearedProgress {
  readonly profile: {
    readonly initials: string;
    readonly characterId: string;
  } | null;
  readonly localBestScores: {
    readonly easy: unknown;
    readonly normal: unknown;
    readonly hard: unknown;
  };
  readonly pendingLeaderboardSubmissions: Record<string, unknown>;
  readonly difficultyProgress: Record<string, { readonly owlDefeated: boolean }>;
}

test('npm run dev opens ADM with every difficulty and floor cleared', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'hard');
  const persisted = await page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    if (serialized === null) throw new Error('Expected dev-cleared progress in local storage.');
    return JSON.parse(serialized) as PersistedClearedProgress;
  }, DEV_CLEARED_PROGRESS_KEY);
  expect(persisted.profile).toEqual({ initials: 'ADM', characterId: 'hero-engineer' });
  expect(persisted.localBestScores).toEqual({ easy: null, normal: null, hard: null });
  expect(persisted.pendingLeaderboardSubmissions).toEqual({});
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  for (const difficulty of ['easy', 'normal', 'hard']) {
    await page.locator(`.difficulty-selector__option[data-difficulty="${difficulty}"]`).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', difficulty);
    await expect(page.locator('.tower-node--cleared')).toHaveCount(5);
    expect(persisted.difficultyProgress[difficulty]?.owlDefeated).toBe(true);
  }
});
