import { expect, test } from '@playwright/test';
import type { MatchResult } from '../../src/app/app-route';
import { openMatch, openTower } from './helpers';

const FLOOR_FIVE_PROGRESS = {
  schemaVersion: 2,
  highestUnlockedFloor: 5,
  clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
} as const;

test('shows a usable tower screen in under ten seconds', async ({ page }) => {
  const elapsedMs = await openTower(page);

  expect(elapsedMs).toBeLessThan(10_000);
  await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
});

for (const { result, heading } of [
  { result: 'win', heading: '승리' },
  { result: 'loss', heading: '패배' },
  { result: 'draw', heading: '무승부' },
] satisfies readonly { result: MatchResult; heading: string }[]) {
  test(`routes tower to intro to match to forced ${result}`, async ({ page }) => {
    await openMatch(page);

    await page.evaluate(async (forcedResult) => {
      await window.__TE_PPU_E2E__.finish(forcedResult);
    }, result);

    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  });
}

test('loads unlocked floor five and reaches the ending after its victory', async ({ page }) => {
  await openTower(page);
  await page.evaluate((progress) => {
    window.localStorage.setItem('te-ppu.progress', JSON.stringify(progress));
  }, FLOOR_FIVE_PROGRESS);
  await page.reload();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  await page.getByRole('button', { name: '5층 선택' }).click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await expect(page.getByText('AI 반응 간격: 200ms')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();

  await page.evaluate(async () => {
    await window.__TE_PPU_E2E__.finish('win');
  });
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await page.getByRole('button', { name: '계속' }).click();

  await expect(page.getByTestId('ending-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: '모든 층을 클리어했습니다' }))
    .toBeVisible();
});
