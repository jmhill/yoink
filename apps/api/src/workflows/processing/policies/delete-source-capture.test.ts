import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { Actor } from '../../../kernel/auth-context.js';
import type { Work } from '../../../kernel/unit-of-work.js';
import { captureNotFoundError, storageError } from '../../../modules/captures/index.js';
import {
  deleteSourceCapturePolicy,
  type DeleteSourceCapture,
} from './delete-source-capture.js';

const deleteProcessed = (
  run: DeleteSourceCapture['prepare']['deleteProcessedCapture']
): DeleteSourceCapture => ({
  prepare: { deleteProcessedCapture: run },
});

const actor: Actor = { kind: 'user', userId: 'user-1', via: 'session' };

const taskDeleted = (source?: { kind: 'capture'; id: string }) => ({
  id: 'log-1',
  type: 'TaskDeleted',
  schemaVersion: 1,
  organizationId: 'org-1',
  occurredAt: '2026-11-10T12:00:00.000Z',
  actor,
  subject: { type: 'task', id: 'task-1' },
  payload: source === undefined ? { record: { kind: 'TaskDeleted' } } : { source },
});

const work: Work<unknown> = {
  result: null,
  events: [],
  step: { owner: 'captures', plan: { writes: [] } },
};

describe('deleteSourceCapturePolicy', () => {
  it('does nothing when the task has no source capture', async () => {
    let calls = 0;
    const policy = deleteSourceCapturePolicy(
      deleteProcessed(() => {
        calls += 1;
        return okAsync(work as Work<never>);
      })
    );

    const result = await policy.react(taskDeleted());
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
    expect(calls).toBe(0);
  });

  it('prepares a capture soft-delete for a source capture', async () => {
    const seen: unknown[] = [];
    const captures = deleteProcessed((input) => {
      seen.push(input);
      return okAsync(work as Work<never>);
    });
    const result = await deleteSourceCapturePolicy(captures).react(
      taskDeleted({ kind: 'capture', id: 'cap-1' })
    );

    expect(seen).toEqual([
      { captureId: 'cap-1', organizationId: 'org-1', actor },
    ]);
    expect(result._unsafeUnwrap()).toBe(work);
  });

  it('skips a capture that is already gone and refuses a storage failure', async () => {
    const missing = deleteSourceCapturePolicy(
      deleteProcessed(() => errAsync(captureNotFoundError('cap-1')))
    );
    const gone = await missing.react(taskDeleted({ kind: 'capture', id: 'cap-1' }));
    expect(gone._unsafeUnwrap()).toBeNull();

    const broken = deleteSourceCapturePolicy(
      deleteProcessed(() => errAsync(storageError('disk')))
    );
    const refused = await broken.react(taskDeleted({ kind: 'capture', id: 'cap-1' }));
    expect(refused._unsafeUnwrapErr()).toEqual({ kind: 'Refused', reason: 'capture-storage' });
  });
});
