import { expect, test } from '@playwright/test';

test('npm run dev:clean retains an ordinary fresh browser profile', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).not.toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('name-entry-screen')).toBeVisible();
});
