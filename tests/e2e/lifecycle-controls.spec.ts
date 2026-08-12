import type { Page } from '@playwright/test';
import {
  expect,
  LOCAL_PROGRESS_KEY,
  openMatch,
  seedReturningProfile,
  test,
} from './helpers';

type Insets = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

const ASYMMETRIC_SAFE_AREA: Insets = {
  top: 47,
  right: 29,
  bottom: 21,
  left: 13,
};

const VOLUME_RELOAD_PERSISTENCE_TEST =
  'persists independent volumes through full reload and shows them in the next match';

async function expectViewportCenteredOverlay(page: Page, insets?: Insets): Promise<void> {
  const geometry = await page.locator('.modal-overlay').evaluate((overlay) => {
    const overlayRect = overlay.getBoundingClientRect();
    const overlayStyle = getComputedStyle(overlay);
    const surface = overlay.querySelector<HTMLElement>('.modal-overlay__surface');
    if (surface === null) throw new Error('missing modal surface');
    const surfaceRect = surface.getBoundingClientRect();
    return {
      position: getComputedStyle(overlay).position,
      padding: {
        bottom: overlayStyle.paddingBottom,
        left: overlayStyle.paddingLeft,
        right: overlayStyle.paddingRight,
        top: overlayStyle.paddingTop,
      },
      overlayRect: {
        left: overlayRect.left,
        top: overlayRect.top,
        right: overlayRect.right,
        bottom: overlayRect.bottom,
      },
      centerDeltaX: Math.abs(
        surfaceRect.left + surfaceRect.width / 2 - window.innerWidth / 2,
      ),
      centerDeltaY: Math.abs(
        surfaceRect.top + surfaceRect.height / 2 - window.innerHeight / 2,
      ),
      surfaceRect: {
        bottom: surfaceRect.bottom,
        left: surfaceRect.left,
        right: surfaceRect.right,
        top: surfaceRect.top,
      },
      viewport: { height: window.innerHeight, width: window.innerWidth },
    };
  });
  expect(geometry.position).toBe('fixed');
  expect(geometry.overlayRect.left).toBe(0);
  expect(geometry.overlayRect.top).toBe(0);
  expect(geometry.overlayRect.right).toBe(page.viewportSize()!.width);
  expect(geometry.overlayRect.bottom).toBe(page.viewportSize()!.height);
  expect(geometry.centerDeltaX, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
  expect(geometry.centerDeltaY, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
  if (insets !== undefined) {
    expect(geometry.surfaceRect.top).toBeGreaterThanOrEqual(insets.top);
    expect(geometry.surfaceRect.right).toBeLessThanOrEqual(page.viewportSize()!.width - insets.right);
    expect(geometry.surfaceRect.bottom).toBeLessThanOrEqual(page.viewportSize()!.height - insets.bottom);
    expect(geometry.surfaceRect.left).toBeGreaterThanOrEqual(insets.left);
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title === VOLUME_RELOAD_PERSISTENCE_TEST) return;
  await seedReturningProfile(page, {
    initials: 'RVT',
    characterId: 'hero-engineer',
  });
});

test(VOLUME_RELOAD_PERSISTENCE_TEST, async ({ context, page }) => {
  const seedPage = await context.newPage();
  await seedReturningProfile(seedPage, {
    initials: 'RVT',
    characterId: 'hero-engineer',
  });
  await seedPage.goto('/');
  await expect(seedPage.getByTestId('title-screen')).toBeVisible();
  await seedPage.close();

  await openMatch(page);
  await page.getByRole('button', { name: '설정' }).click();
  const bgm = page.getByRole('slider', { name: 'BGM 음량' });
  const sfx = page.getByRole('slider', { name: '효과음 음량' });

  await expect(page.getByRole('dialog', { name: '게임 설정' })).toBeVisible();
  await expect(bgm).toHaveValue('70');
  await expect(sfx).toHaveValue('100');
  await bgm.fill('40');
  await bgm.dispatchEvent('pointerup');
  await sfx.fill('80');
  await sfx.dispatchEvent('pointerup');
  await expect(bgm).toHaveValue('40');
  await expect(sfx).toHaveValue('80');

  await page.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('40');
  await expect(page.getByRole('slider', { name: '효과음 음량' })).toHaveValue('80');
  await expect.poll(() => page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    if (serialized === null) return null;
    const progress = JSON.parse(serialized) as {
      settings?: { bgmVolume?: number; sfxVolume?: number };
    };
    return progress.settings;
  }, LOCAL_PROGRESS_KEY)).toMatchObject({ bgmVolume: 40, sfxVolume: 80 });

  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByRole('button', { name: '도전 시작' }).click();
  await page.getByRole('button', { name: '1층 선택' }).click();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('40');
  await expect(page.getByRole('slider', { name: '효과음 음량' })).toHaveValue('80');
});

