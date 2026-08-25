import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateCapture } from './handle-create-capture.js';
import type { PersistCaptureEvent } from './ports.js';
import { storageError } from '../domain/capture-errors.js';
import type { CaptureEvent } from '../domain/events.js';

const createInMemoryPersist = (): {
  persist: PersistCaptureEvent;
  events: CaptureEvent[];
} => {
  const events: CaptureEvent[] = [];
  return {
    events,
    persist: ({ event }) => {
      events.push(event);
      return okAsync({});
    },
  };
};

describe('handleCreateCapture', () => {
  const command = {
    content: 'My text',
    organizationId: 'org-123',
    createdById: 'user-456',
  };

  it('persists a CaptureCreated fact and returns the projected capture', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateCapture(command, {
      persist,
      nextId: () => 'capture-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'CaptureCreated',
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });
      expect(result.value.view).toEqual({
        id: 'capture-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        content: 'My text',
        status: 'inbox',
        capturedAt: '2025-01-15T10:00:00.000Z',
      });
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('CaptureCreated');
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistCaptureEvent = () => errAsync(storageError('Save failed'));

    const result = await handleCreateCapture(command, {
      persist,
      nextId: () => 'capture-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
