export type ProjectHttpError = {
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

const isBlankStringIssue = (issue: ValidationIssue): boolean =>
  issue.code === 'too_small' || issue.code === 'invalid_type';

/**
 * Map ts-rest / Zod request failures on project routes to a clear
 * message and a stable code. Blank name is PROJECT_NAME_BLANK (not
 * INVALID_PROJECT_NAME) so clients can show "Name can't be blank"
 * without parsing the message. A wrong-type name is VALIDATION_FAILED.
 * Other field problems keep a specific code when we know the field;
 * everything else is VALIDATION_FAILED.
 */
export const projectRequestValidationError = (
  err: RequestValidationErr
): ProjectHttpError => {
  const issue = firstIssue(err);
  if (!issue) {
    return { message: 'Request validation failed', code: 'VALIDATION_FAILED' };
  }

  if (issue.path === 'name' && issue.code === 'too_small') {
    return { message: "Name can't be blank", code: 'PROJECT_NAME_BLANK' };
  }
  if (issue.path === 'name' && issue.code === 'too_big') {
    return {
      message: 'Name must be 200 characters or fewer',
      code: 'INVALID_PROJECT_NAME',
    };
  }
  if (issue.path === 'waitingOn' && isBlankStringIssue(issue)) {
    return { message: "Waiting on can't be blank", code: 'PROJECT_WAITING_ON_BLANK' };
  }
  if (issue.path === 'waitingOn' && issue.code === 'too_big') {
    return {
      message: 'Waiting on must be 200 characters or fewer',
      code: 'PROJECT_WAITING_ON_TOO_LONG',
    };
  }
  if (issue.path === 'status') {
    return {
      message: 'Status must be active, waiting, someday, or done',
      code: 'INVALID_PROJECT_STATUS',
    };
  }
  if (issue.path === 'waitingSince') {
    return {
      message: 'Waiting since must be a date (YYYY-MM-DD) or unknown',
      code: 'INVALID_WAITING_SINCE',
    };
  }
  if (issue.path === 'openTasks') {
    return {
      message: "Open tasks must be 'complete' or 'remove'",
      code: 'VALIDATION_FAILED',
    };
  }

  return { message: 'Request validation failed', code: 'VALIDATION_FAILED' };
};
