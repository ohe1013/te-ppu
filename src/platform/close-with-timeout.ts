const DEFAULT_CLOSE_TIMEOUT_MS = 400;

export function closeWithTimeout(
  close: () => Promise<void>,
  timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
): Promise<void> {
  const duration = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : DEFAULT_CLOSE_TIMEOUT_MS;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve();
      else reject(error);
    };
    const timer = setTimeout(() => finish(new Error('CLOSE_TIMEOUT')), duration);

    let request: Promise<void>;
    try {
      request = close();
    } catch (error) {
      finish(error);
      return;
    }
    void request.then(() => finish(), (error: unknown) => finish(error));
  });
}
