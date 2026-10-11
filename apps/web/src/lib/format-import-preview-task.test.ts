import { describe, expect, it } from 'vitest';
import { formatImportPreviewTaskLine } from './format-import-preview-task';

describe('formatImportPreviewTaskLine', () => {
  it('adds due date and owner on existing tasks', () => {
    expect(
      formatImportPreviewTaskLine({
        title: 'Paint the door',
        source: 'existing',
        dueDate: '2026-11-01',
        assigneeName: 'Alice',
      })
    ).toBe('Paint the door (existing) · Nov 1 · Alice');
  });

  it('leaves new tasks as title and source', () => {
    expect(
      formatImportPreviewTaskLine({
        title: 'Call the clerk',
        source: 'new',
        dueDate: '2026-11-01',
        assigneeName: 'Alice',
      })
    ).toBe('Call the clerk (new)');
  });
});
