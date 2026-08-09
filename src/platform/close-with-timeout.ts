const DEFAULT_CLOSE_TIMEOUT_MS = 1_200;

export function closeWithTimeout(
  close: () => Promise<void>,
  timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
): Promise<void> {
  const duration = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : DEFAULT_CLOSE_TIMEOUT_MS;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('CLOSE_TIMEOUT'));
    }, duration);
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve();
      else reject(error);
    };
    Promise.resolve()
      .then(close)
      .then(() => finish(), (error: unknown) => finish(error));
  });
}
