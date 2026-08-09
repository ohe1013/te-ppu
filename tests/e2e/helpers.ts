import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';

interface BrowserErrorGuard {
  detach(): void;
  throwIfCaptured(): void;
}

export function createBrowserErrorGuard(page: Page): BrowserErrorGuard {
  const errors: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  };
  const onPageError = (error: Error) => {
    errors.push(`pageerror: ${error.message}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  return {
    detach() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
    throwIfCaptured() {
      if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    },
  };
}

export { expect };
export const test = base.extend<{ browserErrorGuard: void }>({
  browserErrorGuard: [async ({ page }, use) => {
    const guard = createBrowserErrorGuard(page);
    try {
      await use();
    } finally {
      guard.detach();
      guard.throwIfCaptured();
    }
  }, { auto: true }],
});

export async function openTower(page: Page): Promise<number> {
  const startedAt = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('tower-screen')).toBeVisible({ timeout: 10_000 });
  return Date.now() - startedAt;
}

export async function openMatch(page: Page): Promise<void> {
  await openTower(page);
  await page.getByRole('button', { name: '1층 선택' }).click();
  await expect(page.getByTestId('floor-intro-screen')).toBeVisible();
  await page.getByRole('button', { name: '대전 시작' }).click();
  await expect(page.getByTestId('match-screen')).toBeVisible();
  await expect(page.getByRole('group', { name: '게임 조작' })).toBeEnabled();
}
