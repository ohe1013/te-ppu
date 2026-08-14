import { expect, test } from '@playwright/test';
import {
  DEV_CLEARED_PROGRESS_KEY,
  ORDINARY_PROGRESS_KEY,
  ORDINARY_PROGRESS_RAW,
  seedOrdinaryProgress,
} from './ordinary-progress-fixture';

test('npm run dev:clean loads only pre-existing ordinary browser progress', async ({ page }) => {
  await seedOrdinaryProgress(page);
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toContainText('ORD');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  const stored = await page.evaluate(({ clearedKey, ordinaryKey }) => ({
    cleared: window.localStorage.getItem(clearedKey),
    ordinary: window.localStorage.getItem(ordinaryKey),
  }), {
    clearedKey: DEV_CLEARED_PROGRESS_KEY,
    ordinaryKey: ORDINARY_PROGRESS_KEY,
  });
  expect(stored.ordinary).toBe(ORDINARY_PROGRESS_RAW);
  expect(stored.cleared).toBeNull();
});
