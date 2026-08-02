import { describe, expect, it } from 'vitest';
import { resolveRuntimeMode } from './runtime-mode';

describe('resolveRuntimeMode', () => {
  it('accepts only the two supported adapters', () => {
    expect(resolveRuntimeMode('browser')).toBe('browser');
    expect(resolveRuntimeMode('apps-in-toss')).toBe('apps-in-toss');
    expect(() => resolveRuntimeMode('server')).toThrow('Unsupported runtime mode: server');
  });
});
