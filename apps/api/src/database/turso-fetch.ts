const signalOf = (input: Parameters<typeof fetch>[0]): AbortSignal | undefined => {
  if (typeof input === 'string' || input instanceof URL) {
    return undefined;
  }
  return input.signal;
};

/** Abort a Turso HTTP request that never returns, so the call can be retried. */
export const fetchWithTimeout =
  (timeoutMs: number): typeof fetch =>
  (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const existing = init?.signal ?? signalOf(input);
    const signal =
      existing === undefined || existing.aborted
        ? (existing ?? timeoutSignal)
        : AbortSignal.any([existing, timeoutSignal]);
    return fetch(input, { ...init, signal });
  };
