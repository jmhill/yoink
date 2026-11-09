import { okAsync, type ResultAsync } from 'neverthrow';
import type { RestoreCaptureCommand } from '../../domain/messages/capture-commands.js';
import type { RestoreCaptureError } from '../../domain/messages/capture-errors.js';
import type { CaptureRestored } from '../../domain/messages/events.js';
import { decideRestoreCapture } from '../../domain/decisions/decide-restore.js';
import { applyCaptureEvent } from '../../domain/projections/apply-capture-event.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { loadOwnedCapture } from '../support/load-owned-capture.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';
import type { WriteResult } from '../support/write-result.js';

export const handleRestoreCapture = (
  command: RestoreCaptureCommand,
  deps: CaptureRuntime
): ResultAsync<WriteResult<CaptureRestored>, RestoreCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideRestoreCapture({ current, command });
    if (decision.type === 'Noop') {
      return okAsync({ event: null, view: current });
    }
    const view = applyCaptureEvent(current, decision);
    const occurredAt = deps.now();
    return commitCapture(
      deps.uow,
      captureWork({
        result: { event: decision, view },
        plan: planFromCaptureEvent({ event: decision, view, deletedAt: occurredAt }),
        event: toCaptureIntegrationEvent({
          event: decision,
          id: deps.ids.generate(),
          occurredAt,
          actor: command.actor,
        }),
      })
    );
  });
};
