import { describe, it, expect } from 'vitest';
import { decideRestoreCapture } from './decide-restore.js';
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

describe('decideRestoreCapture', () => {
  it('decides CaptureRestored', () => {
    const decision = decideRestoreCapture({
      current: trashedCapture,
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(decision).toEqual({
      type: 'CaptureRestored',
      id: 'capture-123',
      organizationId: 'org-123',
    });
  });

  it('is a noop when already in inbox', () => {
    const decision = decideRestoreCapture({
      current: { ...trashedCapture, status: 'inbox', trashedAt: undefined },
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(decision).toEqual({ type: 'Noop' });
  });
});
