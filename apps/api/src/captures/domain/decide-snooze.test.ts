import { describe, it, expect } from 'vitest';
import { decideSnoozeCapture } from './decide-snooze.js';
import type { Capture } from '@yoink/api-contracts';

const inboxCapture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
};

describe('decideSnoozeCapture', () => {
  it('decides CaptureSnoozed when time is in the future', () => {
    const result = decideSnoozeCapture({
      current: inboxCapture,
      command: {
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-20T10:00:00.000Z',
      },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'CaptureSnoozed',
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-20T10:00:00.000Z',
      });
    }
  });

  it('rejects snoozing a trashed capture', () => {
    const result = decideSnoozeCapture({
      current: { ...inboxCapture, status: 'trashed' },
      command: {
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-20T10:00:00.000Z',
      },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('CAPTURE_ALREADY_TRASHED');
    }
  });

  it('rejects a snooze time that is not in the future', () => {
    const result = decideSnoozeCapture({
      current: inboxCapture,
      command: {
        id: 'capture-123',
        organizationId: 'org-123',
        until: '2025-01-16T10:00:00.000Z',
      },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_SNOOZE_TIME');
    }
  });
});
