import { describe, expect, it } from 'vitest';
import { isDevClearedProgressEnabled } from './dev-cleared-mode';

describe('isDevClearedProgressEnabled', () => {
  it('enables only an explicit browser development request', () => {
    expect(isDevClearedProgressEnabled({
      isDev: true,
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(true);
    expect(isDevClearedProgressEnabled({
      isDev: false,
      runtimeMode: 'browser',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      runtimeMode: 'android',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      runtimeMode: 'apps-in-toss',
      flag: 'true',
    })).toBe(false);
    expect(isDevClearedProgressEnabled({
      isDev: true,
      runtimeMode: 'browser',
      flag: undefined,
    })).toBe(false);
  });
});
