/**
 * Port type. `@yoink/infrastructure` keeps the same shape for its clocks.
 * `platform/infrastructure-ports.test.ts` fails typecheck if they drift.
 */
export type Clock = {
  now(): Date;
};
