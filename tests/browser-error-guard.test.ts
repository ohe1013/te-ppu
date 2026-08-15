import { describe, expect, it, vi } from 'vitest';
import * as helpers from './e2e/helpers';

type Listener = (value: never) => void;

class FakePage {
  readonly off = vi.fn((event: string, listener: Listener) => {
    this.listeners.get(event)?.delete(listener);
    return this;
  });
  readonly on = vi.fn((event: string, listener: Listener) => {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  });
  private readonly listeners = new Map<string, Set<Listener>>();

  emit(event: string, value: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(value as never);
    }
  }
}

describe('createBrowserErrorGuard', () => {
  it('captures browser errors and detaches both listeners before reporting them', () => {
    const page = new FakePage();
    const createGuard = (helpers as unknown as {
      readonly createBrowserErrorGuard?: (target: FakePage) => {
        detach(): void;
        throwIfCaptured(): void;
      };
    }).createBrowserErrorGuard;

    expect(createGuard).toEqual(expect.any(Function));
    if (createGuard === undefined) return;

    const guard = createGuard(page);
    page.emit('console', { text: () => 'ignored warning', type: () => 'warning' });
    page.emit('console', { text: () => 'state update loop', type: () => 'error' });
    page.emit('pageerror', new Error('uncaught render error'));

    guard.detach();
    page.emit('console', { text: () => 'late error', type: () => 'error' });

    expect(page.on).toHaveBeenCalledTimes(2);
    expect(page.off).toHaveBeenCalledTimes(2);
    expect(() => guard.throwIfCaptured()).toThrow(
      'console.error: state update loop\npageerror: uncaught render error',
    );
  });
});
