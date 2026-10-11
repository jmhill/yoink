export type RequestValidationHttpError = {
  message: string;
  code: string;
};

type ValidationIssue = {
  path: string;
  code: string;
};

type RequestValidationErr = {
  message: string;
  body?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  query?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  pathParams?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
  headers?: { issues?: Array<{ path: PropertyKey[]; code: string }> } | null;
};

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

/**
 * Map ts-rest / Zod request failures on work and task list routes.
 * A bad IANA zone is INVALID_TIME_ZONE; everything else is VALIDATION_FAILED.
 */
export const listedRequestValidationError = (
  err: RequestValidationErr
): RequestValidationHttpError => {
  const issue = firstIssue(err);
  if (issue?.path === 'timeZone') {
    return { message: 'Invalid IANA time zone', code: 'INVALID_TIME_ZONE' };
  }
  return { message: 'Request validation failed', code: 'VALIDATION_FAILED' };
};