test('dispatches joystick commands in order and rotates exactly once per tap', async ({ page }) => {
  await openMatch(page);
  const joystick = page.getByRole('group', { name: '이동 조이스틱' });
  const box = await joystick.boundingBox();
  expect(box).not.toBeNull();
  const { height, width, x, y } = box!;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.min(width, height) / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + radius * 0.65, centerY);
  await page.mouse.move(centerX, centerY + radius * 0.65);
  await page.mouse.up();
  await page.getByRole('button', { name: '시계 방향 회전' }).click();

  const commands = await page.evaluate(() => window.__TE_PPU_E2E__.dispatchedCommands);
  const firstNonMove = commands.findIndex(({ type }) => type !== 'move');
  expect(firstNonMove).toBeGreaterThan(0);
  expect(commands.slice(0, firstNonMove)).toEqual(
    Array.from({ length: firstNonMove }, () => ({ type: 'move', dx: 1 })),
  );
  expect(commands.slice(firstNonMove)).toEqual([
    { type: 'soft-drop', active: true },
    { type: 'soft-drop', active: false },
    { type: 'rotate-clockwise' },
  ]);
});

test('keeps blank and outside row gestures inert and dispatches the valid row', async ({ page }) => {
  await openMatch(page);
  const rowItem = page.getByRole('button', { name: '행 제거 · 1회' });
  await rowItem.click();

  const selector = page.getByRole('group', { name: '행 제거 대상 선택' });
  await expect(selector).toBeVisible();
  await page.getByRole('button', { name: '1번째 행, 빈 행', exact: true }).click();
  await expect(selector).toBeVisible();
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.dispatchedCommands)).toEqual([]);

  const box = await selector.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 8, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(selector).not.toBeVisible();
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.dispatchedCommands)).toEqual([]);

  await rowItem.click();
  await page.getByRole('button', { name: '20번째 행, 제거 가능' }).click();
  await expect(selector).not.toBeVisible();
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.dispatchedCommands)).toEqual([
    { type: 'use-row-clear', row: 19 },
  ]);
});

test('preserves chosen volumes while hidden and resumes only after the visible 3-2-1 countdown', async ({ page }) => {
  await openMatch(page);
  const tick = page.getByTestId('match-tick');
  await expect(tick).not.toHaveText('0');

  await page.getByRole('button', { name: '설정' }).click();
  const bgm = page.getByRole('slider', { name: 'BGM 음량' });
  const sfx = page.getByRole('slider', { name: '효과음 음량' });
  await bgm.fill('40');
  await bgm.dispatchEvent('pointerup');
  await sfx.fill('80');
  await sfx.dispatchEvent('pointerup');
  await expect(bgm).toHaveValue('40');
  await expect(sfx).toHaveValue('80');
  await page.getByRole('button', { name: '설정 닫기' }).click();

  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('hidden'));
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .toHaveAttribute('disabled', '');
  const hiddenTick = await tick.textContent();
  await page.waitForTimeout(250);
  await expect(tick).toHaveText(hiddenTick ?? '');

  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('visible'));
  const countdown = page.getByRole('status', { name: '게임 재개 카운트다운' });
  await expect(countdown).toHaveText('3');
  await expectViewportCenteredOverlay(page);
  await expect(countdown).toHaveText('2', { timeout: 1_500 });
  await expect(countdown).toHaveText('1', { timeout: 1_500 });
  await expect(countdown).not.toBeVisible({ timeout: 1_500 });
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .not.toHaveAttribute('disabled', '');
  await expect(tick).not.toHaveText(hiddenTick ?? '');

  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByRole('slider', { name: 'BGM 음량' })).toHaveValue('40');
  await expect(page.getByRole('slider', { name: '효과음 음량' })).toHaveValue('80');
});

