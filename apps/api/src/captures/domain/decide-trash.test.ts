import { describe, it, expect } from 'vitest';
import { decideTrashCapture } from './decide-trash.js';
import type { Capture } from '@yoink/api-contracts';

const inboxCapture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
};

describe('decideTrashCapture', () => {
  it('decides CaptureTrashed and clears snooze', () => {
    const decision = decideTrashCapture({
      current: { ...inboxCapture, snoozedUntil: '2025-01-20T10:00:00.000Z' },
      command: { id: 'capture-123', organizationId: 'org-123' },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(decision).toEqual({
      type: 'CaptureTrashed',
      id: 'capture-123',
      organizationId: 'org-123',
      trashedAt: '2025-01-16T10:00:00.000Z',
    });
  });

  it('is a noop when already trashed', () => {
    const decision = decideTrashCapture({
      current: {
        ...inboxCapture,
        status: 'trashed',
        trashedAt: '2025-01-15T12:00:00.000Z',
      },
      command: { id: 'capture-123', organizationId: 'org-123' },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(decision).toEqual({ type: 'Noop' });
  });
});
