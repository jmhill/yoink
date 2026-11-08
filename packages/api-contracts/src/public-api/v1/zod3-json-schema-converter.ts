import type { ZodTypeAny } from 'zod';
import { ImportNoteFromObsidianSchema, UpdateNoteSchema } from '../../schemas/note.js';
import { UpdateProjectSchema } from '../../schemas/project.js';
import { TimeZoneSchema } from '../../schemas/work.js';

type Direction = 'input' | 'output';

type StandardResult = {
  issues?: ReadonlyArray<unknown>;
  value?: unknown;
};

type ZodCheck = {
  kind?: string;
  value?: number;
  inclusive?: boolean;
  regex?: { source: string; flags: string };
};

type EncodeRefinement = (inner: JsonSchema) => JsonSchema;

type ZodDef = {
  typeName?: string;
  checks?: readonly ZodCheck[];
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  left?: ZodTypeAny;
  right?: ZodTypeAny;
  options?: readonly ZodTypeAny[];
  type?: ZodTypeAny;
  shape?: () => Record<string, ZodTypeAny>;
  values?: readonly string[];
  value?: unknown;
  description?: string;
  minLength?: { value?: number } | null;
  maxLength?: { value?: number } | null;
  exactLength?: { value?: number } | null;
  unknownKeys?: string;
  catchall?: ZodTypeAny;
  effect?: { type?: string };
  defaultValue?: () => unknown;
};

type JsonSchema = Record<string, unknown>;

const defOf = (schema: ZodTypeAny): ZodDef => schema._def as unknown as ZodDef;

/**
 * Same absence rule as oRPC's standard-schema converter: an input that
 * accepts `undefined`, or an output whose value is `undefined`.
 */
const absentWhenOmitted = (schema: ZodTypeAny, direction: Direction): boolean => {
  const standard = (schema as { '~standard'?: { validate?: (value: undefined) => StandardResult | Promise<unknown> } })[
    '~standard'
  ];
  if (standard?.validate === undefined) return false;
  try {
    const result = standard.validate(undefined);
    if (result instanceof Promise) {
      result.catch(() => undefined);
      return false;
    }
    return result.issues === undefined && (direction === 'input' || result.value === undefined);
  } catch {
    return false;
  }
};

const isZod3 = (schema: unknown): schema is ZodTypeAny => {
  if (typeof schema !== 'object' || schema === null) return false;
  const standard = (schema as { '~standard'?: { vendor?: unknown } })['~standard'];
  return standard?.vendor === 'zod' && !('_zod' in schema);
};

const unsupported = (typeName: string): never => {
  throw new Error(`Zod 3 schema has no JSON Schema mapping: ${typeName}`);
};

const withDescription = (schema: ZodTypeAny, json: JsonSchema): JsonSchema => {
  const description = defOf(schema).description;
  if (typeof description !== 'string' || description.length === 0 || typeof json.description === 'string') {
    return json;
  }
  return { ...json, description };
};

/**
 * Zod applies `trim()` before later min/max, and the wire value keeps its
 * surrounding whitespace. `minLength` measures the raw string, so it accepts
 * whitespace-only input and rejects padded values the wire accepts.
 * The pattern measures the length after `String.prototype.trim`.
 */
const trimmedLengthPattern = (minimum: number | undefined, maximum: number | undefined): string => {
  if (minimum === undefined || !Number.isInteger(minimum) || minimum < 1) return unsupported('ZodString trim length');
  if (maximum !== undefined && (!Number.isInteger(maximum) || maximum < minimum)) {
    return unsupported('ZodString trim length');
  }
  if (maximum === undefined) {
    return minimum === 1 ? '^\\s*\\S(?:[\\s\\S]*\\S)?\\s*$' : `^\\s*\\S[\\s\\S]{${minimum - 2},}\\S\\s*$`;
  }
  if (minimum === 1 && maximum === 1) return '^\\s*\\S\\s*$';
  if (minimum === 1) return `^\\s*\\S(?:[\\s\\S]{0,${maximum - 2}}\\S)?\\s*$`;
  return `^\\s*\\S[\\s\\S]{${minimum - 2},${maximum - 2}}\\S\\s*$`;
};

