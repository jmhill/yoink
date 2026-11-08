import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteCaptureCommand } from '../../domain/messages/capture-commands.js';
import type { DeleteCaptureError } from '../../domain/messages/capture-errors.js';
import type { CaptureDeleted } from '../../domain/messages/events.js';
import { decideDeleteCapture } from '../../domain/decisions/decide-delete.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { loadOwnedCapture } from '../support/load-owned-capture.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';

export const handleDeleteCapture = (
  command: DeleteCaptureCommand,
  deps: CaptureRuntime
): ResultAsync<CaptureDeleted, DeleteCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideDeleteCapture({ current, command });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }
    const occurredAt = deps.now();
    return commitCapture(
      deps.uow,
      captureWork({
        result: decision.value,
        plan: planFromCaptureEvent({ event: decision.value, view: null, deletedAt: occurredAt }),
        event: toCaptureIntegrationEvent({
          event: decision.value,
          id: deps.ids.generate(),
          occurredAt,
          actor: command.actor,
        }),
      })
    );
  });
};
