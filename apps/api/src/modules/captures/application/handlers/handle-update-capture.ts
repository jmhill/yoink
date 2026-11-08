import type { ResultAsync } from 'neverthrow';
import type { UpdateCaptureCommand } from '../../domain/messages/capture-commands.js';
import type { UpdateCaptureError } from '../../domain/messages/capture-errors.js';
import type { CaptureContentUpdated } from '../../domain/messages/events.js';
import { decideUpdateCapture } from '../../domain/decisions/decide-update.js';
import { applyCaptureEvent } from '../../domain/projections/apply-capture-event.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { loadOwnedCapture } from '../support/load-owned-capture.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';
import type { WriteResult } from '../support/write-result.js';

export const handleUpdateCapture = (
  command: UpdateCaptureCommand,
  deps: CaptureRuntime
): ResultAsync<WriteResult<CaptureContentUpdated>, UpdateCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const event = decideUpdateCapture({ current, command });
    const view = applyCaptureEvent(current, event);
    const occurredAt = deps.now();
    return commitCapture(
      deps.uow,
      captureWork({
        result: { event, view },
        plan: planFromCaptureEvent({ event, view, deletedAt: occurredAt }),
        event: toCaptureIntegrationEvent({
          event,
          id: deps.ids.generate(),
          occurredAt,
          actor: command.actor,
        }),
      })
    );
  });
};
