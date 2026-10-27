/** Trust only the immediate proxy hop (Fly), matching Fastify 4's `trustProxy: 1`. */
export const TRUST_PROXY_HOPS = 1;

/**
 * Fastify 4 implemented a numeric `trustProxy` as `hop < n`. Fastify 5.12.7
 * still accepts a number and then ignores it, so this is that same check.
 */
export const trustImmediateProxy = (_address: string, hop: number): boolean =>
  hop < TRUST_PROXY_HOPS;
