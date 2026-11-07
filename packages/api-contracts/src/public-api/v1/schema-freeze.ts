import type { ZodTypeAny } from 'zod';

type ZodDef = Record<string, unknown> & { typeName?: string };

const isSchema = (value: unknown): value is ZodTypeAny =>
  typeof value === 'object' &&
  value !== null &&
  '_def' in value &&
  typeof (value as { safeParse?: unknown }).safeParse === 'function';

const cloneCheck = (check: unknown): unknown => {
  if (typeof check !== 'object' || check === null) return check;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(check)) {
    const value = (check as Record<string, unknown>)[key];
    if (value === undefined) continue;
    copy[key] = value instanceof RegExp ? new RegExp(value.source, value.flags) : value;
  }
  return copy;
};

/**
 * A new Zod schema tree. Nested schemas, check lists, and discriminated-union
 * maps are copies, so a later edit of the source schema object does not show
 * up here. Refinement functions stay the same function values. Their behavior
 * is pinned by safeParse cases, because the wrapper source is not stable.
 */
export const detachSchema = <T extends ZodTypeAny>(schema: T, seen = new Map<ZodTypeAny, ZodTypeAny>()): T => {
  const already = seen.get(schema);
  if (already !== undefined) return already as T;
  const def = schema._def as ZodDef;
  const cloned: ZodDef = { ...def };
  if (Array.isArray(def.checks)) cloned.checks = def.checks.map((check) => cloneCheck(check));
  if (typeof def.shape === 'function') {
    const shape = (def.shape as () => Record<string, ZodTypeAny>)();
    const copied: Record<string, ZodTypeAny> = {};
    for (const key of Object.keys(shape)) copied[key] = detachSchema(shape[key] as ZodTypeAny, seen);
    cloned.shape = () => copied;
  }
  for (const key of ['schema', 'innerType', 'type', 'in', 'out', 'left', 'right', 'keyType', 'valueType', 'catchall'] as const) {
    if (isSchema(def[key])) cloned[key] = detachSchema(def[key], seen);
  }
  if (Array.isArray(def.options)) cloned.options = def.options.map((option) => (isSchema(option) ? detachSchema(option, seen) : option));
  if (Array.isArray(def.items)) cloned.items = def.items.map((item) => (isSchema(item) ? detachSchema(item, seen) : item));
  if (isSchema(def.rest)) cloned.rest = detachSchema(def.rest, seen);
  if (def.optionsMap instanceof Map) {
    const optionsMap = new Map<unknown, unknown>();
    for (const [key, option] of def.optionsMap) {
      optionsMap.set(key, isSchema(option) ? detachSchema(option, seen) : option);
    }
    cloned.optionsMap = optionsMap;
  }
  if (typeof def.effect === 'object' && def.effect !== null) cloned.effect = { ...(def.effect as Record<string, unknown>) };
  if (Array.isArray(def.values)) cloned.values = [...def.values];
  const copy = new (schema.constructor as new (definition: ZodDef) => T)(cloned);
  seen.set(schema, copy);
  return copy;
};

const checkShape = (check: unknown): unknown => {
  if (typeof check !== 'object' || check === null) return check;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(check).sort()) {
    const value = (check as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (value instanceof RegExp) out[key] = { source: value.source, flags: value.flags };
    else if (typeof value === 'function') out[key] = value.toString();
    else out[key] = value;
  }
  return out;
};

const functionSource = (value: unknown): string | undefined => (typeof value === 'function' ? value.toString() : undefined);

/**
 * JSON shape of a Zod schema: kinds, checks, keys, and defaults. Effect
 * predicates are recorded only as their effect type. This is the pin. It
 * does not read a second live schema.
 */
