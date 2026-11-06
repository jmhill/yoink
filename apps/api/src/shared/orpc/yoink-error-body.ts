import { ValidationError, type SchemaIssue } from '@orpc/contract';
import type { AnyORPCError } from '@orpc/server';
import {
  namedRequestValidationError,
  type RequestValidationErr,
  type RequestValidationHttpError,
} from '../request-validation.js';

const propertyKeys = (
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
): PropertyKey[] => {
  if (path === undefined) {
    return [];
  }
  return path.map((segment) =>
    typeof segment === 'string' || typeof segment === 'number' || typeof segment === 'symbol'
      ? segment
      : segment.key
  );
};

const issueCode = (issue: SchemaIssue): string => {
  if ('code' in issue && typeof issue.code === 'string') {
    return issue.code;
  }
  return 'invalid';
};

const validationIssues = (error: AnyORPCError): readonly SchemaIssue[] | undefined => {
  if (error.cause instanceof ValidationError) {
    return error.cause.issues;
  }
  return undefined;
};

const stringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return undefined;
  }
  return value;
};

const isJsonValue = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const reservedDataKeys = new Set(['code', 'fields', 'publicMessage']);

const extraDataFields = (data: object): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data).filter(([key, value]) => !reservedDataKeys.has(key) && isJsonValue(value))
  );

const domainErrorData = (
  data: unknown
): {
  readonly code?: string;
  readonly fields?: readonly string[];
  readonly publicMessage?: string;
  readonly extra: Record<string, unknown>;
} => {
  if (typeof data !== 'object' || data === null) {
    return { extra: {} };
  }
  const code = 'code' in data && typeof data.code === 'string' ? data.code : undefined;
  const fields = 'fields' in data ? stringArray(data.fields) : undefined;
  const publicMessage =
    'publicMessage' in data && typeof data.publicMessage === 'string' ? data.publicMessage : undefined;
  return { code, fields, publicMessage, extra: extraDataFields(data) };
};

const messageBody = (error: AnyORPCError, message = error.message) => {
  const extra = domainErrorData(error.data);
  const coded =
    extra.code !== undefined && extra.fields !== undefined
      ? { message, code: extra.code, fields: extra.fields }
      : extra.code !== undefined
        ? { message, code: extra.code }
        : extra.fields !== undefined
          ? { message, fields: extra.fields }
          : { message };
  return { ...coded, ...extra.extra };
};

const validationBody = (
  error: AnyORPCError,
  validation: (err: RequestValidationErr) => RequestValidationHttpError
): RequestValidationHttpError | undefined => {
  const issues = validationIssues(error);
  if (issues === undefined) {
    return undefined;
  }
  return validation({
    message: error.message,
    body: {
      issues: issues.map((issue) => ({
        path: propertyKeys(issue.path),
        code: issueCode(issue),
      })),
    },
  });
};

/**
 * Yoink error bodies are `{ message, code?, fields? }`. oRPC's default body is
 * `{ defined, code, message, data }`. This encoder is the only place that
 * shape is rewritten.
 *
 * A domain `code` rides on `ORPCError.data.code` so standard HTTP codes
 * (NOT_FOUND, CONFLICT, FORBIDDEN) can still name the closed error.
 * SERVICE_UNAVAILABLE stays the health body. 500 stays the generic message.
 */
export const yoinkErrorBody = (
  error: AnyORPCError,
  validation: (err: RequestValidationErr) => RequestValidationHttpError = namedRequestValidationError
): unknown => {
  switch (error.code) {
    case 'BAD_REQUEST': {
      const validated = validationBody(error, validation);
      if (validated !== undefined) {
        return validated;
      }
      return messageBody(error);
    }
    case 'INVALID_CURSOR':
      return { message: error.message, code: 'invalid_cursor' };
    case 'SERVICE_UNAVAILABLE':
      return { status: 'unhealthy', database: 'disconnected' };
    case 'INTERNAL_SERVER_ERROR': {
      const extra = domainErrorData(error.data);
      return messageBody(error, extra.publicMessage ?? 'Internal server error');
    }
    default:
      return messageBody(error);
  }
};
