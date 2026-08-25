import { describe, it, expect } from 'vitest';
import { decideCreateCapture } from './decide-create.js';

describe('decideCreateCapture', () => {
  const command = {
    content: 'My text',
    organizationId: 'org-123',
    createdById: 'user-456',
  };

  it('decides a CaptureCreated fact with generated id and timestamp', () => {
    const event = decideCreateCapture({
      command,
      id: 'capture-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(event).toEqual({
      type: 'CaptureCreated',
      id: 'capture-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      content: 'My text',
      capturedAt: '2025-01-15T10:00:00.000Z',
    });
  });

  it('includes optional fields when provided', () => {
    const event = decideCreateCapture({
      command: {
        ...command,
        title: 'A title',
        sourceUrl: 'https://example.com',
        sourceApp: 'browser-extension',
      },
      id: 'capture-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(event.title).toBe('A title');
    expect(event.sourceUrl).toBe('https://example.com');
    expect(event.sourceApp).toBe('browser-extension');
  });
});
