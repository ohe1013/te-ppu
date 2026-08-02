import { expect, test } from '@playwright/test';
import { openMatch, openTower } from './helpers';

const PORTRAITS = [
  { viewport: { width: 360, height: 640 }, board: { width: 160, height: 320 } },
  { viewport: { width: 430, height: 932 }, board: { width: 194, height: 388 } },
] as const;

for (const { board, viewport } of PORTRAITS) {
  test(`keeps exact equal boards and zero overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMatch(page);

    const metrics = await page.getByTestId('battle-canvas').evaluate((node) => ({
      opponent: {
        height: Number(node.dataset.opponentBoardHeight),
        width: Number(node.dataset.opponentBoardWidth),
      },
      player: {
        height: Number(node.dataset.playerBoardHeight),
        width: Number(node.dataset.playerBoardWidth),
      },
      overflow: {
        bodyHeight: document.body.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        rootHeight: document.documentElement.scrollHeight,
        rootWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      },
    }));

    expect(metrics.player).toEqual(board);
    expect(metrics.opponent).toEqual(board);
    expect(metrics.overflow.bodyWidth).toBeLessThanOrEqual(metrics.overflow.viewportWidth);
    expect(metrics.overflow.rootWidth).toBeLessThanOrEqual(metrics.overflow.viewportWidth);
    expect(metrics.overflow.bodyHeight).toBeLessThanOrEqual(metrics.overflow.viewportHeight);
    expect(metrics.overflow.rootHeight).toBeLessThanOrEqual(metrics.overflow.viewportHeight);
  });
}

test('publishes deterministic safe-area CSS variables through the E2E platform', async ({ page }) => {
  await openTower(page);

  const variables = await page.locator('[data-safe-area-provider]').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      bottom: style.getPropertyValue('--safe-area-bottom').trim(),
      left: style.getPropertyValue('--safe-area-left').trim(),
      right: style.getPropertyValue('--safe-area-right').trim(),
      top: style.getPropertyValue('--safe-area-top').trim(),
    };
  });

  expect(variables).toEqual({
    bottom: '8px',
    left: '4px',
    right: '6px',
    top: '2px',
  });
});
