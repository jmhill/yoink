import { describe, expect, it } from 'vitest';
import { proposedGroupExpectation } from './proposed-rail-check.js';

describe('proposedGroupExpectation', () => {
  it('omits the group when no proposal is expected', () => {
    expect(proposedGroupExpectation([])).toBe('omitted');
  });

  it('checks the rows when proposals are expected', () => {
    expect(proposedGroupExpectation(['gun storage'])).toBe('rows');
  });
});
