import { describe, it, expect } from 'vitest';
import { decideUnsnoozeCapture } from './decide-unsnooze.js';
import type { Capture } from '@yoink/api-contracts';

const snoozedCapture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  snoozedUntil: '2025-01-20T10:00:00.000Z',
};

describe('decideUnsnoozeCapture', () => {
  it('decides CaptureUnsnoozed', () => {
    const decision = decideUnsnoozeCapture({
      current: snoozedCapture,
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(decision).toEqual({
      type: 'CaptureUnsnoozed',
      id: 'capture-123',
      organizationId: 'org-123',
    });
  });

  it('is a noop when not snoozed', () => {
    const decision = decideUnsnoozeCapture({
      current: { ...snoozedCapture, snoozedUntil: undefined },
      command: { id: 'capture-123', organizationId: 'org-123' },
    });

    expect(decision).toEqual({ type: 'Noop' });
  });
});
