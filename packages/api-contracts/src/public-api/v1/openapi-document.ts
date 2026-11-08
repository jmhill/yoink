import { ProcedureContract, type AnyProcedureContract } from '@orpc/contract';
import { COMMON_ERROR_STATUS_MAP, getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi';
import { z } from 'zod';
import { SetProjectNextActionSchema } from '../../schemas/project.js';
import { publicApiV1Contract } from './contract.js';
import { Zod3JsonSchemaConverter } from './zod3-json-schema-converter.js';

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

const converter = new Zod3JsonSchemaConverter();

/**
 * The generator flattens a union body intersected with a path param into one
 * object, which accepts combinations the wire rejects. The request body stays
 * the union.
 */
const nextActionBodySchema = converter.convert(SetProjectNextActionSchema, 'input')[0];

type SpecOperation = {
  requestBody?: { content?: { 'application/json'?: { schema?: unknown } } };
};

const withErrorMap = (
  procedure: AnyProcedureContract,
  errors: Record<string, ErrorData>,
): AnyProcedureContract => {
  const definition = procedure['~orpc'];
  const errorMap = { ...errors, UNAUTHORIZED: { data: messageBody } };
  const meta = getOpenAPIMeta(procedure);
  if (meta?.method !== 'PUT' || meta.path !== '/projects/{id}/next-action') {
    return new ProcedureContract({ ...definition, errorMap });
  }
  const stored = definition.meta as { '~openapi'?: Record<string, unknown> };
  return new ProcedureContract({
    ...definition,
    errorMap,
    meta: {
      ...definition.meta,
      '~openapi': {
        ...stored['~openapi'],
        spec: (operation: SpecOperation) => {
          const media = operation.requestBody?.content?.['application/json'];
          if (media !== undefined) media.schema = nextActionBodySchema;
          return operation;
        },
      },
    },
  });
};

/**
 * Domain errors differ by route. These four are pinned to the bodies the
 * handlers already return. Every mounted v1 route also has the auth
 * preHandler, whose 401 body is `{ message }`.
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
      return {
        BAD_REQUEST: { data: listedBadRequestBody },
        INVALID_CURSOR: { data: invalidCursorBody },
        INTERNAL_SERVER_ERROR: { data: serverErrorBody },
      };
    default:
      return {};
  }
};

const documentRouter = (router: unknown): unknown => {
  if (router instanceof ProcedureContract) return withErrorMap(router, documentedErrors(router));
  if (typeof router !== 'object' || router === null) return router;
  return Object.fromEntries(Object.entries(router).map(([key, value]) => [key, documentRouter(value)]));
};

type OpenApiResponse = {
  content?: Record<string, unknown>;
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, { responses?: Record<string, OpenApiResponse> }>>;
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
  const generator = new OpenAPIGenerator({ converters: [converter] });
  const document = await generator.generate(documentRouter(publicApiV1Contract) as typeof publicApiV1Contract, {
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
  return stripEmptyNoContent(document as unknown as OpenApiDocument);
};
