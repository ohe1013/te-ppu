import { describe, expect, it, vi } from 'vitest';
import { closeWithTimeout } from './close-with-timeout';

describe('closeWithTimeout', () => {
  it('resolves the close and clears the timeout after a prompt result', async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => undefined);

    await expect(closeWithTimeout(close)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('invokes close synchronously and rejects after the 400 ms default', async () => {
    vi.useFakeTimers();
    let invoked = false;

    const pending = closeWithTimeout(() => {
      invoked = true;
      return new Promise<void>(() => undefined);
    });

    expect(invoked).toBe(true);
    const timeout = expect(pending).rejects.toThrow('CLOSE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(399);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await timeout;
    vi.useRealTimers();
  });

  it('forwards a platform close failure and permits a later caller to retry', async () => {
    vi.useFakeTimers();
    const close = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('SDK_CLOSE_FAILED'))
      .mockResolvedValueOnce(undefined);

    await expect(closeWithTimeout(close)).rejects.toThrow('SDK_CLOSE_FAILED');
    await expect(closeWithTimeout(close)).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
