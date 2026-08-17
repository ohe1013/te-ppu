import { describe, expect, it } from 'vitest';
import { resolveRuntimeMode } from './runtime-mode';

describe('resolveRuntimeMode', () => {
  it('accepts each packaged runtime and rejects unsupported values', () => {
    expect(resolveRuntimeMode('browser')).toBe('browser');
    expect(resolveRuntimeMode('apps-in-toss')).toBe('apps-in-toss');
    expect(resolveRuntimeMode('android')).toBe('android');
    expect(() => resolveRuntimeMode('server')).toThrow('Unsupported runtime mode: server');
  });
});
