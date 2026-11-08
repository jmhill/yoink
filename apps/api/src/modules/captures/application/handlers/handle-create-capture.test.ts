import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Actor } from '../../../../kernel/auth-context.js';
import { createInMemoryUnitOfWork } from '../../../../platform/unit-of-work/in-memory-unit-of-work.js';
import { createFakeIdGenerator } from '@yoink/infrastructure';
import { handleCreateCapture } from './handle-create-capture.js';
import { createFakeCaptureParticipant } from '../../infrastructure/fakes/fake-capture-participant.js';
import { createFakeCaptureStore } from '../../infrastructure/fakes/fake-capture-store.js';

const actor: Actor = { kind: 'user', userId: 'user-456', via: 'session' };

const command = {
  content: 'My text',
  organizationId: 'org-123',
  createdById: 'user-456',
  actor,
};

describe('handleCreateCapture', () => {
  it('persists a CaptureCreated fact and returns the projected capture', async () => {
    const store = createFakeCaptureStore();
    const result = await handleCreateCapture(command, {
      load: (id) => store.findById(id),
      list: (options) => store.findByOrganization(options),
      countTrashed: (organizationId) => okAsync(store.countTrashed(organizationId)),
      uow: createInMemoryUnitOfWork({
        participants: [createFakeCaptureParticipant(store)],
      }),
      ids: createFakeIdGenerator(['capture-id-1']),
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
    const stored = await store.findById('capture-id-1');
    expect(stored.isOk() && stored.value?.content).toBe('My text');
  });

  it('returns storage error when persist fails', async () => {
    const store = createFakeCaptureStore({ shouldFailOnSave: true });
    const result = await handleCreateCapture(command, {
      load: (id) => store.findById(id),
      list: (options) => store.findByOrganization(options),
      countTrashed: (organizationId) => okAsync(store.countTrashed(organizationId)),
      uow: createInMemoryUnitOfWork({
        participants: [createFakeCaptureParticipant(store)],
      }),
      ids: createFakeIdGenerator(['capture-id-1']),
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
