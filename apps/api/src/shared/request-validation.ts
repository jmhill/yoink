export type RequestValidationHttpError = {
  message: string;
  code: string;
  fields?: string[];
};

export type RequestValidationErr = {
  message: string;
  body?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  query?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  pathParams?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  headers?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
};

type ValidationIssue = {
  path: string;
  code: string;
};

const issuesOf = (
  source: RequestValidationErr['body']
): Array<{ path: PropertyKey[]; code: string }> => source?.issues ?? [];

export const validationIssuePaths = (err: RequestValidationErr): string[] =>
  [err.body, err.query, err.pathParams, err.headers].flatMap((source) =>
    issuesOf(source)
      .map((issue) => issue.path.map(String).join('.'))
      .filter((path) => path.length > 0)
  );

const firstIssue = (err: RequestValidationErr): ValidationIssue | null => {
  const sources = [err.body, err.query, err.pathParams, err.headers];
  for (const source of sources) {
    const issue = source?.issues?.[0];
    if (issue) {
      return {
        path: issue.path.map(String).join('.'),
        code: issue.code,
      };
    }
  }
  return null;
};

export const namedValidationFailedMessage = (fields: string[]): string =>
  fields.length > 0
    ? `Request validation failed: ${fields.join(', ')}`
    : 'Request validation failed';

export const namedRequestValidationError = (
  err: RequestValidationErr
): RequestValidationHttpError => {
  const fields = validationIssuePaths(err);
  return {
    message: namedValidationFailedMessage(fields),
    code: 'VALIDATION_FAILED',
    fields,
  };
};

/**
 * Map ts-rest / Zod request failures on work and task list routes.
 * A bad IANA zone is INVALID_TIME_ZONE; everything else is VALIDATION_FAILED
 * and names the failing fields.
 */
export const listedRequestValidationError = (
  err: RequestValidationErr
): RequestValidationHttpError => {
  const issue = firstIssue(err);
  if (issue?.path === 'timeZone') {
    return { message: 'Invalid IANA time zone', code: 'INVALID_TIME_ZONE' };
  }
  const fields = validationIssuePaths(err);
  return {
    message: namedValidationFailedMessage(fields),
    code: 'VALIDATION_FAILED',
    fields,
  };
};
