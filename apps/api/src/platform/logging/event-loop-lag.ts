import { monitorEventLoopDelay } from 'node:perf_hooks';

export const EVENT_LOOP_LAG_MS = 500;

type LagSample = {
  percentile: (percentile: number) => number;
  max: number;
  mean: number;
};

export type LagWarning = {
  p99Ms: number;
  maxMs: number;
  meanMs: number;
};

const ms = (nanoseconds: number): number =>
  Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : 0;

/**
 * A multi-second max here is the #354 shape: a synchronous busy wait froze
 * the loop, and the delay shows up on the next turn.
 */
export const lagWarning = (sample: LagSample): LagWarning | undefined => {
  const warning = {
    p99Ms: ms(sample.percentile(99)),
    maxMs: ms(sample.max),
    meanMs: ms(sample.mean),
  };
  if (warning.p99Ms < EVENT_LOOP_LAG_MS && warning.maxMs < EVENT_LOOP_LAG_MS) {
    return undefined;
  }
  return warning;
};

type FixtureEnv = {
  YOINK_TEST_FIXTURES?: string;
  VITEST?: string;
};

export const eventLoopMonitorEnabled = (env: FixtureEnv): boolean =>
  env.YOINK_TEST_FIXTURES === 'true' && env.VITEST !== 'true';

let monitorStarted = false;

export const startEventLoopLagMonitor = (): void => {
  if (monitorStarted) {
    return;
  }
  if (!eventLoopMonitorEnabled({
    YOINK_TEST_FIXTURES: process.env.YOINK_TEST_FIXTURES,
    VITEST: process.env.VITEST,
  })) {
    return;
  }
  monitorStarted = true;
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const timer = setInterval(() => {
    const warning = lagWarning(histogram);
    histogram.reset();
    if (!warning) {
      return;
    }
    console.error(
      JSON.stringify({
        msg: 'event_loop_lag',
        ...warning,
        time: Date.now(),
      })
    );
  }, 1000);
  timer.unref();
};