test('pauses for exit, cancels safely, and closes only after confirmation', async ({ page }) => {
  await openMatch(page);

  await page.getByRole('button', { name: '게임 나가기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectViewportCenteredOverlay(page);
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .toHaveAttribute('disabled', '');
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.closeCount)).toBe(0);

  await page.getByRole('button', { name: '계속하기' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .not.toHaveAttribute('disabled', '');
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.closeCount)).toBe(0);

  await page.getByRole('button', { name: '게임 나가기' }).click();
  await page.getByRole('button', { name: '게임 나가기 확인' }).click();
  await expect.poll(
    () => page.evaluate(() => window.__TE_PPU_E2E__.closeCount),
  ).toBe(1);
});

test('shows a hanging close timeout and allows one retry after failure', async ({ page }) => {
  await openMatch(page);

  await page.evaluate(() => window.__TE_PPU_E2E__.setCloseMode('hang'));
  await page.getByRole('button', { name: '게임 나가기' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: '게임 나가기 확인' });
  await confirm.evaluate((button) => {
    button.addEventListener('click', () => {
      document.documentElement.dataset.closeStartedAt = String(performance.now());
    }, { capture: true, once: true });
  });
  await confirm.click();
  await page.waitForFunction(() => (
    document.querySelector('[role="status"]')?.textContent?.includes('다시 시도')
  ));
  await expect(page.getByRole('status')).toContainText('다시 시도');
  const closeElapsedMs = await page.evaluate(() => (
    performance.now() - Number(document.documentElement.dataset.closeStartedAt)
  ));
  expect(closeElapsedMs).toBeLessThan(800);
  await expect(dialog.getByRole('status')).toHaveText('게임을 닫지 못했습니다. 다시 시도해 주세요.');
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.closeCount)).toBe(1);

  await page.evaluate(() => window.__TE_PPU_E2E__.setCloseMode('resolve'));
  await dialog.getByRole('button', { name: '게임 나가기 확인' }).click();
  await expect(dialog).toHaveAttribute('data-close-state', 'closing');
  expect(await page.evaluate(() => window.__TE_PPU_E2E__.closeCount)).toBe(2);
});

for (const viewport of [
  { height: 640, width: 360 },
  { height: 932, width: 430 },
] as const) {
  test(`keeps every overlay viewport-centered with asymmetric safe areas at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.addInitScript((insets: Insets) => {
      (window as Window & { __TE_PPU_E2E_SAFE_AREA__?: Insets }).__TE_PPU_E2E_SAFE_AREA__ = insets;
    }, ASYMMETRIC_SAFE_AREA);
    await page.setViewportSize(viewport);
    await openMatch(page);

    await page.getByRole('button', { name: '설정' }).click();
    await expect(page.getByTestId('settings-overlay')).toBeVisible();
    await expectViewportCenteredOverlay(page, ASYMMETRIC_SAFE_AREA);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '게임 나가기' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectViewportCenteredOverlay(page, ASYMMETRIC_SAFE_AREA);
    await page.getByRole('button', { name: '계속하기' }).click();

    await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('hidden'));
    await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('visible'));
    await expect(page.getByRole('status', { name: '게임 재개 카운트다운' })).toHaveText('3');
    await expectViewportCenteredOverlay(page, ASYMMETRIC_SAFE_AREA);
  });
}
