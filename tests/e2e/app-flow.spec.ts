import type { MatchResult } from '../../src/app/app-route';
import { expect, openMatch, openTower, test } from './helpers';

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

test('shows the mascot and all three ordered floor-one rivals', async ({ page }) => {
  await openTower(page);

  await expect(page.getByAltText('태엽 부엉이 안내자')).toBeVisible();
  const floorOneRivals = page
    .getByRole('list', { name: '층별 라이벌 순서' })
    .first();
  for (const name of ['기어 창고장', '시계나방 틱', '이끼 골렘 모스']) {
    await expect(floorOneRivals.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('대전 진행 중', { exact: true })).toHaveCount(0);
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
  await expect(page.getByTestId('floor-intro-screen')).toHaveAttribute('data-encounter-index', '0');
  await expect(page.getByRole('heading', { name: '시계나방 틱' })).toBeVisible();
  await expect(page.getByText('AI 반응 간격')).toHaveCount(0);
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();

  for (const encounterIndex of [0, 1, 2] as const) {
    const currentMatch = await page.evaluate(() => window.__TE_PPU_E2E__.currentMatch);
    expect(currentMatch).toEqual({ floor: 5, encounterIndex, wins: encounterIndex });
    await expect(page.getByRole('heading', { name: encounterIndex === 0
      ? '시계나방 틱'
      : encounterIndex === 1 ? '유리 예언자 프리즘' : '탑의 마왕 녹스' })).toBeVisible();
    await page.evaluate(async () => {
      await window.__TE_PPU_E2E__.finish('win');
    });
    await expect(page.getByTestId('result-screen')).toHaveAttribute(
      'data-series-complete',
      encounterIndex === 2 ? 'true' : 'false',
    );
    if (encounterIndex < 2) {
      await expect(page.getByText(`층 승리 ${encounterIndex + 1}/3`)).toBeVisible();
      await page.getByRole('button', { name: '다음 상대' }).click();
      await expect(page.getByTestId('floor-intro-screen')).toHaveAttribute(
        'data-encounter-index',
        String(encounterIndex + 1),
      );
      await page.getByRole('button', { name: '대전 시작' }).click();
      await expect(page.getByTestId('match-screen')).toBeVisible();
    }
  }

  await page.getByRole('button', { name: '탑으로' }).click();
  await expect(page.getByTestId('ending-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: '모든 층을 클리어했습니다' })).toBeVisible();
});

test('keeps floor two locked until all three floor-one wins are complete', async ({ page }) => {
  await openMatch(page);
  await expect(page.getByRole('heading', { name: '기어 창고장' })).toBeVisible();

  for (const encounterIndex of [0, 1, 2] as const) {
    const currentMatch = await page.evaluate(() => window.__TE_PPU_E2E__.currentMatch);
    expect(currentMatch).toEqual({ floor: 1, encounterIndex, wins: encounterIndex });
    await page.evaluate(async () => {
      await window.__TE_PPU_E2E__.finish('win');
    });

    const progress = await page.evaluate(() => {
      const raw = window.localStorage.getItem('te-ppu.progress.identity.local.local-browser')
        ?? window.localStorage.getItem('te-ppu.progress');
      return raw === null ? null : JSON.parse(raw) as { highestUnlockedFloor: number };
    });
    expect(progress?.highestUnlockedFloor ?? 1).toBe(encounterIndex === 2 ? 2 : 1);

    if (encounterIndex < 2) {
      await page.getByRole('button', { name: '다음 상대' }).click();
      await page.getByRole('button', { name: '대전 시작' }).click();
      await expect(page.getByTestId('match-screen')).toBeVisible();
    } else {
      await page.getByRole('button', { name: '다음 층' }).click();
      await expect(page.getByTestId('tower-screen')).toBeVisible();
      await expect(page.getByRole('button', { name: '2층 선택' })).toBeEnabled();
    }
  }
});
