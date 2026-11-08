import { errAsync, type ResultAsync } from 'neverthrow';
import type { SnoozeCaptureCommand } from '../../domain/messages/capture-commands.js';
import type { SnoozeCaptureError } from '../../domain/messages/capture-errors.js';
import type { CaptureSnoozed } from '../../domain/messages/events.js';
import { decideSnoozeCapture } from '../../domain/decisions/decide-snooze.js';
import { applyCaptureEvent } from '../../domain/projections/apply-capture-event.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { loadOwnedCapture } from '../support/load-owned-capture.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';
import type { WriteResult } from '../support/write-result.js';

export const handleSnoozeCapture = (
  command: SnoozeCaptureCommand,
  deps: CaptureRuntime
): ResultAsync<WriteResult<CaptureSnoozed>, SnoozeCaptureError> => {
  return loadOwnedCapture({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const decision = decideSnoozeCapture({
      current,
      command,
      now: deps.now(),
    });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }
    const view = applyCaptureEvent(current, decision.value);
    const occurredAt = deps.now();
    return commitCapture(
      deps.uow,
      captureWork({
        result: { event: decision.value, view },
        plan: planFromCaptureEvent({ event: decision.value, view, deletedAt: occurredAt }),
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
