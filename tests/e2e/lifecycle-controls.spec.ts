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

test('signals lifecycle changes through the typed driver contract', async ({ page }) => {
  await openMatch(page);
  const states: string[] = [];
  await page.exposeFunction('captureLifecycleState', (state: string) => states.push(state));
  await page.evaluate(() => {
    document.addEventListener('visibilitychange', () => {
      void (window as unknown as Window & {
        captureLifecycleState(state: string): Promise<void>;
      }).captureLifecycleState(document.visibilityState);
    });
  });

  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('hidden'));
  await page.evaluate(() => window.__TE_PPU_E2E__.setLifecycle('visible'));

  await expect.poll(() => states).toEqual(['hidden', 'visible']);
});
