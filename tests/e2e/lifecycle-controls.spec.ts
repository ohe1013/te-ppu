import { expect, test } from '@playwright/test';
import { openMatch } from './helpers';

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
  expect(commands).toEqual([
    { type: 'move', dx: 1 },
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

test('pauses hidden match time and resumes only after the visible 3-2-1 countdown', async ({ page }) => {
  await openMatch(page);
  const tick = page.getByTestId('match-tick');
  await expect(tick).not.toHaveText('0');

  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('hidden'));
  const hiddenTick = await tick.textContent();
  await page.waitForTimeout(250);
  await expect(tick).toHaveText(hiddenTick ?? '');
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .toHaveAttribute('disabled', '');

  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('visible'));
  const countdown = page.getByRole('status', { name: '게임 재개 카운트다운' });
  await expect(countdown).toHaveText('3');
  await expect(countdown).toHaveText('2', { timeout: 1_500 });
  await expect(countdown).toHaveText('1', { timeout: 1_500 });
  await expect(countdown).not.toBeVisible({ timeout: 1_500 });
  await expect(page.getByRole('group', { name: '게임 조작' }))
    .not.toHaveAttribute('disabled', '');
  await expect(tick).not.toHaveText(hiddenTick ?? '');
});

test('pauses for exit, cancels safely, and closes only after confirmation', async ({ page }) => {
  await openMatch(page);

  await page.getByRole('button', { name: '게임 나가기' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
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
