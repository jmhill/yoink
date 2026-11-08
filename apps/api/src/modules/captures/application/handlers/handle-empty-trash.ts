import type { ResultAsync } from 'neverthrow';
import type { EmptyTrashCommand } from '../../domain/messages/capture-commands.js';
import type { EmptyTrashError } from '../../domain/messages/capture-errors.js';
import type { CaptureTrashEmptied } from '../../domain/messages/events.js';
import { decideEmptyTrash } from '../../domain/decisions/decide-empty-trash.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';

export type EmptyTrashResult = {
  event: CaptureTrashEmptied;
  deletedCount: number;
};

export const handleEmptyTrash = (
  command: EmptyTrashCommand,
  deps: CaptureRuntime
): ResultAsync<EmptyTrashResult, EmptyTrashError> => {
  return deps.countTrashed(command.organizationId).andThen((deletedCount) => {
    const event = decideEmptyTrash({ command });
    const occurredAt = deps.now();
    return commitCapture(
      deps.uow,
      captureWork({
        result: { event, deletedCount },
        plan: planFromCaptureEvent({ event, view: null, deletedAt: occurredAt }),
        event: toCaptureIntegrationEvent({
          event,
          id: deps.ids.generate(),
          occurredAt,
          actor: command.actor,
          deletedCount,
        }),
      })
    );
  });
};
