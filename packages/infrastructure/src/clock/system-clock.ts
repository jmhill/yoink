import type { Clock } from './clock.js';

export const createSystemClock = (): Clock => ({
  now: () => new Date(),
});
