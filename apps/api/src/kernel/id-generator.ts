/**
 * Port type. `@yoink/infrastructure` keeps the same shape for its generators.
 * `platform/infrastructure-ports.test.ts` fails typecheck if they drift.
 */
export type IdGenerator = {
  generate(): string;
};
