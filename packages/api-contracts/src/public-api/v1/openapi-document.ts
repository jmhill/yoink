import { ProcedureContract, type AnyProcedureContract } from '@orpc/contract';
import { COMMON_ERROR_STATUS_MAP, getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi';
import { z, type ZodTypeAny } from 'zod';
import { publicApiV1Contract } from './contract.js';
import { detachSchema } from './schema-freeze.js';
import { isUnencodedTimeZone, Zod3JsonSchemaConverter } from './zod3-json-schema-converter.js';

const messageBody = z
  .object({
    message: z.string(),
  })
  .strict();

const validationFailedBody = z
  .object({
    message: z.string(),
    code: z.literal('VALIDATION_FAILED'),
    fields: z.array(z.string()),
  })
  .strict();

const invalidCursorBody = z
  .object({
    message: z.string(),
    code: z.literal('invalid_cursor'),
  })
  .strict();

const invalidTimeZoneBody = z
  .object({
    message: z.string(),
    code: z.literal('INVALID_TIME_ZONE'),
  })
  .strict();

const listedBadRequestBody = z.union([validationFailedBody, invalidTimeZoneBody]);

const serverErrorBody = messageBody;

type ErrorData = {
  data: z.ZodTypeAny;
};

type JsonSchema = Record<string, unknown>;

type UnencodedField = {
  name: string;
  in: 'query' | 'requestBody' | 'response';
  reason: string;
};

type PreparedProcedure = {
  method: string;
  path: string;
  inputSchemas: ZodTypeAny[];
  unencoded: UnencodedField[];
};

const converter = new Zod3JsonSchemaConverter();

/**
 * `TimeZoneSchema` accepts a string exactly when `Intl.DateTimeFormat` accepts
 * it as `timeZone`. That set is not a JSON Schema keyword: it includes ASCII
 * case variants, ICU legacy links (`UTC`, `US/Central`), and custom offsets
 * (`+05:30`), and it changes with ICU. `Intl.supportedValuesOf('timeZone')`
 * rejects links and offsets the wire accepts. `minLength: 1` accepts
 * `Mars/Base`, which the wire rejects with 400 `INVALID_TIME_ZONE`.
 */
export const TIME_ZONE_UNENCODED_REASON =
  'TimeZoneSchema accepts a string exactly when Intl.DateTimeFormat accepts it as timeZone. JSON Schema cannot encode that predicate: the accepted set includes ASCII case variants, ICU legacy links (UTC, US/Central), and custom offsets (+05:30), and it changes with ICU. Intl.supportedValuesOf("timeZone") rejects links and offsets the wire accepts. minLength: 1 accepts Mars/Base, which the wire rejects.';

const withErrorMap = (
  procedure: AnyProcedureContract,
  errors: Record<string, ErrorData>,
  schemas: { inputSchemas?: ZodTypeAny[]; outputSchemas?: ZodTypeAny[] },
): AnyProcedureContract => {
  const definition = procedure['~orpc'];
  const errorMap = { ...errors, UNAUTHORIZED: { data: messageBody } };
  return new ProcedureContract({
    ...definition,
    ...(schemas.inputSchemas === undefined ? {} : { inputSchemas: schemas.inputSchemas }),
    ...(schemas.outputSchemas === undefined ? {} : { outputSchemas: schemas.outputSchemas }),
    errorMap,
  });
};

/**
 * Domain errors differ by route. These are pinned to the bodies the handlers
 * already return. Every mounted v1 route also has the auth preHandler, whose
 * 401 body is `{ message }`.
 */
const documentedErrors = (procedure: AnyProcedureContract): Record<string, ErrorData> => {
  const meta = getOpenAPIMeta(procedure);
  const key = `${meta?.method ?? ''} ${meta?.path ?? ''}`;
  switch (key) {
    case 'POST /captures':
      return {
        BAD_REQUEST: { data: validationFailedBody },
        FORBIDDEN: { data: messageBody },
        INTERNAL_SERVER_ERROR: { data: serverErrorBody },
      };
    case 'GET /captures':
      return {
        BAD_REQUEST: { data: validationFailedBody },
        INVALID_CURSOR: { data: invalidCursorBody },
        INTERNAL_SERVER_ERROR: { data: serverErrorBody },
      };
    case 'GET /captures/{id}':
      return {
        BAD_REQUEST: { data: validationFailedBody },
        NOT_FOUND: { data: messageBody },
        INTERNAL_SERVER_ERROR: { data: serverErrorBody },
      };
    case 'GET /tasks':
    case 'GET /work/due':
    case 'GET /review':
      return {
        BAD_REQUEST: { data: listedBadRequestBody },
        INVALID_CURSOR: { data: invalidCursorBody },
        INTERNAL_SERVER_ERROR: { data: serverErrorBody },
      };
    default:
      return {};
  }
};

type MutableDef = {
  typeName?: string;
  shape?: () => Record<string, ZodTypeAny>;
  schema?: ZodTypeAny;
  innerType?: ZodTypeAny;
  type?: ZodTypeAny;
  left?: ZodTypeAny;
  right?: ZodTypeAny;
  options?: readonly ZodTypeAny[];
};

/**
 * Removes TimeZoneSchema fields from a detached copy. The converter throws on
 * that predicate, so leaving the field in would either abort the document or
 * require publishing a schema that accepts `Mars/Base`.
 */
const dropTimeZoneProperties = (schema: ZodTypeAny): string[] => {
  const dropped: string[] = [];
  const seen = new WeakSet<ZodTypeAny>();
  const visit = (node: ZodTypeAny, prefix: string): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const def = node._def as MutableDef;
    if (def.typeName === 'ZodObject' && def.shape !== undefined) {
      const shape = def.shape();
      const next: Record<string, ZodTypeAny> = {};
      let changed = false;
      for (const [key, field] of Object.entries(shape)) {
        const name = prefix === '' ? key : `${prefix}.${key}`;
        if (isUnencodedTimeZone(field)) {
          changed = true;
          dropped.push(name);
          continue;
        }
        next[key] = field;
        visit(field, name);
      }
      if (changed) def.shape = () => next;
      return;
    }
    if (def.innerType !== undefined) visit(def.innerType, prefix);
    if (def.schema !== undefined) visit(def.schema, prefix);
    if (def.typeName === 'ZodArray' && def.type !== undefined) visit(def.type, prefix);
    if (def.left !== undefined) visit(def.left, prefix);
    if (def.right !== undefined) visit(def.right, prefix);
    for (const option of def.options ?? []) visit(option, prefix);
  };
  visit(schema, '');
  return dropped;
};

