export type NoteHttpError = {
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

export const noteRequestValidationError = (err: RequestValidationErr): NoteHttpError => {
  const issue = firstIssue(err);
  if (!issue) {
    return { message: 'Request validation failed', code: 'VALIDATION_FAILED' };
  }

  if (issue.path === 'title' && issue.code === 'too_small') {
    return { message: "Title can't be blank", code: 'NOTE_TITLE_BLANK' };
  }
  if (issue.path === 'title' && issue.code === 'too_big') {
    return { message: 'Title must be 120 characters or fewer', code: 'NOTE_TITLE_TOO_LONG' };
  }
  if (issue.path === 'body' && issue.code === 'too_big') {
    return { message: 'Body must be 50,000 characters or fewer', code: 'NOTE_BODY_TOO_LONG' };
  }
  if (issue.path === 'expectedVersion') {
    return { message: 'expectedVersion is required', code: 'VALIDATION_FAILED' };
  }
  if (issue.path === 'baseVersion') {
    return { message: 'baseVersion is required when updating an existing note', code: 'VALIDATION_FAILED' };
  }
  if (issue.path === 'since') {
    return { message: 'since must be an ISO timestamp', code: 'VALIDATION_FAILED' };
  }

  return { message: 'Request validation failed', code: 'VALIDATION_FAILED' };
};
