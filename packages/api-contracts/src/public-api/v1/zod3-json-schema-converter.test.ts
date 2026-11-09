import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TimeZoneSchema } from '../../schemas/work.js';
import { Zod3JsonSchemaConverter } from './zod3-json-schema-converter.js';

const converter = new Zod3JsonSchemaConverter();

describe('Zod 3 JSON Schema converter', () => {
  it('fails closed on refinements and string transforms it cannot encode', () => {
    expect(() => converter.convert(z.string().refine((value) => value !== 'nope'), 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodEffects refinement',
    );
    expect(() => converter.convert(z.string().transform((value) => value), 'input')).toThrow(/ZodEffects transform/);
    expect(() => converter.convert(z.preprocess((value) => value, z.string()), 'input')).toThrow(/ZodEffects preprocess/);
    expect(() => converter.convert(z.string().toLowerCase(), 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodString check toLowerCase',
    );
    expect(() => converter.convert(z.string().toUpperCase(), 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodString check toUpperCase',
    );
    expect(() => converter.convert(z.string().trim(), 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodString trim',
    );
    expect(() => converter.convert(TimeZoneSchema, 'input')).toThrow(
      'Zod 3 schema has no JSON Schema mapping: ZodEffects refinement Intl.DateTimeFormat timeZone',
    );
    expect(() => converter.convert(TimeZoneSchema, 'output')).toThrow(/Intl\.DateTimeFormat timeZone/);
  });
});
