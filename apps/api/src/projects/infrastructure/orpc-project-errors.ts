import { ORPCError } from '@orpc/server';
import type { ListFinishedTasksOnProjectError } from '../../history/application/handle-list-finished-tasks.js';
import type { ListProjectHistoryError } from '../../history/application/handle-list-project-history.js';
import { yoinkHttpError, yoinkServerError } from '../../edges/_shared/orpc/yoink-http-error.js';
import type {
  ApplyImportError,
  ChangeProjectStatusError,
  ConfirmProposedProjectError,
  CreateProjectError,
  DeclineProposedProjectError,
  DiscardImportError,
  GetImportError,
  GetProjectError,
  ImportEntryError,
  ImportInvalidError,
  ListImportsError,
  ListOpenTasksOnProjectError,
  ListProjectsError,
  OpenTasksUnreadError,
  ProjectHasOpenTasksError,
  RestoreDeclinedProjectError,
  SetProjectNextActionError,
  StageImportError,
  UpdateProjectError,
} from '../domain/project-errors.js';

type CodedError = {
  readonly type: string;
  readonly message: string;
};

type HttpStatus = 'BAD_REQUEST' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

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

export const mapListProjectsError = (error: ListProjectsError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'INVALID_PROJECT_STATUS':
      return httpError('BAD_REQUEST', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list projects', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list projects', _never);
    }
  }
};

export const mapCreateProjectError = (error: CreateProjectError) => {
  switch (error.type) {
    case 'PROJECT_NAME_BLANK':
    case 'INVALID_PROJECT_NAME':
    case 'INVALID_PROJECT_STATUS':
    case 'INVALID_PROJECT_REASON':
    case 'INVALID_SUGGESTED_NEXT_ACTION':
      return httpError('BAD_REQUEST', error);
    case 'DUPLICATE_PROJECT_NAME':
      return httpError('CONFLICT', error);
    case 'PROJECT_CREATE_REQUIRES_PERSON':
    case 'PROJECT_PROPOSE_REQUIRES_BOT':
      return httpError('FORBIDDEN', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to create project', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to create project', _never);
    }
  }
};

export const mapStageImportError = (error: StageImportError) => {
  switch (error.type) {
    case 'IMPORT_INVALID':
      return importInvalid(error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to stage project import', error);
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to stage project import', _never);
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

export const mapListProjectHistoryError = (error: ListProjectHistoryError) => {
  switch (error.type) {
    case 'INVALID_CURSOR':
      return invalidCursor(error);
    case 'PROJECT_NOT_FOUND':
      return httpError('NOT_FOUND', error);
    case 'STORAGE_ERROR':
      return yoinkServerError('Failed to list project history', error, 'STORAGE_ERROR');
    default: {
      const _never: never = error;
      return yoinkServerError('Failed to list project history', _never, 'STORAGE_ERROR');
    }
  }
};

export const mapListProjectTasksError = (
  error: ListOpenTasksOnProjectError | ListFinishedTasksOnProjectError
) => {
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
