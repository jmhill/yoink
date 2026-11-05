import { ValidationError, type SchemaIssue } from '@orpc/contract';
import type { AnyORPCError } from '@orpc/server';
import { namedRequestValidationError } from '../request-validation.js';

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

const badRequestBody = (error: AnyORPCError) => {
  const issues = validationIssues(error);
  if (issues === undefined) {
    return { message: error.message };
  }
  return namedRequestValidationError({
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
 * ts-rest error bodies are `{ message, code? }`. oRPC's default body is
 * `{ defined, code, message, data }`. This encoder is the only place that
 * shape is rewritten.
 */
export const yoinkErrorBody = (error: AnyORPCError): unknown => {
  switch (error.code) {
    case 'BAD_REQUEST':
      return badRequestBody(error);
    case 'INVALID_CURSOR':
      return { message: error.message, code: 'invalid_cursor' };
    case 'FORBIDDEN':
      return { message: error.message };
    case 'UNAUTHORIZED':
      return { message: error.message };
    case 'SERVICE_UNAVAILABLE':
      return { status: 'unhealthy', database: 'disconnected' };
    case 'INTERNAL_SERVER_ERROR':
      return { message: 'Internal server error' };
    default:
      return { message: error.message };
  }
};
