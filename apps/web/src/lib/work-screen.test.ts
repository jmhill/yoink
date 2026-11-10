import { describe, expect, it } from 'vitest';
import { workScreenSectionCopy } from './work-screen';

describe('workScreenSectionCopy', () => {
  it('names the two Work groups', () => {
    expect(workScreenSectionCopy('due')).toEqual({
      title: 'Due',
      emptyMessage: 'Nothing due',
    });
    expect(workScreenSectionCopy('next-actions')).toEqual({
      title: 'Next actions',
      emptyMessage: 'No next actions',
    });
  });
});
