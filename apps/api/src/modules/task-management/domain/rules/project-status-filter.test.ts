import { describe, it, expect } from 'vitest';
import {
  heldProjectNames,
  listIncludesProposalStatuses,
  parseProjectStatusFilter,
} from './project-status-filter.js';

describe('parseProjectStatusFilter', () => {
  it('defaults to the working set', () => {
    const result = parseProjectStatusFilter(undefined);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(['active', 'waiting', 'someday', 'done']);
    }
  });

  it('accepts proposed,declined', () => {
    const result = parseProjectStatusFilter('proposed,declined');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(['proposed', 'declined']);
    }
  });

  it('rejects an unknown status', () => {
    const result = parseProjectStatusFilter('proposed,nope');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_STATUS');
    }
  });
});

describe('heldProjectNames', () => {
  it('drops declined so that name is free', () => {
    expect(
      heldProjectNames([
        { name: 'Harbor shed', status: 'declined' },
        { name: 'Garden', status: 'active' },
        { name: 'Dock', status: 'proposed' },
      ])
    ).toEqual(['Garden', 'Dock']);
  });
});

describe('listIncludesProposalStatuses', () => {
  it('is true when proposed or declined is requested', () => {
    expect(listIncludesProposalStatuses(['proposed'])).toBe(true);
    expect(listIncludesProposalStatuses(['declined'])).toBe(true);
    expect(listIncludesProposalStatuses(['active', 'done'])).toBe(false);
  });
});
