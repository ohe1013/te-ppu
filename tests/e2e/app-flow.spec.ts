import type { MatchResult } from '../../src/app/app-route';
import {
  chooseArcadeLetters,
  completeFirstRunProfile,
  expect,
  openMatch,
  openTower,
  seedReturningProfile,
  test,
} from './helpers';

const RETURNING_PROFILE = {
  initials: 'RVT',
  characterId: 'hero-engineer',
} as const;

test('registers arcade initials and a character before the first easy run', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByRole('button', { name: 'START RUN' }).click();
  await expect(page.getByTestId('name-entry-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'END' })).toBeDisabled();
  await chooseArcadeLetters(page, 'LUM');
  await expect(page.getByRole('status', { name: '입력한 이니셜' })).toHaveText('LUM');
  await expect(page.getByRole('button', { name: 'END' })).toBeEnabled();
  await page.getByRole('button', { name: 'END' }).click();
  await expect(page.getByTestId('character-select-screen')).toBeVisible();
  await page.locator('[data-character-id="cloud-courier"]').click();
  await page.getByRole('button', { name: 'SELECT' }).click();

  await expect(page.getByTestId('tower-screen')).toBeVisible();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'easy');
  await expect(page.getByTestId('tower-run-status')).toHaveText(
    'RUN ACTIVE · NEXT 1F · SCORE 000000',
  );
  await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
  for (const floor of [2, 3, 4, 5]) {
    await expect(page.getByRole('button', { name: `${floor}층 선택` })).toBeDisabled();
  }
});

test('completes first-run character selection for all three equal-performance heroes', async ({ page }) => {
  for (const { characterId, initials, name } of [
    { characterId: 'hero-engineer', initials: 'RVT', name: '리벳' },
    { characterId: 'cloud-courier', initials: 'LUM', name: '루미' },
    { characterId: 'star-alchemist', initials: 'SER', name: '세라' },
  ] as const) {
    await completeFirstRunProfile(page, initials, characterId);
    await expect(page.getByTestId('tower-screen')).toBeVisible();
    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('te-ppu.progress.identity.local.local-browser');
      return raw === null ? null : JSON.parse(raw) as {
        profile: { initials: string; characterId: string } | null;
      };
    });
    expect(stored?.profile).toEqual({ initials, characterId });
    await page.getByRole('button', { name: '1층 선택' }).click();
    await expect(page.getByRole('group', { name: `${name} player identity` })).toBeVisible();
    await page.evaluate(() => window.localStorage.clear());
  }
});

test('records a partial run and shows it on local ranking', async ({ page }) => {
  await seedReturningProfile(page, { initials: 'RVT', characterId: 'hero-engineer' });
  await openMatch(page);

  await page.evaluate(async () => window.__TE_PPU_E2E__.finish('win'));
  await expect(page.getByTestId('result-score')).toHaveText('RUN SCORE 001000');
  await page.getByRole('button', { name: '다음 상대' }).click();
  await expect(page.getByTestId('floor-intro-screen')).toHaveAttribute(
    'data-encounter-index',
    '1',
  );
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await page.evaluate(async () => window.__TE_PPU_E2E__.finish('loss'));
  await expect(page.getByRole('button', { name: '도전 종료' })).toBeEnabled();
  await page.getByRole('button', { name: '도전 종료' }).click();

  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('tower-screen')).toHaveCount(0);
  await page.getByRole('button', { name: 'RANKING' }).click();
  await expect(page.getByTestId('ranking-screen')).toBeVisible();
  await expect(page.getByText('LOCAL RECORDS')).toBeVisible();
  const record = page.getByRole('row').filter({ hasText: 'RVT' });
  await expect(record).toContainText('리벳');
  await expect(record).toContainText('1,000');
  await expect(page.getByText('ONLINE RANKING SYNC PENDING')).toHaveCount(0);

  await page.getByRole('button', { name: 'BACK' }).click();
  await page.getByRole('button', { name: 'START RUN' }).click();
  await expect(page.getByTestId('tower-run-status')).toHaveText(
    'RUN ACTIVE · NEXT 1F · SCORE 000000',
  );
});

