import { expect, it } from 'vitest';
import { z } from 'zod';
import { detachSchema } from './schema-freeze.js';

it('keeps a detached schema when the source schema object changes', () => {
  const original = z.object({
    name: z.string().min(2),
    note: z.string().refine((value) => value !== 'nope', { message: 'reserved' }),
  });
  const detached = detachSchema(original);
  const min = original.shape.name._def.checks.find((check) => check.kind === 'min');
  if (min === undefined || min.kind !== 'min') throw new Error('missing min check');
  min.value = 10;

  expect(detached.safeParse({ name: 'ab', note: 'ok' }).success).toBe(true);
  expect(original.safeParse({ name: 'ab', note: 'ok' }).success).toBe(false);
  expect(detached.safeParse({ name: 'abcdefghij', note: 'nope' }).success).toBe(false);
});
