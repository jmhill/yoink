import type { CreateCaptureCommand } from './capture-commands.js';
import type { CaptureCreated } from './events.js';

export type DecideCreateCaptureInput = {
  command: CreateCaptureCommand;
  id: string;
  now: string;
};

export const decideCreateCapture = ({
  command,
  id,
  now,
}: DecideCreateCaptureInput): CaptureCreated => ({
  type: 'CaptureCreated',
  id,
  organizationId: command.organizationId,
  createdById: command.createdById,
  content: command.content,
  title: command.title,
  sourceUrl: command.sourceUrl,
  sourceApp: command.sourceApp,
  capturedAt: now,
});
