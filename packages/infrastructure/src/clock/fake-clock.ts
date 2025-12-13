import type { Clock } from './clock.js';

export type FakeClockOptions = {
  autoAdvanceMs?: number;
};

export type FakeClock = Clock & {
  advanceBy: (milliseconds: number) => void;
  setTime: (newTime: Date) => void;
};

export const createFakeClock = (
  initialTime: Date,
  options: FakeClockOptions = {}
): FakeClock => {
  let currentTime = new Date(initialTime.getTime());
  const autoAdvanceMs = options.autoAdvanceMs ?? 0;

  return {
    now: () => {
      const result = new Date(currentTime.getTime());
      if (autoAdvanceMs > 0) {
        currentTime = new Date(currentTime.getTime() + autoAdvanceMs);
      }
      return result;
    },
    advanceBy: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
    setTime: (newTime: Date) => {
      currentTime = new Date(newTime.getTime());
    },
  };
};
