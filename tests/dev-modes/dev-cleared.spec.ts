import { expect, test } from '@playwright/test';

test('npm run dev opens ADM with every difficulty and floor cleared', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toContainText('ADM');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'hard');
  await page.locator('.title-screen__action--start').click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  for (const difficulty of ['easy', 'normal', 'hard']) {
    await page.locator(`.difficulty-selector__option[data-difficulty="${difficulty}"]`).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', difficulty);
    await expect(page.locator('.tower-node--cleared')).toHaveCount(5);
  }
});
