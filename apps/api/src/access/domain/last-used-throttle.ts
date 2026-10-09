export const LAST_USED_THROTTLE_MS = 60_000;

export const shouldUpdateLastUsed = (
  lastUsedAt: string | undefined,
  now: Date
): boolean => {
  if (!lastUsedAt) {
    return true;
  }

  const previous = Date.parse(lastUsedAt);
  if (Number.isNaN(previous)) {
    return true;
  }

  return now.getTime() - previous >= LAST_USED_THROTTLE_MS;
};
