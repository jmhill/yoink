import { ORPCError } from '@orpc/server';
import { yoinkHttpError, yoinkServerError } from '../_shared/orpc/yoink-http-error.js';
import {
  namedValidationFailedMessage,
  validationIssuePaths,
  type RequestValidationErr,
} from '../_shared/request-validation.js';
import type {
  ApplyImportError,
  ChangeProjectStatusError,
  ConfirmProposedProjectError,
  DeclineProposedProjectError,
  DiscardImportError,
  GetImportError,
  GetProjectError,
  ImportEntryError,
  ImportInvalidError,
  ListImportsError,
  ListOpenTasksOnProjectError,
  OpenTasksUnreadError,
  ProjectHasOpenTasksError,
  RestoreDeclinedProjectError,
  SetProjectNextActionError,
  UpdateProjectError,
} from '../../modules/task-management/index.js';

/**
 * Copied from the public-api project maps so this edge does not import that
 * edge. Statuses and bodies stay the same. Notes, create, and the project
 * catalog stay on the alias. Finished tasks and history are the web history edge.
 */

type CodedError = {
  readonly type: string;
  readonly message: string;
};

type HttpStatus = 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

type ProjectHttpError = {
  message: string;
  code: string;
  fields?: string[];
};

type ValidationIssue = {
  path: string;
  code: string;
};

const httpError = (code: HttpStatus, error: CodedError) =>
  yoinkHttpError({
    code,
    message: error.message,
    bodyCode: error.type,
    cause: error,
  });

const invalidCursor = (error: { readonly message: string }) =>
  new ORPCError('INVALID_CURSOR', {
    message: error.message,
    cause: error,
  });

const importEntryBody = (entry: ImportEntryError) => {
  const base = {
    index: entry.index,
    name: entry.name,
    field: entry.field,
    code: entry.code,
    message: entry.message,
  };
  if (entry.taskTitle === undefined) {
    return base;
  }
  return { ...base, taskTitle: entry.taskTitle };
};

const importInvalid = (error: ImportInvalidError) =>
  new ORPCError('BAD_REQUEST', {
    message: error.message,
    data: {
      code: 'IMPORT_INVALID',
      errors: error.errors.map(importEntryBody),
    },
    cause: error,
  });

const openTasksConflict = (error: ProjectHasOpenTasksError | OpenTasksUnreadError) =>
  new ORPCError('CONFLICT', {
    message: error.message,
    data: {
      code: error.type,
      openTaskCount: error.openTaskCount,
    },
    cause: error,
  });

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
 * Map Zod request failures on project routes to a clear message and a stable
 * code. Blank name is PROJECT_NAME_BLANK. A wrong-type name is VALIDATION_FAILED.
 */
export const projectPageRequestValidationError = (
  err: RequestValidationErr
): ProjectHttpError => {
  const issue = firstIssue(err);
  if (!issue) {
    const fields = validationIssuePaths(err);
    return {
      message: namedValidationFailedMessage(fields),
      code: 'VALIDATION_FAILED',
      fields,
    };
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
  if (issue.path === 'newTask.title' && issue.code === 'too_small') {
    return { message: "Title can't be blank", code: 'TASK_TITLE_BLANK' };
  }
  if (issue.path === 'newTask.title' && issue.code === 'too_big') {
    return {
      message: 'Title must be 500 characters or fewer',
      code: 'TASK_TITLE_TOO_LONG',
    };
  }
  if (issue.path === 'taskId' || issue.path === 'newTask') {
    return {
      message: 'Provide a taskId, null to clear, or a newTask',
      code: 'VALIDATION_FAILED',
    };
  }

  const fields = validationIssuePaths(err);
  return {
    message: namedValidationFailedMessage(fields),
    code: 'VALIDATION_FAILED',
    fields,
  };
};

export const mapGetProjectError = (error: GetProjectError) => {
  switch (error.type) {
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to get project', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to get project', _never);
    }
  }
};

export const mapListOpenTasksOnProjectError = (error: ListOpenTasksOnProjectError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list project tasks', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list project tasks', _never);
    }
  }
};

export const mapUpdateProjectError = (error: UpdateProjectError) => {
  switch (error.type) {
    case 'PROJECT_NAME_BLANK':
    case 'INVALID_PROJECT_NAME':
    case 'INVALID_PROJECT_REASON':
    case 'INVALID_SUGGESTED_NEXT_ACTION':
    case 'INVALID_NOTEBOOK_PATH':
    case 'NOTEBOOK_PAGE_DUPLICATE':
    case 'NOTEBOOK_PAGES_TOO_MANY':
      return httpError('BAD_REQUEST', error);
    case 'DUPLICATE_PROJECT_NAME':
      return httpError('CONFLICT', error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to update project', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to update project', _never);
    }
  }
};

