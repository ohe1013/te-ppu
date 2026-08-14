import { type Locator, type Page } from '@playwright/test';
import {
  expect,
  openTower as enterTower,
  seedReturningProfile,
  test,
} from './helpers';

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

async function openFloorOneMatch(page: Page): Promise<void> {
  const floorCards = page.getByRole('button', { name: /층 선택/ });
  await expect(floorCards).toHaveCount(5);
  await floorCards.first().click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await expect(page.getByTestId('match-screen')).toHaveAttribute('data-floor', '1');
  await expect(page.getByRole('group', { name: '게임 조작' })).toBeEnabled();
}

for (const { viewport } of PORTRAITS) {
  test(`keeps the five-floor tower and legal floor-1 match usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await seedReturningProfile(page, {
      initials: 'RVT',
      characterId: 'hero-engineer',
    });
    await page.setViewportSize(viewport);
    await enterTower(page);

    const floorCards = page.getByRole('button', { name: /층 선택/ });
    await expect(floorCards).toHaveCount(5);
    const appShell = page.getByTestId('app-shell');
    const towerRoute = page.getByTestId('tower-route');
    const appMetrics = await appShell.evaluate((node) => ({
      clientHeight: node.clientHeight,
      clientWidth: node.clientWidth,
      overflowY: getComputedStyle(node).overflowY,
      scrollHeight: node.scrollHeight,
      scrollWidth: node.scrollWidth,
      rootClientWidth: document.documentElement.clientWidth,
      rootWidth: document.documentElement.scrollWidth,
    }));
    const routeMetrics = await towerRoute.evaluate((node) => ({
      clientHeight: node.clientHeight,
      clientWidth: node.clientWidth,
      overflowY: getComputedStyle(node).overflowY,
      scrollHeight: node.scrollHeight,
      scrollWidth: node.scrollWidth,
    }));
    expect(appMetrics.scrollWidth).toBeLessThanOrEqual(appMetrics.clientWidth);
    expect(appMetrics.scrollHeight).toBeLessThanOrEqual(appMetrics.clientHeight);
    expect(appMetrics.rootWidth).toBeLessThanOrEqual(appMetrics.rootClientWidth);
    expect(appMetrics.overflowY).toBe('auto');
    expect(routeMetrics.scrollWidth).toBeLessThanOrEqual(routeMetrics.clientWidth);
    expect(routeMetrics.scrollHeight).toBeGreaterThan(routeMetrics.clientHeight);
    expect(routeMetrics.overflowY).toBe('auto');

    const towerHeaderMetrics = await page.locator('.tower-screen__header').evaluate((header) => {
      const mascot = header.querySelector<HTMLElement>('.tower-screen__mascot');
      const title = header.querySelector<HTMLElement>('h1');
      const home = header.querySelector<HTMLElement>('.tower-screen__back');
      if (mascot === null || title === null || home === null) {
        throw new Error('tower header controls are missing');
      }
      const overlapArea = (first: DOMRect, second: DOMRect) => Math.max(
        0,
        Math.min(first.right, second.right) - Math.max(first.left, second.left),
      ) * Math.max(
        0,
        Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
      );
      const titleStyle = getComputedStyle(title);
      const titleRange = document.createRange();
      titleRange.selectNodeContents(title);
      const lineBounds = new Map<number, { left: number; right: number }>();
      for (const rect of titleRange.getClientRects()) {
        const key = Math.round(rect.top);
        const current = lineBounds.get(key);
        lineBounds.set(key, current === undefined
          ? { left: rect.left, right: rect.right }
          : { left: Math.min(current.left, rect.left), right: Math.max(current.right, rect.right) });
      }
      return {
        homeWidth: home.getBoundingClientRect().width,
        homeOverlapsMascot: overlapArea(home.getBoundingClientRect(), mascot.getBoundingClientRect()),
        homeOverlapsTitle: overlapArea(home.getBoundingClientRect(), title.getBoundingClientRect()),
        mascotOverlapsTitle: overlapArea(mascot.getBoundingClientRect(), title.getBoundingClientRect()),
        titleHeight: title.getBoundingClientRect().height,
        titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
        titleLineWidths: [...lineBounds.values()].map((line) => line.right - line.left),
      };
    });
    expect.soft(towerHeaderMetrics.homeWidth, 'tower home button should stay compact')
      .toBeLessThanOrEqual(140);
    expect.soft(towerHeaderMetrics.homeOverlapsMascot, 'tower home button should not cover the owl')
      .toBeLessThanOrEqual(0.5);
    expect.soft(towerHeaderMetrics.homeOverlapsTitle, 'tower home button should not cover the title')
      .toBeLessThanOrEqual(0.5);
    expect.soft(towerHeaderMetrics.mascotOverlapsTitle, 'tower title should not cover the owl')
      .toBeLessThanOrEqual(0.5);
    if (viewport.width === 360 && viewport.height === 640) {
      expect.soft(towerHeaderMetrics.titleHeight, 'tower title should use at most two lines at 360px')
        .toBeLessThanOrEqual(towerHeaderMetrics.titleLineHeight * 2 + 1);
      expect.soft(towerHeaderMetrics.titleLineWidths.length, 'tower title should use at most two text lines at 360px')
        .toBeLessThanOrEqual(2);
      if (towerHeaderMetrics.titleLineWidths.length === 2) {
        expect.soft(
          towerHeaderMetrics.titleLineWidths[1],
          'tower title should not leave an orphaned final word at 360px',
        ).toBeGreaterThanOrEqual(towerHeaderMetrics.titleLineWidths[0]! * 0.45);
      }
    }

    const firstFloor = floorCards.first();
    const lastFloor = floorCards.last();
    await expectInsideViewport(firstFloor, viewport, 'floor 1 at tower entry');
    const lastFloorBeforeScroll = await lastFloor.boundingBox();
    expect(lastFloorBeforeScroll, 'last floor card should have a bounding box').not.toBeNull();
    expect(lastFloorBeforeScroll!.x).toBeGreaterThanOrEqual(-0.5);
    expect(lastFloorBeforeScroll!.x + lastFloorBeforeScroll!.width)
      .toBeLessThanOrEqual(viewport.width + 0.5);
    const appScrollTopBefore = await appShell.evaluate((node) => node.scrollTop);
    const routeScrollTopBefore = await towerRoute.evaluate((node) => node.scrollTop);
    await lastFloor.scrollIntoViewIfNeeded();
    const appScrollTopAfter = await appShell.evaluate((node) => node.scrollTop);
    const routeScrollTopAfter = await towerRoute.evaluate((node) => node.scrollTop);
    expect(routeScrollTopAfter, 'floor 5 should scroll the tower route')
      .toBeGreaterThan(routeScrollTopBefore);
    expect(appScrollTopAfter, 'floor 5 should not scroll the app shell')
      .toBe(appScrollTopBefore);
    await expectInsideViewport(lastFloor, viewport, 'last floor card after scrolling');
    if (viewport.width === 360 && viewport.height === 640) {
      await page.setViewportSize({ width: viewport.width, height: 480 });
      const constrainedBefore = await towerRoute.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
      }));
      expect(constrainedBefore.scrollHeight, 'the constrained tower route should remain scrollable')
        .toBeGreaterThan(constrainedBefore.clientHeight);
      const constrainedAppScrollTopBefore = await appShell.evaluate((node) => node.scrollTop);
      await firstFloor.scrollIntoViewIfNeeded();
      const constrainedRouteScrollTopAfter = await towerRoute.evaluate((node) => node.scrollTop);
      const constrainedAppScrollTopAfter = await appShell.evaluate((node) => node.scrollTop);
      expect(constrainedRouteScrollTopAfter, 'floor 1 should scroll back within the tower route')
        .toBeLessThan(constrainedBefore.scrollTop);
      expect(constrainedAppScrollTopAfter, 'floor 1 should not scroll the constrained app shell')
        .toBe(constrainedAppScrollTopBefore);
      await page.setViewportSize(viewport);
    }

    await openFloorOneMatch(page);

    const minimumPortraitSize = viewport.height <= 700 ? 60 : 68;
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
    const portraitImages = portraits.locator('img');
    await expect(portraitImages).toHaveCount(2);
    const portraitImageMetrics = await portraitImages.evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        height: box.height,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        width: box.width,
      };
    }));
    const nextQueues = page.locator('.battle-hud__next');
    await expect(nextQueues).toHaveCount(2);
    for (const queue of await nextQueues.all()) {
      await expect(queue.locator('[data-piece-preview]')).toHaveCount(2);
    }
    const nextPreviews = page.locator('[data-piece-preview]');
    await expect(nextPreviews).toHaveCount(4);
    for (const preview of await nextPreviews.all()) {
      const cells = preview.locator('[data-piece-cell]');
      await expect(cells).toHaveCount(4);
      for (const cell of await cells.all()) await expect(cell).toBeVisible();
    }
    const nextPreviewMetrics = await nextPreviews.evaluateAll((nodes) => nodes.map((node) => {
      const previewBox = node.getBoundingClientRect();
      const grid = node.querySelector<HTMLElement>('[data-piece-grid]');
      if (grid === null) throw new Error('NEXT preview grid is missing');
      const gridBox = grid.getBoundingClientRect();
      const cells = [...node.querySelectorAll<HTMLElement>('[data-piece-cell]')];
      return {
        cellCount: cells.length,
        centerDeltaX: Math.abs(
          previewBox.x + previewBox.width / 2 - (gridBox.x + gridBox.width / 2),
        ),
        centerDeltaY: Math.abs(
          previewBox.y + previewBox.height / 2 - (gridBox.y + gridBox.height / 2),
        ),
        kind: (node as HTMLElement).dataset.pieceKind,
        visibleText: (node as HTMLElement).innerText.trim(),
      };
    }));
    const nextQueueMetrics = await nextQueues.evaluateAll((nodes) => nodes.map((node) => {
      const card = node.closest<HTMLElement>('.battle-hud');
      if (card === null) throw new Error('NEXT queue is missing its character card');
      const itemBoxes = [...node.querySelectorAll<HTMLElement>(':scope > li')]
        .map((item) => item.getBoundingClientRect());
      if (itemBoxes.length === 0) throw new Error('NEXT queue has no preview tiles');
      const groupLeft = Math.min(...itemBoxes.map((item) => item.left));
      const groupRight = Math.max(...itemBoxes.map((item) => item.right));
      const cardBox = card.getBoundingClientRect();
      return {
        centerDeltaX: Math.abs(
          groupLeft + (groupRight - groupLeft) / 2 - (cardBox.left + cardBox.width / 2),
        ),
        side: card.dataset.side,
      };
    }));

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

    const rotateWidth = viewport.width <= 360
      ? { minimum: 75, maximum: 76 }
      : { minimum: 79, maximum: 80 };
    expect(rotate.width).toBeGreaterThanOrEqual(rotateWidth.minimum);
    expect(rotate.width).toBeLessThanOrEqual(rotateWidth.maximum);
    expect(Math.abs(rotate.width - rotate.height)).toBeLessThanOrEqual(1);

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
    if (viewport.width === 360 && viewport.height === 640) {
      expect(battleCanvasBox.width).toBeCloseTo(328, 1);
      expect(battleCanvasBox.height).toBeCloseTo(298.25, 1);
      expect(metrics.player).toEqual({ width: 149, height: 298 });
    }

    const layoutEvidence = JSON.stringify({
      battleCanvas: battleCanvasBox,
      boards: metrics.player,
      images: portraitImageMetrics,
      portraits: portraitMetrics,
      viewport,
    });
    for (const portrait of portraitMetrics) {
      expect(portrait.width, layoutEvidence).toBeGreaterThanOrEqual(minimumPortraitSize);
      expect(portrait.height, layoutEvidence).toBeGreaterThanOrEqual(minimumPortraitSize);
      expect(portrait.state, layoutEvidence).toEqual(expect.any(String));
    }
    for (const image of portraitImageMetrics) {
      expect(image.width, 'portrait image should have visible width').toBeGreaterThan(0);
      expect(image.height, 'portrait image should have visible height').toBeGreaterThan(0);
      expect(image.objectFit).toBe('cover');
      expect(image.objectPosition).toBe('50% 50%');
    }
    for (const preview of nextPreviewMetrics) {
      expect(preview.cellCount, `${preview.kind} NEXT should render four cells`).toBe(4);
      expect(preview.visibleText, `${preview.kind} should not render a visible kind letter`).toBe('');
      expect(preview.centerDeltaX, `${preview.kind} NEXT should be horizontally centered`)
        .toBeLessThanOrEqual(1);
      expect(preview.centerDeltaY, `${preview.kind} NEXT should be vertically centered`)
        .toBeLessThanOrEqual(1);
    }
    for (const queue of nextQueueMetrics) {
      expect(queue.centerDeltaX, `${queue.side} NEXT preview group should be centered in its card`)
        .toBeLessThanOrEqual(1);
    }
  });
}

test('publishes deterministic safe-area CSS variables through the E2E platform', async ({ page }) => {
  await seedReturningProfile(page, {
    initials: 'RVT',
    characterId: 'hero-engineer',
  });
  await enterTower(page);

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
