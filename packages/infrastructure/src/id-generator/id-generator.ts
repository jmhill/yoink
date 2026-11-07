/** Same shape as `apps/api/src/kernel/id-generator.ts`. The ports test locks that. */
export type IdGenerator = {
  generate(): string;
};
