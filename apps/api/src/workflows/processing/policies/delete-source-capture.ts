import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Policy, PolicyRefusal, Work } from '../../../kernel/unit-of-work.js';
import type { Captures } from '../../../modules/captures/index.js';

/** The policy reads only the source capture. The rest of the event stays unread. */
export type DeleteSourceCapture = {
  prepare: {
    deleteProcessedCapture: Captures['prepare']['deleteProcessedCapture'];
  };
};

const captureSourceId = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null || !('source' in payload)) {
    return null;
  }
  const source = payload.source;
  if (typeof source !== 'object' || source === null) {
    return null;
  }
  if (!('kind' in source) || source.kind !== 'capture') {
    return null;
  }
  if (!('id' in source) || typeof source.id !== 'string' || source.id.length === 0) {
    return null;
  }
  return source.id;
};

/**
 * Same-transaction. A task deleted with a source capture soft-deletes that
 * capture in the same commit. A missing capture does not refuse the delete.
 */
const skip = (): ResultAsync<Work<unknown> | null, PolicyRefusal> => okAsync(null);

const refused: PolicyRefusal = { kind: 'Refused', reason: 'capture-storage' };

export const deleteSourceCapturePolicy = (captures: DeleteSourceCapture): Policy => ({
  on: 'TaskDeleted',
  react: (event) => {
    const captureId = captureSourceId(event.payload);
    if (captureId === null) {
      return skip();
    }
    return captures.prepare
      .deleteProcessedCapture({
        captureId,
        organizationId: event.organizationId,
        actor: event.actor,
      })
      .map((work) => work)
      .orElse((error) => (error.type === 'CAPTURE_NOT_FOUND' ? skip() : errAsync(refused)));
  },
});
