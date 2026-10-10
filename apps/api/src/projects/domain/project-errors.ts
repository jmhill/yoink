import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';

export type StorageError = {
  readonly type: 'STORAGE_ERROR';
  readonly message: string;
  readonly cause?: unknown;
};

export type InvalidProjectNameError = {
  readonly type: 'INVALID_PROJECT_NAME';
  readonly message: string;
};

export type DuplicateProjectNameError = {
  readonly type: 'DUPLICATE_PROJECT_NAME';
  readonly name: string;
  readonly message: string;
};

export type ProjectNotFoundError = {
  readonly type: 'PROJECT_NOT_FOUND';
  readonly id: string;
  readonly message: string;
};

export type ProjectCreateRequiresPersonError = {
  readonly type: 'PROJECT_CREATE_REQUIRES_PERSON';
  readonly message: string;
};

export type ListProjectsError = StorageError | InvalidCursorError;
export type GetProjectError = StorageError | ProjectNotFoundError;
export type CreateProjectError =
  | StorageError
  | InvalidProjectNameError
  | DuplicateProjectNameError
  | ProjectCreateRequiresPersonError;
export type UpdateProjectError =
  | StorageError
  | InvalidProjectNameError
  | DuplicateProjectNameError
  | ProjectNotFoundError;

export const storageError = (message: string, cause?: unknown): StorageError => ({
  type: 'STORAGE_ERROR',
  message,
  cause,
});

export const invalidProjectNameError = (message: string): InvalidProjectNameError => ({
  type: 'INVALID_PROJECT_NAME',
  message,
});

export const duplicateProjectNameError = (name: string): DuplicateProjectNameError => ({
  type: 'DUPLICATE_PROJECT_NAME',
  name,
  message: 'A project with this name already exists',
});

export const projectNotFoundError = (id: string): ProjectNotFoundError => ({
  type: 'PROJECT_NOT_FOUND',
  id,
  message: 'Project not found',
});

export const projectCreateRequiresPersonError = (): ProjectCreateRequiresPersonError => ({
  type: 'PROJECT_CREATE_REQUIRES_PERSON',
  message: 'Creating a project requires a person',
});
