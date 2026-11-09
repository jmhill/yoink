import type { Capture } from '../model/capture.js';
import type { UpdateCaptureCommand } from '../messages/capture-commands.js';
import type { CaptureContentUpdated } from '../messages/events.js';

export type DecideUpdateCaptureInput = {
  current: Capture;
  command: UpdateCaptureCommand;
};

export const decideUpdateCapture = ({
  command,
}: DecideUpdateCaptureInput): CaptureContentUpdated => ({
  type: 'CaptureContentUpdated',
  id: command.id,
  organizationId: command.organizationId,
  title: command.title,
  content: command.content,
});
