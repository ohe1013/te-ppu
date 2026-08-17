import type { Page } from '@playwright/test';
import {
  cloneProgressState,
  DEFAULT_PROGRESS,
  parseProgressState,
} from '../../src/progression';

export const ORDINARY_PROGRESS_KEY = 'te-ppu.progress.identity.local.local-browser';
export const DEV_CLEARED_PROGRESS_KEY =
  'te-ppu.progress.dev-cleared.identity.local.local-browser';

const ordinaryProgress = cloneProgressState(DEFAULT_PROGRESS);
ordinaryProgress.profile = { initials: 'ORD', characterId: 'star-alchemist' };
ordinaryProgress.settings.bgmVolume = 23;

const validatedOrdinaryProgress = parseProgressState(ordinaryProgress);
if (validatedOrdinaryProgress === null) {
  throw new Error('The dev-mode ordinary progress fixture must be schema-valid.');
}

export const ORDINARY_PROGRESS_RAW = JSON.stringify(validatedOrdinaryProgress);

export async function seedOrdinaryProgress(page: Page): Promise<void> {
  await page.addInitScript(({ key, raw }) => {
    window.localStorage.setItem(key, raw);
  }, { key: ORDINARY_PROGRESS_KEY, raw: ORDINARY_PROGRESS_RAW });
}
