import type { ResultAsync } from 'neverthrow';
import type { CreateCaptureCommand } from '../../domain/messages/capture-commands.js';
import type { CaptureCreated } from '../../domain/messages/events.js';
import type { CreateCaptureError } from '../../domain/messages/capture-errors.js';
import { decideCreateCapture } from '../../domain/decisions/decide-create.js';
import { applyCaptureEvent } from '../../domain/projections/apply-capture-event.js';
import { planFromCaptureEvent } from '../../domain/projections/plan-capture.js';
import { toCaptureIntegrationEvent } from '../integration-events/to-capture-integration-event.js';
import type { CaptureRuntime } from '../ports.js';
import { captureWork, commitCapture } from '../support/commit-capture.js';
import type { WriteResult } from '../support/write-result.js';

export const handleCreateCapture = (
  command: CreateCaptureCommand,
  deps: CaptureRuntime
): ResultAsync<WriteResult<CaptureCreated>, CreateCaptureError> => {
  const event = decideCreateCapture({
    command,
    id: deps.ids.generate(),
    now: deps.now(),
  });
  const view = applyCaptureEvent(null, event);
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
};
