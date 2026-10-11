import { describe, expect, it } from 'vitest';
import type { ImportEntryError } from '@yoink/api-contracts';
import { formatImportPreviewError } from './format-import-preview-error';

const error = (overrides: Partial<ImportEntryError>): ImportEntryError => ({
  index: 0,
  name: 'Harbor shed',
  field: 'existingTaskIds.0',
  code: 'TASK_ALREADY_IN_PROJECT',
  message: 'That task is already in a project',
  ...overrides,
});

describe('formatImportPreviewError', () => {
  it('names the project and task for TASK_ALREADY_IN_PROJECT', () => {
    expect(formatImportPreviewError(error({ taskTitle: 'Paint the door' }))).toBe(
      "Harbor shed: 'Paint the door' is already in another project"
    );
  });

  it('never includes the field path', () => {
    const line = formatImportPreviewError(error({ taskTitle: 'Paint the door' }));
    expect(line).not.toContain('existingTaskIds');
    expect(line).not.toContain('.0');
  });

  it('names a missing task without a title', () => {
    expect(
      formatImportPreviewError(
        error({
          field: 'existingTaskIds.0',
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        })
      )
    ).toBe('Harbor shed: that task could not be found');
  });

  it('names a duplicate project', () => {
    expect(
      formatImportPreviewError(
        error({
          field: 'name',
          code: 'DUPLICATE_PROJECT_NAME',
          message: 'A project with this name already exists',
        })
      )
    ).toBe('Harbor shed: a project with this name already exists');
  });
});
