import { describe, it, expect } from 'vitest';
import { decideEmptyTrash } from './decide-empty-trash.js';

describe('decideEmptyTrash', () => {
  it('decides CaptureTrashEmptied for the organization', () => {
    const event = decideEmptyTrash({
      command: { organizationId: 'org-123', actor: { kind: 'user' as const, userId: 'user-456', via: 'session' as const } },
    });

    expect(event).toEqual({
      type: 'CaptureTrashEmptied',
      organizationId: 'org-123',
    });
  });
});
