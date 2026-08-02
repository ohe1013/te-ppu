import { expect, type Page } from '@playwright/test';

export async function openTower(page: Page): Promise<number> {
  const startedAt = Date.now();
  await page.goto('/');
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