test('shows a usable tower screen in under ten seconds', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE);
  const elapsedMs = await openTower(page);

  expect(elapsedMs).toBeLessThan(10_000);
  await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
});

test('shows the mascot and all three ordered floor-one rivals', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE);
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
    await seedReturningProfile(page, RETURNING_PROFILE);
    await openMatch(page);

    await page.evaluate(async (forcedResult) => {
      await window.__TE_PPU_E2E__.finish(forcedResult);
    }, result);

    await expect(page.getByTestId('result-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  });
}

test('keeps historically unlocked floors behind the active ranked-run order', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE, {
    difficultyProgress: {
      easy: {
        highestUnlockedFloor: 5,
        clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
      },
    },
  });
  await openTower(page);

  await expect(page.getByRole('button', { name: '1층 선택' })).toBeEnabled();
  for (const floor of [2, 3, 4, 5]) {
    await expect(page.getByRole('button', { name: `${floor}층 선택` })).toBeDisabled();
  }
});

test('climbs all five floors in order, defeats the owl, and unlocks Normal', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE);
  await openMatch(page);

  for (const floor of [1, 2, 3, 4, 5] as const) {
    for (const encounterIndex of [0, 1, 2] as const) {
      const currentMatch = await page.evaluate(() => window.__TE_PPU_E2E__.currentMatch);
      expect(currentMatch).toEqual({ floor, encounterIndex, wins: encounterIndex });
      await expect(page.getByTestId('match-screen')).toHaveAttribute('data-floor', String(floor));
      await page.evaluate(async () => window.__TE_PPU_E2E__.finish('win'));
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
      } else if (floor < 5) {
        await page.getByRole('button', { name: '다음 층' }).click();
        await expect(page.getByTestId('tower-screen')).toBeVisible();
        await expect(page.getByTestId('tower-run-status')).toContainText(`NEXT ${floor + 1}F`);
        await page.getByRole('button', { name: `${floor + 1}층 선택` }).click();
        await expect(page.getByTestId('floor-intro-screen')).toHaveAttribute(
          'data-encounter-index',
          '0',
        );
        await page.getByRole('button', { name: '대전 시작' }).click();
        await expect(page.getByTestId('match-screen')).toBeVisible();
      }
    }
  }

  await page.getByRole('button', { name: '탑으로' }).click();
  await expect(page.getByTestId('owl-reveal-screen')).toBeVisible();
  await expect(page.getByText('탑의 설계자')).toBeVisible();
  await page.getByRole('button', { name: '부엉이와 대결' }).click();
  await expect(page.getByTestId('match-screen')).toHaveAttribute('data-encounter-kind', 'owl');
  await expect(page.getByText('탑의 설계자', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await window.__TE_PPU_E2E__.finish('win');
  });
  await expect(page.getByTestId('owl-result-screen')).toBeVisible();
  await page.getByRole('button', { name: '엔딩 보기' }).click();
  await expect(page.getByTestId('ending-screen')).toBeVisible();
  await expect(page.getByText('NORMAL 난이도 해금')).toBeVisible();
  await page.getByRole('button', { name: '타이틀로 돌아가기' }).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByRole('button', { name: 'START RUN' }).click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'NORMAL' })).toBeEnabled();
  await page.getByRole('button', { name: 'NORMAL' }).click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-difficulty', 'normal');
});

test('keeps floor two locked until all three floor-one wins are complete', async ({ page }) => {
  await seedReturningProfile(page, RETURNING_PROFILE);
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
      return raw === null ? null : JSON.parse(raw) as {
        highestUnlockedFloor?: number;
        difficultyProgress?: { easy?: { highestUnlockedFloor: number } };
      };
    });
    expect(progress?.difficultyProgress?.easy?.highestUnlockedFloor
      ?? progress?.highestUnlockedFloor
      ?? 1).toBe(encounterIndex === 2 ? 2 : 1);

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
