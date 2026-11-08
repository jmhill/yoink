import { type ResultAsync } from 'neverthrow';
import type { UnitOfWork, Work } from '../../../../kernel/unit-of-work.js';
import { storageError, type StorageError } from '../../domain/messages/capture-errors.js';
import type { CapturePlan } from '../../domain/projections/plan-capture.js';
import type { CaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';

export const captureWork = <T>(input: {
  result: T;
  plan: CapturePlan;
  event: CaptureIntegrationEvent;
}): Work<T> => ({
  result: input.result,
  events: [input.event],
  step: { owner: 'captures', plan: input.plan },
});

/** Prepare already decided. Commit writes the plan and, through the sink, the event. */
export const commitCapture = <T>(
  uow: UnitOfWork,
  work: Work<T>
): ResultAsync<T, StorageError> =>
  uow.commit([work]).map(() => work.result).mapErr((failure) => storageError(failure.reason));
