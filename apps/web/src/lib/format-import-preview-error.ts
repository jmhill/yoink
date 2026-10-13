import type { ImportEntryError } from '@yoink/api-contracts';

const quoted = (title: string): string => `'${title}'`;

export const formatImportPreviewError = (error: ImportEntryError): string => {
  const name = error.name.trim() === '' ? 'Untitled' : error.name;
  const title = error.taskTitle;

  switch (error.code) {
    case 'TASK_ALREADY_IN_PROJECT':
      return title
        ? `${name}: ${quoted(title)} is already in another project`
        : `${name}: that task is already in another project`;
    case 'TASK_NOT_OPEN':
      return title ? `${name}: ${quoted(title)} is not open` : `${name}: that task is not open`;
    case 'TASK_NOT_FOUND':
      return title
        ? `${name}: ${quoted(title)} could not be found`
        : `${name}: that task could not be found`;
    case 'TASK_LISTED_TWICE':
      return title
        ? `${name}: ${quoted(title)} is listed more than once`
        : `${name}: that task is listed more than once`;
    case 'DUPLICATE_PROJECT_NAME':
      return `${name}: a project with this name already exists`;
    case 'IMPORT_DUPLICATE_NAME_IN_BATCH':
      return `${name}: this name is used more than once in this import`;
    case 'PROJECT_NAME_BLANK':
      return `${name}: name can't be blank`;
    case 'INVALID_PROJECT_STATUS':
      return `${name}: imported projects cannot be done, proposed, or declined`;
    case 'PROJECT_WAITING_ON_REQUIRED':
      return `${name}: waiting on is required`;
    case 'NEXT_ACTION_NOT_IN_ENTRY':
      return `${name}: next action must be a task in this project`;
    default:
      return `${name}: ${error.message}`;
  }
};
