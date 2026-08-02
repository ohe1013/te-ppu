import { expect, test } from '@playwright/test';
import type { MatchResult } from '../../src/app/app-route';
import { openMatch, openTower } from './helpers';

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
