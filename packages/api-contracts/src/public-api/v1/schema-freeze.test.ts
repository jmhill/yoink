import { expect, it } from 'vitest';
import { z } from 'zod';
import { detachSchema, schemaShape } from './schema-freeze.js';

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

it('copies array length bounds so a legacy bound edit leaves v1 unchanged', () => {
  const original = z.array(z.string()).min(1).max(3);
  const detached = detachSchema(original);
  expect(detached._def.minLength).not.toBe(original._def.minLength);
  expect(detached._def.maxLength).not.toBe(original._def.maxLength);
  expect(detached.safeParse(['a']).success).toBe(true);
  expect(detached.safeParse([]).success).toBe(false);
  expect(detached.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
  const minLength = original._def.minLength;
  const maxLength = original._def.maxLength;
  if (minLength === null || maxLength === null) throw new Error('missing array bounds');

  minLength.value = 5;
  maxLength.value = 0;
  expect(detached.safeParse(['a']).success).toBe(true);
  expect(original.safeParse(['a']).success).toBe(false);

  const exact = z.array(z.string()).length(2);
  const detachedExact = detachSchema(exact);
  expect(detachedExact._def.exactLength).not.toBe(exact._def.exactLength);
  expect(detachedExact.safeParse(['a', 'b']).success).toBe(true);
  const exactLength = exact._def.exactLength;
  if (exactLength === null) throw new Error('missing exact length');
  exactLength.value = 1;
  expect(detachedExact.safeParse(['a', 'b']).success).toBe(true);
  expect(exact.safeParse(['a', 'b']).success).toBe(false);
});

it('omits the Zod helper error-map source and keeps a real required message', () => {
  const helper = schemaShape(z.string().optional()) as { errorMessages?: unknown; inner: { errorMessages?: unknown } };
  expect(helper.errorMessages).toBeUndefined();
  expect(helper.inner.errorMessages).toBeUndefined();
  expect(JSON.stringify(helper)).not.toContain('required_error');

  const required = schemaShape(z.string({ required_error: 'need it', invalid_type_error: 'bad type' })) as {
    errorMessages?: unknown;
  };
  expect(required.errorMessages).toEqual({ missing: 'need it', invalidType: 'bad type' });
});
