import { describe, expect, it } from 'vitest';
import { isDevClearedProgressEnabled } from './dev-cleared-mode';

describe('isDevClearedProgressEnabled', () => {
  it('enables an explicit request from only the dedicated Vite mode', () => {
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(true);
  });

  it.each(['browser', 'e2e'])('rejects a contaminated %s Vite mode', (mode) => {
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode,
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(false);
  });

  it('keeps non-development and packaged runtimes disabled', () => {
    expect(isDevClearedProgressEnabled({
      isDev: false,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'android',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'apps-in-toss',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      mode: 'dev-cleared',
      runtimeMode: 'browser',
      flag: undefined,
    })).toBe(false);
  });
});
