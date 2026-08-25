import { describe, it, expect } from 'vitest';
import { applyCaptureEvent } from './apply-capture-event.js';
import type { Capture } from '@yoink/api-contracts';
import type { CaptureCreated } from './events.js';

const current: Capture = {
  id: 'capture-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  content: 'Content',
  title: 'Title',
  status: 'inbox',
  capturedAt: '2025-01-15T10:00:00.000Z',
  snoozedUntil: '2025-01-20T10:00:00.000Z',
};

describe('applyCaptureEvent', () => {
  describe('CaptureCreated', () => {
    const event: CaptureCreated = {
      type: 'CaptureCreated',
      id: 'capture-id-1',
      organizationId: 'org-123',
      createdById: 'user-456',
      content: 'My text',
      capturedAt: '2025-01-15T10:00:00.000Z',
    };

    it('projects a new inbox capture from the fact', () => {
      expect(applyCaptureEvent(null, event)).toEqual({
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('includes optional fields when present', () => {
      const withOptionals: CaptureCreated = {
        ...event,
        title: 'A title',
        sourceUrl: 'https://example.com',
        sourceApp: 'browser-extension',
      };

      const capture = applyCaptureEvent(null, withOptionals);

      expect(capture.title).toBe('A title');
      expect(capture.sourceUrl).toBe('https://example.com');
      expect(capture.sourceApp).toBe('browser-extension');
    });
  });

  it('applies CaptureTrashed: status, trashedAt, clears snooze', () => {
    const next = applyCaptureEvent(current, {
      type: 'CaptureTrashed',
      id: 'capture-123',
      organizationId: 'org-123',
      trashedAt: '2025-01-16T10:00:00.000Z',
    });

    expect(next.status).toBe('trashed');
    expect(next.trashedAt).toBe('2025-01-16T10:00:00.000Z');
    expect(next.snoozedUntil).toBeUndefined();
    expect(next.content).toBe('Content');
  });

  it('applies CaptureRestored: inbox, clears trashedAt', () => {
    const trashed = applyCaptureEvent(current, {
      type: 'CaptureTrashed',
      id: 'capture-123',
      organizationId: 'org-123',
      trashedAt: '2025-01-16T10:00:00.000Z',
    });

    const next = applyCaptureEvent(trashed, {
      type: 'CaptureRestored',
      id: 'capture-123',
      organizationId: 'org-123',
    });

    expect(next.status).toBe('inbox');
    expect(next.trashedAt).toBeUndefined();
  });

  it('applies CaptureContentUpdated', () => {
    const next = applyCaptureEvent(current, {
      type: 'CaptureContentUpdated',
      id: 'capture-123',
      organizationId: 'org-123',
      content: 'Updated',
      title: 'New title',
    });

    expect(next.content).toBe('Updated');
    expect(next.title).toBe('New title');
  });

  it('applies CaptureSnoozed', () => {
    const next = applyCaptureEvent(current, {
      type: 'CaptureSnoozed',
      id: 'capture-123',
      organizationId: 'org-123',
      until: '2025-01-22T10:00:00.000Z',
    });

    expect(next.snoozedUntil).toBe('2025-01-22T10:00:00.000Z');
  });

  it('applies CaptureUnsnoozed', () => {
    const next = applyCaptureEvent(current, {
      type: 'CaptureUnsnoozed',
      id: 'capture-123',
      organizationId: 'org-123',
    });

    expect(next.snoozedUntil).toBeUndefined();
  });
});
