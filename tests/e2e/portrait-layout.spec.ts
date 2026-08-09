import { type Locator, type Page } from '@playwright/test';
import { expect, openTower, test } from './helpers';

const FLOOR_FIVE_PROGRESS = {
  schemaVersion: 2,
  highestUnlockedFloor: 5,
  clearedFloors: { 1: true, 2: true, 3: true, 4: true, 5: false },
  settings: { soundEnabled: true, hapticsEnabled: true },
} as const;

const PORTRAITS = [
  { viewport: { width: 360, height: 640 } },
  { viewport: { width: 430, height: 932 } },
] as const;

type ElementBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

async function expectInsideViewport(
  locator: Locator,
  viewport: { readonly width: number; readonly height: number },
  label: string,
): Promise<ElementBox> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  const visibleBox = box!;
  expect(visibleBox.width, `${label} should have positive width`).toBeGreaterThan(0);
  expect(visibleBox.height, `${label} should have positive height`).toBeGreaterThan(0);
  expect(visibleBox.x, `${label} should stay inside the left edge`).toBeGreaterThanOrEqual(-0.5);
  expect(visibleBox.y, `${label} should stay inside the top edge`).toBeGreaterThanOrEqual(-0.5);
  expect(
    visibleBox.x + visibleBox.width,
    `${label} should stay inside the right edge`,
  ).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(
    visibleBox.y + visibleBox.height,
    `${label} should stay inside the bottom edge`,
  ).toBeLessThanOrEqual(viewport.height + 0.5);
  return visibleBox;
}

function expectNoBlockingOverlap(
  first: ElementBox,
  second: ElementBox,
  label: string,
): void {
  const overlapWidth = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width)
      - Math.max(first.x, second.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height)
      - Math.max(first.y, second.y),
  );
  expect(overlapWidth * overlapHeight, `${label} should not overlap`).toBeLessThanOrEqual(0.5);
}

async function openFloorFiveMatch(page: Page): Promise<void> {
  await openTower(page);
  await page.evaluate((progress) => {
    window.localStorage.setItem('te-ppu.progress', JSON.stringify(progress));
  }, FLOOR_FIVE_PROGRESS);
  await page.reload();
  await expect(page.getByTestId('tower-screen')).toBeVisible();

  const floorCards = page.getByRole('button', { name: /층 선택/ });
  await expect(floorCards).toHaveCount(5);
  const floorFive = floorCards.last();
  await floorFive.scrollIntoViewIfNeeded();
  await floorFive.click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await expect(page.getByTestId('match-screen')).toHaveAttribute('data-floor', '5');
  await expect(page.getByRole('group', { name: '게임 조작' })).toBeEnabled();
}

for (const { viewport } of PORTRAITS) {
  test(`keeps the five-floor tower and floor-5 match usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTower(page);

    const floorCards = page.getByRole('button', { name: /층 선택/ });
    await expect(floorCards).toHaveCount(5);
    const appShell = page.getByTestId('app-shell');
    const towerMetrics = await appShell.evaluate((node) => ({
      clientWidth: node.clientWidth,
      overflowY: getComputedStyle(node).overflowY,
      scrollWidth: node.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
      rootWidth: document.documentElement.scrollWidth,
    }));
    expect(towerMetrics.scrollWidth).toBeLessThanOrEqual(towerMetrics.clientWidth);
    expect(towerMetrics.rootWidth).toBeLessThanOrEqual(towerMetrics.rootClientWidth);
    expect(towerMetrics.overflowY).toBe('auto');

    const firstFloor = floorCards.first();
    const lastFloor = floorCards.last();
    await expectInsideViewport(firstFloor, viewport, 'first floor card');
    const lastFloorBeforeScroll = await lastFloor.boundingBox();
    expect(lastFloorBeforeScroll, 'last floor card should have a bounding box').not.toBeNull();
    expect(lastFloorBeforeScroll!.x).toBeGreaterThanOrEqual(-0.5);
    expect(lastFloorBeforeScroll!.x + lastFloorBeforeScroll!.width)
      .toBeLessThanOrEqual(viewport.width + 0.5);
    const scrollTopBefore = await appShell.evaluate((node) => node.scrollTop);
    await lastFloor.scrollIntoViewIfNeeded();
    const scrollTopAfter = await appShell.evaluate((node) => node.scrollTop);
    if (viewport.width === 360 && viewport.height === 640) {
      expect(scrollTopAfter, 'floor 5 should remain reachable in the compact tower scroll')
        .toBeGreaterThanOrEqual(scrollTopBefore);

      await page.setViewportSize({ width: viewport.width, height: 480 });
      await firstFloor.scrollIntoViewIfNeeded();
      const constrainedBefore = await appShell.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
      }));
      expect(constrainedBefore.scrollHeight, 'the constrained tower should overflow app-shell')
        .toBeGreaterThan(constrainedBefore.clientHeight);
      await lastFloor.scrollIntoViewIfNeeded();
      const constrainedScrollTopAfter = await appShell.evaluate((node) => node.scrollTop);
      expect(constrainedScrollTopAfter, 'floor 5 should scroll the constrained app-shell')
        .toBeGreaterThan(constrainedBefore.scrollTop);
      await page.setViewportSize(viewport);
    }
    await expectInsideViewport(lastFloor, viewport, 'last floor card after scrolling');

    await openFloorFiveMatch(page);

    const portraitSize = viewport.height <= 700 ? 40 : 52;
    const portraits = page.locator('.battle-hud__portrait');
    await expect(portraits).toHaveCount(2);
    const portraitMetrics = await portraits.evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        height: Number.parseFloat(style.height),
        state: node.getAttribute('data-portrait-state'),
        width: Number.parseFloat(style.width),
      };
    }));
    expect(portraitMetrics).toEqual([
      { height: portraitSize, state: expect.any(String), width: portraitSize },
      { height: portraitSize, state: expect.any(String), width: portraitSize },
    ]);

    const matchHeader = await expectInsideViewport(
      page.locator('.match-header'),
      viewport,
      'match header',
    );
    const battleCanvas = page.getByTestId('battle-canvas');
    const battleCanvasBox = await expectInsideViewport(
      battleCanvas,
      viewport,
      'battle canvas',
    );
    const itemControls = await expectInsideViewport(
      page.locator('.item-controls'),
      viewport,
      'item controls',
    );
    const joystick = await expectInsideViewport(
      page.getByRole('group', { name: '이동 조이스틱' }),
      viewport,
      'joystick',
    );
    const rotate = await expectInsideViewport(
      page.getByRole('button', { name: '시계 방향 회전' }),
      viewport,
      'rotate control',
    );

    const matchElements = [
      { label: 'match header', box: matchHeader },
      { label: 'battle canvas', box: battleCanvasBox },
      { label: 'item controls', box: itemControls },
      { label: 'joystick', box: joystick },
      { label: 'rotate control', box: rotate },
    ] as const;
    for (let firstIndex = 0; firstIndex < matchElements.length; firstIndex += 1) {
      const first = matchElements[firstIndex]!;
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < matchElements.length;
        secondIndex += 1
      ) {
        const second = matchElements[secondIndex]!;
        expectNoBlockingOverlap(
          first.box,
          second.box,
          `${first.label} and ${second.label}`,
        );
      }
    }

    const metrics = await battleCanvas.evaluate((node) => ({
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

    expect(metrics.player).toEqual(metrics.opponent);
    expect(metrics.player.width).toBeGreaterThan(0);
    expect(metrics.player.height).toBe(metrics.player.width * 2);
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