export const mapChangeProjectStatusError = (error: ChangeProjectStatusError) => {
  switch (error.type) {
    case 'INVALID_PROJECT_STATUS':
    case 'PROJECT_NOT_PROPOSED':
    case 'PROJECT_WAITING_ON_REQUIRED':
    case 'PROJECT_WAITING_ON_BLANK':
    case 'PROJECT_WAITING_ON_TOO_LONG':
    case 'INVALID_WAITING_SINCE':
      return httpError('BAD_REQUEST', error);
    case 'PROJECT_DONE_REQUIRES_PERSON':
    case 'PROJECT_REOPEN_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'PROJECT_HAS_OPEN_TASKS':
    case 'OPEN_TASKS_UNREAD':
      return openTasksConflict(error);
    case 'STORAGE_ERROR':
    case 'OPEN_TASK_PLAN_FAILED':
      return yoinkServerError('Failed to change project status', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to change project status', _never);
    }
  }
};

export const mapSetNextActionError = (error: SetProjectNextActionError) => {
  switch (error.type) {
    case 'TASK_NOT_OPEN':
    case 'TASK_NOT_IN_PROJECT':
    case 'PROJECT_DONE':
    case 'PROJECT_PROPOSED':
    case 'TASK_TITLE_BLANK':
    case 'TASK_TITLE_TOO_LONG':
    case 'LIST_NOT_IN_ORGANIZATION':
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
      return httpError('BAD_REQUEST', error);
    case 'PROJECT_NOT_FOUND':
    case 'TASK_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
    case 'OPEN_TASK_PLAN_FAILED':
      return yoinkServerError('Failed to set project next action', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to set project next action', _never);
    }
  }
};

export const mapConfirmProposalError = (error: ConfirmProposedProjectError) => {
  switch (error.type) {
    case 'PROJECT_NAME_BLANK':
    case 'INVALID_PROJECT_NAME':
    case 'INVALID_PROJECT_STATUS':
    case 'INVALID_SUGGESTED_NEXT_ACTION':
    case 'PROJECT_WAITING_ON_REQUIRED':
    case 'PROJECT_WAITING_ON_BLANK':
    case 'PROJECT_WAITING_ON_TOO_LONG':
    case 'INVALID_WAITING_SINCE':
    case 'TASK_TITLE_BLANK':
    case 'TASK_TITLE_TOO_LONG':
    case 'LIST_NOT_IN_ORGANIZATION':
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
    case 'PROJECT_DONE':
    case 'PROJECT_PROPOSED':
    case 'TASK_NOT_OPEN':
    case 'TASK_NOT_IN_PROJECT':
      return httpError('BAD_REQUEST', error);
    case 'PROJECT_CONFIRM_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'PROJECT_NOT_FOUND':
    case 'TASK_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'PROJECT_NOT_PROPOSED':
    case 'DUPLICATE_PROJECT_NAME':
      return httpError('CONFLICT', error);
    case 'STORAGE_ERROR':
    case 'OPEN_TASK_PLAN_FAILED':
      return yoinkServerError('Failed to confirm project proposal', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to confirm project proposal', _never);
    }
  }
};

export const mapDeclineProposalError = (error: DeclineProposedProjectError) => {
  switch (error.type) {
    case 'PROJECT_DECLINE_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'PROJECT_NOT_PROPOSED':
      return httpError('CONFLICT', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to decline project proposal', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to decline project proposal', _never);
    }
  }
};

export const mapRestoreProposalError = (error: RestoreDeclinedProjectError) => {
  switch (error.type) {
    case 'PROJECT_RESTORE_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'PROJECT_NOT_DECLINED':
    case 'DUPLICATE_PROJECT_NAME':
      return httpError('CONFLICT', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to restore project proposal', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to restore project proposal', _never);
    }
  }
};

export const mapListImportsError = (error: ListImportsError) => {
  switch (error.type) {
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list project imports', error);
  }
};

export const mapGetImportError = (error: GetImportError) => {
  switch (error.type) {
    case 'IMPORT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to get project import', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to get project import', _never);
    }
  }
};

export const mapApplyImportError = (error: ApplyImportError) => {
  switch (error.type) {
    case 'IMPORT_INVALID':
      return importInvalid(error);
    case 'IMPORT_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'IMPORT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'IMPORT_NOT_PENDING':
    case 'DUPLICATE_PROJECT_NAME':
      return httpError('CONFLICT', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to apply project import', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to apply project import', _never);
    }
  }
};

export const mapDiscardImportError = (error: DiscardImportError) => {
  switch (error.type) {
    case 'IMPORT_REQUIRES_PERSON':
      return httpError('FORBIDDEN', error);
    case 'IMPORT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'IMPORT_NOT_PENDING':
      return httpError('CONFLICT', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to discard project import', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to discard project import', _never);
    }
  }
};
