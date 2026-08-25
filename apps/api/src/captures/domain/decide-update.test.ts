import { describe, it, expect } from 'vitest';
import { decideUpdateCapture } from './decide-update.js';
import type { Capture } from '@yoink/api-contracts';

const capture: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Original content',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
};

describe('decideUpdateCapture', () => {
  it('decides CaptureContentUpdated with provided fields', () => {
    const event = decideUpdateCapture({
      current: capture,
      command: {
        id: 'capture-123',
        organizationId: 'org-123',
        content: 'Updated content',
        title: 'New title',
      },
    });

    expect(event).toEqual({
      type: 'CaptureContentUpdated',
      id: 'capture-123',
      organizationId: 'org-123',
      content: 'Updated content',
      title: 'New title',
    });
  });
});
