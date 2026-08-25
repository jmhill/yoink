import { describe, it, expect } from 'vitest';
import { decideDeleteCapture } from './decide-delete.js';
import type { Capture } from '@yoink/api-contracts';

const trashedCapture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  status: 'trashed',
  capturedAt: '2025-01-15T10:00:00.000Z',
  trashedAt: '2025-01-15T12:00:00.000Z',
};

describe('decideDeleteCapture', () => {
  it('decides CaptureDeleted when the capture is in trash', () => {
    const result = decideDeleteCapture({
      current: trashedCapture,
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'CaptureDeleted',
        id: 'capture-123',
        organizationId: 'org-123',
      });
    }
  });

  it('rejects deleting a capture that is not in trash', () => {
    const result = decideDeleteCapture({
      current: { ...trashedCapture, status: 'inbox', trashedAt: undefined },
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_NOT_IN_TRASH');
    }
  });
});
