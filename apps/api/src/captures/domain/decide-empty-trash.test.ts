import { describe, it, expect } from 'vitest';
import { decideEmptyTrash } from './decide-empty-trash.js';

describe('decideEmptyTrash', () => {
  it('decides CaptureTrashEmptied for the organization', () => {
    const event = decideEmptyTrash({
      command: { organizationId: 'org-123' },
    });

    expect(event).toEqual({
      type: 'CaptureTrashEmptied',
      organizationId: 'org-123',
    });
  });
});