export const schemaShape = (schema: ZodTypeAny, seen = new Map<ZodTypeAny, number>()): unknown => {
  const prior = seen.get(schema);
  if (prior !== undefined) return { ref: prior };
  const id = seen.size;
  seen.set(schema, id);
  const def = schema._def as ZodDef;
  const typeName = String(def.typeName);
  const shape: Record<string, unknown> = { typeName };
  if (typeof def.description === 'string') shape.description = def.description;
  if (def.coerce === true) shape.coerce = true;
  if (Array.isArray(def.checks)) shape.checks = def.checks.map((check) => checkShape(check));
  const errorMap = functionSource(def.errorMap);
  if (errorMap !== undefined) shape.errorMap = errorMap;

  switch (typeName) {
    case 'ZodString':
    case 'ZodNumber':
    case 'ZodBigInt':
    case 'ZodBoolean':
    case 'ZodDate':
    case 'ZodUndefined':
    case 'ZodNull':
    case 'ZodAny':
    case 'ZodUnknown':
    case 'ZodNever':
    case 'ZodVoid':
    case 'ZodNaN':
      break;
    case 'ZodLiteral':
      shape.value = def.value;
      break;
    case 'ZodEnum':
      shape.values = def.values;
      break;
    case 'ZodNativeEnum':
      shape.values = def.values;
      break;
    case 'ZodArray':
      shape.element = schemaShape(def.type as ZodTypeAny, seen);
      for (const key of ['minLength', 'maxLength', 'exactLength'] as const) {
        const length = def[key];
        if (typeof length !== 'object' || length === null) continue;
        const value = (length as { value?: unknown; message?: unknown }).value;
        const message = (length as { message?: unknown }).message;
        shape[key] = message === undefined ? { value } : { value, message };
      }
      break;
    case 'ZodObject': {
      const raw = (def.shape as () => Record<string, ZodTypeAny>)();
      shape.keys = Object.fromEntries(Object.keys(raw).sort().map((key) => [key, schemaShape(raw[key] as ZodTypeAny, seen)]));
      shape.unknownKeys = def.unknownKeys;
      shape.catchall = schemaShape(def.catchall as ZodTypeAny, seen);
      break;
    }
    case 'ZodUnion':
      shape.options = (def.options as ZodTypeAny[]).map((option) => schemaShape(option, seen));
      break;
    case 'ZodDiscriminatedUnion':
      shape.discriminator = def.discriminator;
      shape.options = (def.options as ZodTypeAny[]).map((option) => schemaShape(option, seen));
      break;
    case 'ZodIntersection':
      shape.left = schemaShape(def.left as ZodTypeAny, seen);
      shape.right = schemaShape(def.right as ZodTypeAny, seen);
      break;
    case 'ZodTuple':
      shape.items = (def.items as ZodTypeAny[]).map((item) => schemaShape(item, seen));
      if (isSchema(def.rest)) shape.rest = schemaShape(def.rest, seen);
      break;
    case 'ZodRecord':
    case 'ZodMap':
      shape.key = schemaShape(def.keyType as ZodTypeAny, seen);
      shape.value = schemaShape(def.valueType as ZodTypeAny, seen);
      break;
    case 'ZodSet':
      shape.value = schemaShape(def.valueType as ZodTypeAny, seen);
      break;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodBranded':
    case 'ZodReadonly':
      shape.inner = schemaShape((def.innerType ?? def.type) as ZodTypeAny, seen);
      break;
    case 'ZodDefault':
      shape.inner = schemaShape(def.innerType as ZodTypeAny, seen);
      shape.defaultValue = (def.defaultValue as () => unknown)();
      break;
    case 'ZodCatch':
      shape.inner = schemaShape(def.innerType as ZodTypeAny, seen);
      shape.catchValue = functionSource(def.catchValue);
      break;
    case 'ZodEffects':
      shape.inner = schemaShape(def.schema as ZodTypeAny, seen);
      shape.effect = { type: (def.effect as { type?: string }).type };
      break;
    case 'ZodPipeline':
      shape.in = schemaShape(def.in as ZodTypeAny, seen);
      shape.out = schemaShape(def.out as ZodTypeAny, seen);
      break;
    case 'ZodLazy':
      shape.inner = schemaShape((def.getter as () => ZodTypeAny)(), seen);
      break;
    default:
      throw new Error(`public v1 freeze does not know Zod type ${typeName}`);
  }
  return shape;
};

/** Every Zod schema object reachable from this schema, including itself. */
export const collectSchemas = (schema: ZodTypeAny, into = new Set<ZodTypeAny>()): Set<ZodTypeAny> => {
  if (into.has(schema)) return into;
  into.add(schema);
  const def = schema._def as ZodDef;
  if (typeof def.shape === 'function') {
    for (const value of Object.values((def.shape as () => Record<string, ZodTypeAny>)())) collectSchemas(value, into);
  }
  for (const key of ['schema', 'innerType', 'type', 'in', 'out', 'left', 'right', 'keyType', 'valueType', 'catchall', 'rest'] as const) {
    if (isSchema(def[key])) collectSchemas(def[key], into);
  }
  for (const list of [def.options, def.items]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) if (isSchema(item)) collectSchemas(item, into);
  }
  if (def.optionsMap instanceof Map) {
    for (const option of def.optionsMap.values()) if (isSchema(option)) collectSchemas(option, into);
  }
  return into;
};
