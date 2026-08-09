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

  it('rejects with CLOSE_TIMEOUT when the platform close does not settle', async () => {
    vi.useFakeTimers();
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const pending = closeWithTimeout(close);

    await vi.advanceTimersByTimeAsync(1_199);
    await expect(Promise.race([
      pending.then(() => 'resolved', () => 'settled'),
      Promise.resolve('pending'),
    ])).resolves.toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow('CLOSE_TIMEOUT');
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