const copySchemas = (schemas: readonly ZodTypeAny[] | undefined): ZodTypeAny[] | undefined =>
  schemas?.map((schema) => detachSchema(schema));

const fieldLocation = (method: string, side: 'input' | 'output'): UnencodedField['in'] => {
  if (side === 'output') return 'response';
  if (method === 'GET' || method === 'HEAD') return 'query';
  return 'requestBody';
};

const prepareProcedure = (
  procedure: AnyProcedureContract,
): { contract: AnyProcedureContract; prepared: PreparedProcedure } => {
  const meta = getOpenAPIMeta(procedure);
  const method = (meta?.method ?? 'POST').toLowerCase();
  const path = meta?.path ?? '';
  const httpMethod = meta?.method ?? 'POST';
  const definition = procedure['~orpc'];
  const inputSchemas = copySchemas(definition.inputSchemas as ZodTypeAny[] | undefined);
  const outputSchemas = copySchemas(definition.outputSchemas as ZodTypeAny[] | undefined);
  const unencoded: UnencodedField[] = [];
  for (const schema of inputSchemas ?? []) {
    for (const name of dropTimeZoneProperties(schema)) {
      unencoded.push({ name, in: fieldLocation(httpMethod, 'input'), reason: TIME_ZONE_UNENCODED_REASON });
    }
  }
  for (const schema of outputSchemas ?? []) {
    for (const name of dropTimeZoneProperties(schema)) {
      unencoded.push({ name, in: fieldLocation(httpMethod, 'output'), reason: TIME_ZONE_UNENCODED_REASON });
    }
  }
  return {
    contract: withErrorMap(procedure, documentedErrors(procedure), { inputSchemas, outputSchemas }),
    prepared: { method, path, inputSchemas: inputSchemas ?? [], unencoded },
  };
};

const prepareRouter = (router: unknown): { router: unknown; prepared: PreparedProcedure[] } => {
  if (router instanceof ProcedureContract) {
    const prepared = prepareProcedure(router);
    return { router: prepared.contract, prepared: [prepared.prepared] };
  }
  if (typeof router !== 'object' || router === null) return { router, prepared: [] };
  const prepared: PreparedProcedure[] = [];
  const entries = Object.entries(router).map(([key, value]) => {
    const child = prepareRouter(value);
    prepared.push(...child.prepared);
    return [key, child.router] as const;
  });
  return { router: Object.fromEntries(entries), prepared };
};

type OpenApiMedia = { schema?: JsonSchema };

type OpenApiResponse = {
  content?: Record<string, OpenApiMedia>;
};

type OpenApiOperation = {
  parameters?: Array<{ name?: string; schema?: JsonSchema; content?: Record<string, OpenApiMedia> }>;
  requestBody?: { content?: Record<string, OpenApiMedia> };
  responses?: Record<string, OpenApiResponse>;
  'x-yoink-unencoded'?: UnencodedField[];
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

const asSchema = (value: unknown): JsonSchema => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('OpenAPI schema is not an object');
  }
  return value as JsonSchema;
};