const stringSchema = (checks: readonly ZodCheck[] | undefined): JsonSchema => {
  const json: JsonSchema = { type: 'string' };
  let trimmed = false;
  let trimMin: number | undefined;
  let trimMax: number | undefined;
  let trimLength = false;
  for (const check of checks ?? []) {
    if (check.inclusive === false && (check.kind === 'min' || check.kind === 'max' || check.kind === 'length')) {
      return unsupported('ZodString exclusive length');
    }
    switch (check.kind) {
      case 'trim':
        if (trimmed || json.minLength !== undefined || json.maxLength !== undefined || json.pattern !== undefined || json.format !== undefined) {
          return unsupported('ZodString trim');
        }
        trimmed = true;
        break;
      case 'toLowerCase':
      case 'toUpperCase':
        return unsupported(`ZodString check ${check.kind}`);
      case 'min':
      case 'max':
      case 'length':
        if (trimmed) {
          trimLength = true;
          if (check.kind === 'min' || check.kind === 'length') trimMin = check.value;
          if (check.kind === 'max' || check.kind === 'length') trimMax = check.value;
          break;
        }
        if (check.kind === 'min' || check.kind === 'length') json.minLength = check.value;
        if (check.kind === 'max' || check.kind === 'length') json.maxLength = check.value;
        break;
      case 'uuid':
      case 'email':
      case 'url':
      case 'datetime':
      case 'date':
      case 'regex':
        if (trimmed) return unsupported(`ZodString check ${check.kind} after trim`);
        if (check.kind === 'uuid') json.format = 'uuid';
        else if (check.kind === 'email') json.format = 'email';
        else if (check.kind === 'url') json.format = 'uri';
        else if (check.kind === 'datetime') json.format = 'date-time';
        else if (check.kind === 'date') json.format = 'date';
        else if (check.regex === undefined || check.regex.flags !== '') return unsupported('ZodString regex flag');
        else json.pattern = check.regex.source;
        break;
      default:
        return unsupported(`ZodString check ${check.kind ?? '(missing)'}`);
    }
  }
  if (!trimmed) return json;
  if (!trimLength) return unsupported('ZodString trim');
  return { type: 'string', pattern: trimmedLengthPattern(trimMin, trimMax) };
};

const numberSchema = (checks: readonly ZodCheck[] | undefined): JsonSchema => {
  const json: JsonSchema = { type: 'number' };
  for (const check of checks ?? []) {
    switch (check.kind) {
      case 'int':
        json.type = 'integer';
        break;
      case 'min':
        if (check.inclusive === false) json.exclusiveMinimum = check.value;
        else json.minimum = check.value;
        break;
      case 'max':
        if (check.inclusive === false) json.exclusiveMaximum = check.value;
        else json.maximum = check.value;
        break;
      case 'multipleOf':
        json.multipleOf = check.value;
        break;
      default:
        return unsupported(`ZodNumber check ${check.kind ?? '(missing)'}`);
    }
  }
  return json;
};

const literalSchema = (value: unknown): JsonSchema => {
  if (typeof value === 'string') return { type: 'string', const: value };
  if (typeof value === 'number') return { type: 'number', const: value };
  if (typeof value === 'boolean') return { type: 'boolean', const: value };
  if (value === null) return { type: 'null', const: null };
  return unsupported(`ZodLiteral ${typeof value}`);
};

const bound = (value: { value?: number } | null | undefined): number | undefined =>
  value === undefined || value === null ? undefined : value.value;

