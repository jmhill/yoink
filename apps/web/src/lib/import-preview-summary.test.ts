import { describe, expect, it } from 'vitest';
import { formatImportPreviewSummary } from './import-preview-summary';

describe('formatImportPreviewSummary', () => {
  it('matches the 19-project invented-batch line', () => {
    expect(
      formatImportPreviewSummary({
        projectCount: 19,
        existingTaskCount: 27,
        newTaskCount: 4,
        warningCount: 1,
      })
    ).toBe('19 projects · 27 existing tasks · 4 new · 1 warning');
  });

  it('singularizes the 1-project case', () => {
    expect(
      formatImportPreviewSummary({
        projectCount: 1,
        existingTaskCount: 1,
        newTaskCount: 0,
        warningCount: 0,
      })
    ).toBe('1 project · 1 existing task · 0 new · 0 warnings');
  });
});