const pathParameters = (path: string): Set<string> => {
  const names = new Set<string>();
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
};

const isVacantObject = (schema: JsonSchema): boolean => {
  if (schema.type !== 'object') return false;
  const properties = schema.properties;
  const propertyCount =
    typeof properties === 'object' && properties !== null && !Array.isArray(properties)
      ? Object.keys(properties).length
      : 0;
  if (propertyCount > 0) return false;
  if (schema.anyOf !== undefined || schema.allOf !== undefined || schema.oneOf !== undefined) return false;
  if (schema.dependentRequired !== undefined) return false;
  return !Array.isArray(schema.required) || schema.required.length === 0;
};

/**
 * The generator flattens a union or `dependentRequired` object that also has
 * path params, which accepts combinations the wire rejects. The request body
 * is the converter schema with path params removed.
 */
const withoutPathParameters = (schema: JsonSchema, names: ReadonlySet<string>): JsonSchema => {
  if (names.size === 0) return schema;
  if (Array.isArray(schema.anyOf)) {
    return { ...schema, anyOf: schema.anyOf.map((branch) => withoutPathParameters(asSchema(branch), names)) };
  }
  if (Array.isArray(schema.oneOf)) {
    return { ...schema, oneOf: schema.oneOf.map((branch) => withoutPathParameters(asSchema(branch), names)) };
  }
  if (Array.isArray(schema.allOf)) {
    const branches = schema.allOf
      .map((branch) => withoutPathParameters(asSchema(branch), names))
      .filter((branch) => !isVacantObject(branch));
    if (branches.length === 1 && branches[0] !== undefined) return branches[0];
    return { ...schema, allOf: branches };
  }
  if (schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) return schema;
  const properties: JsonSchema = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (!names.has(key)) properties[key] = asSchema(value);
  }
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string' && !names.has(key))
    : undefined;
  const next: JsonSchema = { ...schema, properties };
  if (required !== undefined && required.length > 0) next.required = required;
  else delete next.required;
  return next;
};

const convertedInput = (schemas: readonly ZodTypeAny[]): JsonSchema => {
  const first = schemas[0];
  if (schemas.length === 1 && first !== undefined) return converter.convert(first, 'input')[0];
  return { allOf: schemas.map((schema) => converter.convert(schema, 'input')[0]) };
};

const restoreRequestBodies = (document: OpenApiDocument, prepared: readonly PreparedProcedure[]): void => {
  for (const procedure of prepared) {
    const operation = document.paths?.[procedure.path]?.[procedure.method];
    if (operation === undefined) throw new Error(`missing operation ${procedure.method} ${procedure.path}`);
    if (procedure.unencoded.length > 0) operation['x-yoink-unencoded'] = procedure.unencoded;
    const media = operation.requestBody?.content?.['application/json'];
    if (media === undefined || procedure.inputSchemas.length === 0) continue;
    media.schema = withoutPathParameters(convertedInput(procedure.inputSchemas), pathParameters(procedure.path));
  }
};

/**
 * A `z.void()` output has no JSON Schema. The generator then emits `content: {}`
 * on the 204. The wire body is empty, so that content object is removed.
 */
const stripEmptyNoContent = (document: OpenApiDocument): OpenApiDocument => {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      const response = operation.responses?.['204'];
      if (response?.content !== undefined && Object.keys(response.content).length === 0) {
        delete response.content;
      }
    }
  }
  return document;
};

/**
 * OpenAPI document for the frozen public v1 contract.
 * Paths are the resource paths (`/captures`). `/api/v1` is the mount prefix,
 * not part of the contract path. This does not register a route.
 */
export const generatePublicApiV1OpenApi = async () => {
  const prepared = prepareRouter(publicApiV1Contract);
  const generator = new OpenAPIGenerator({ converters: [converter] });
  const document = await generator.generate(prepared.router as typeof publicApiV1Contract, {
    version: '3.1.0',
    base: {
      info: {
        title: 'Yoink public API',
        version: 'v1',
      },
    },
    errorStatusMap: {
      ...COMMON_ERROR_STATUS_MAP,
      INVALID_CURSOR: 400,
    },
    errorResponseBodySchema: (definedErrors) => {
      const schemas = definedErrors.map((error) => error.dataJsonSchema);
      const first = schemas[0];
      if (schemas.length === 1 && first !== undefined) return first;
      return { oneOf: schemas };
    },
  });
  const openApi = document as unknown as OpenApiDocument;
  restoreRequestBodies(openApi, prepared.prepared);
  return stripEmptyNoContent(openApi);
};