const arraySchema = (def: ZodDef, convert: (schema: ZodTypeAny) => JsonSchema): JsonSchema => {
  if (def.type === undefined) return unsupported('ZodArray item');
  const json: JsonSchema = { type: 'array', items: convert(def.type) };
  const minimum = bound(def.exactLength) ?? bound(def.minLength);
  const maximum = bound(def.exactLength) ?? bound(def.maxLength);
  if (minimum !== undefined) json.minItems = minimum;
  if (maximum !== undefined) json.maxItems = maximum;
  return json;
};

const refinementOf = (schema: ZodTypeAny): unknown => {
  const refinement = (schema._def as { effect?: { refinement?: unknown } }).effect?.refinement;
  if (refinement === undefined) throw new Error('certified Zod refinement is missing');
  return refinement;
};

const updateProjectRefinement = refinementOf(UpdateProjectSchema);
const updateNoteRefinement = refinementOf(UpdateNoteSchema);
const importNoteRefinement = refinementOf(ImportNoteFromObsidianSchema);
const timeZoneRefinement = refinementOf(TimeZoneSchema);

const UPDATE_PROJECT_KEYS = ['name', 'objective', 'notebookPages', 'reason', 'suggestedNextAction'] as const;
const UPDATE_NOTE_KEYS = ['title', 'body'] as const;

const objectProperties = (schema: JsonSchema): Record<string, JsonSchema> => {
  if (schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) {
    return unsupported('certified refinement object');
  }
  return schema.properties as Record<string, JsonSchema>;
};

const atLeastOneOf = (schema: JsonSchema, keys: readonly string[]): JsonSchema => {
  const properties = objectProperties(schema);
  const already = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : [];
  return {
    anyOf: keys.map((key) => {
      if (!Object.hasOwn(properties, key)) return unsupported(`certified refinement key ${key}`);
      return { ...schema, required: [...new Set([...already, key])] };
    }),
  };
};

const requireWhenPresent = (schema: JsonSchema, key: string, dependency: string): JsonSchema => {
  const properties = objectProperties(schema);
  if (!Object.hasOwn(properties, key) || !Object.hasOwn(properties, dependency)) {
    return unsupported('certified refinement dependency');
  }
  return { ...schema, dependentRequired: { [key]: [dependency] } };
};

/**
 * Certified by function identity. Detach copies the effect object and keeps
 * the same function. Any other refinement, preprocess, or transform throws
 * instead of publishing the inner schema.
 */
