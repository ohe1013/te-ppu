import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, seedReturningProfile, test } from '../e2e/helpers';

const MEDIA_ROOT = resolve(
  process.env.STORE_MEDIA_OUTPUT_DIR ?? 'artifacts/apps-in-toss/store-media',
);
const VIEWPORT = { width: 636, height: 1048 } as const;

async function waitForVisuals(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolveImage) => {
        image.addEventListener('load', () => resolveImage(), { once: true });
        image.addEventListener('error', () => resolveImage(), { once: true });
      });
    }));
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    });
  });
}

async function capture(page: Page, fileName: string): Promise<void> {
  await waitForVisuals(page);
  expect(page.viewportSize()).toEqual(VIEWPORT);
  await page.screenshot({
    animations: 'disabled',
    path: resolve(MEDIA_ROOT, fileName),
  });
}

async function hardDropWithJoystick(page: Page): Promise<void> {
  const joystick = page.locator('.joystick-control');
  const bounds = await joystick.boundingBox();
  if (bounds === null) throw new Error('Joystick is not visible');
  const x = bounds.x + (bounds.width / 2);
  const centerY = bounds.y + (bounds.height / 2);
  const dropY = bounds.y + bounds.height - 2;
  await page.mouse.move(x, centerY);
  await page.mouse.down();
  await page.mouse.move(x, dropY, { steps: 2 });
  await page.waitForTimeout(40);
  await page.mouse.up();
}

test('captures title, tower, and populated battle upload screenshots', async ({ page }) => {
  test.setTimeout(60_000);
  await mkdir(MEDIA_ROOT, { recursive: true });
  await seedReturningProfile(page, { initials: 'RVT', characterId: 'hero-engineer' });

  await page.goto('/');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await capture(page, 'screenshot-01-title.png');

  await page.getByTestId('title-screen').locator('.title-screen__action--start').click();
  await expect(page.getByTestId('tower-screen')).toBeVisible();
  await capture(page, 'screenshot-02-tower.png');

  await page.getByTestId('tower-screen').locator('.floor-card').first().click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByTestId('floor-intro-screen').locator('.screen-actions button').last().click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await expect(page.locator('fieldset.match-controls')).toBeEnabled({ timeout: 10_000 });
  for (let index = 0; index < 6; index += 1) {
    await hardDropWithJoystick(page);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.__TE_PPU_E2E__.setMatchPaused(true));
  const pausedTick = await page.getByTestId('match-tick').textContent();
  await page.waitForTimeout(100);
  await expect(page.getByTestId('match-tick')).toHaveText(pausedTick ?? '');
  await capture(page, 'screenshot-03-battle.png');
});
