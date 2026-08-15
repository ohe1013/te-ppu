import { expect, test } from '@playwright/test';
import {
  DEV_CLEARED_PROGRESS_KEY,
  ORDINARY_PROGRESS_KEY,
  ORDINARY_PROGRESS_RAW,
  seedOrdinaryProgress,
} from './ordinary-progress-fixture';

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
  await seedOrdinaryProgress(page);
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'hard');
  const stored = await page.evaluate(({ clearedKey, ordinaryKey }) => ({
    cleared: window.localStorage.getItem(clearedKey),
    ordinary: window.localStorage.getItem(ordinaryKey),
  }), {
    clearedKey: DEV_CLEARED_PROGRESS_KEY,
    ordinaryKey: ORDINARY_PROGRESS_KEY,
  });
  expect(stored.ordinary).toBe(ORDINARY_PROGRESS_RAW);
  if (stored.cleared === null) {
    throw new Error('Expected dev-cleared progress in local storage.');
  }
  const persisted = JSON.parse(stored.cleared) as PersistedClearedProgress;
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
    for (const floor of [1, 2, 3, 4, 5]) {
      await expect(page.getByRole('button', { name: `${floor}층 선택` })).toBeEnabled();
    }
  }
  await expect(page.getByTestId('tower-run-status')).toContainText(
    '관리자 테스트 · 모든 층 선택 가능',
  );
  await page.getByRole('button', { name: '5층 선택' }).click();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toHaveAttribute('data-floor', '5');
});