const unwrapSchema = (schema: ZodTypeAny): ZodTypeAny => {
  const def = schema._def as { typeName?: string; innerType?: ZodTypeAny };
  if (
    (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable' || def.typeName === 'ZodDefault') &&
    def.innerType !== undefined
  ) {
    return unwrapSchema(def.innerType);
  }
  return schema;
};

/** True when the schema is TimeZoneSchema, including optional and nullable wrappers. */
export const isUnencodedTimeZone = (schema: ZodTypeAny): boolean => {
  const inner = unwrapSchema(schema);
  const def = inner._def as { typeName?: string; effect?: { refinement?: unknown } };
  return def.typeName === 'ZodEffects' && def.effect?.refinement === timeZoneRefinement;
};

const certifiedRefinement = (refinement: unknown): EncodeRefinement | undefined => {
  if (refinement === updateProjectRefinement) return (inner) => atLeastOneOf(inner, UPDATE_PROJECT_KEYS);
  if (refinement === updateNoteRefinement) return (inner) => atLeastOneOf(inner, UPDATE_NOTE_KEYS);
  if (refinement === importNoteRefinement) return (inner) => requireWhenPresent(inner, 'noteId', 'baseVersion');
  if (refinement === timeZoneRefinement) return () => unsupported('ZodEffects refinement Intl.DateTimeFormat timeZone');
  return undefined;
};

/**
 * Converts Zod 3 schemas for `@orpc/openapi` 2.0.0-beta.48.
 * `@orpc/zod@2.0.0-beta.48` imports `process` from `zod/v4/core`, which Zod 3.25.76 does not export.
 */
export class Zod3JsonSchemaConverter {
  condition(schema: unknown): boolean {
    return isZod3(schema);
  }

  convert(schema: ZodTypeAny, direction: Direction): [JsonSchema, boolean] {
    return [this.toJsonSchema(schema, direction), absentWhenOmitted(schema, direction)];
  }

  private toJsonSchema(schema: ZodTypeAny, direction: Direction): JsonSchema {
    return withDescription(schema, this.convertDef(schema, direction));
  }

  private convertDef(schema: ZodTypeAny, direction: Direction): JsonSchema {
    const def = defOf(schema);
    switch (def.typeName) {
      case 'ZodEffects': {
        const inner = def.schema;
        const effect = def.effect as { type?: string; refinement?: unknown } | undefined;
        if (effect?.type !== 'refinement' || inner === undefined) {
          return unsupported(`ZodEffects ${effect?.type ?? '(missing)'}`);
        }
        const encode = certifiedRefinement(effect.refinement);
        if (encode === undefined) return unsupported('ZodEffects refinement');
        return encode(this.toJsonSchema(inner, direction));
      }
      case 'ZodDefault': {
        const inner = def.innerType;
        const defaultValue = def.defaultValue;
        if (inner === undefined || defaultValue === undefined) return unsupported('ZodDefault');
        const value = defaultValue();
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
          return unsupported('ZodDefault value');
        }
        return { ...this.toJsonSchema(inner, direction), default: value };
      }
      case 'ZodOptional': {
        const inner = def.innerType;
        if (inner === undefined) return unsupported('ZodOptional');
        return this.toJsonSchema(inner, direction);
      }
      case 'ZodNullable': {
        const inner = def.innerType;
        if (inner === undefined) return unsupported('ZodNullable');
        return { anyOf: [this.toJsonSchema(inner, direction), { type: 'null' }] };
      }
      case 'ZodString':
        return stringSchema(def.checks);
      case 'ZodNumber':
        return numberSchema(def.checks);
      case 'ZodBoolean':
        return { type: 'boolean' };
      case 'ZodNull':
        return { type: 'null' };
      case 'ZodLiteral':
        return literalSchema(def.value);
      case 'ZodEnum':
        return { type: 'string', enum: [...(def.values ?? [])] };
      case 'ZodArray':
        return arraySchema(def, (item) => this.toJsonSchema(item, direction));
      case 'ZodUnion':
      case 'ZodDiscriminatedUnion':
        return {
          anyOf: (def.options ?? []).map((option) => this.toJsonSchema(option, direction)),
        };
      case 'ZodIntersection': {
        const left = def.left;
        const right = def.right;
        if (left === undefined || right === undefined) return unsupported('ZodIntersection');
        return {
          allOf: [this.toJsonSchema(left, direction), this.toJsonSchema(right, direction)],
        };
      }
      case 'ZodVoid':
        return {};
      case 'ZodObject':
        return this.objectSchema(def, direction);
      default:
        return unsupported(def.typeName ?? '(missing)');
    }
  }

  private objectSchema(def: ZodDef, direction: Direction): JsonSchema {
    const shape = def.shape;
    if (shape === undefined) return unsupported('ZodObject');
    if (def.catchall !== undefined && defOf(def.catchall).typeName !== 'ZodNever') {
      return unsupported(`ZodObject catchall ${defOf(def.catchall).typeName ?? '(missing)'}`);
    }
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [name, field] of Object.entries(shape())) {
      properties[name] = this.toJsonSchema(field, direction);
      if (!absentWhenOmitted(field, direction)) required.push(name);
    }
    const json: JsonSchema = { type: 'object', properties };
    if (required.length > 0) json.required = required;
    if (def.unknownKeys === 'strict') json.additionalProperties = false;
    else if (def.unknownKeys === 'passthrough') json.additionalProperties = true;
    else if (def.unknownKeys !== undefined && def.unknownKeys !== 'strip') {
      return unsupported(`ZodObject ${def.unknownKeys}`);
    }
    return json;
  }
}
