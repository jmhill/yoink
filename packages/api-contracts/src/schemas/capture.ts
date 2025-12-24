import { z } from 'zod';

export const CaptureSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceApp: z.string().max(100).optional(),
  status: z.enum(['inbox', 'trashed']),
  capturedAt: z.string().datetime(),
  trashedAt: z.string().datetime().optional(),
  snoozedUntil: z.string().datetime().optional(),
});

export type Capture = z.infer<typeof CaptureSchema>;

export const CreateCaptureSchema = z.object({
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceApp: z.string().max(100).optional(),
});

export type CreateCapture = z.infer<typeof CreateCaptureSchema>;

// Content-only updates (title, content) - explicit operations handle status/pin/snooze
export const UpdateCaptureSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
});

export type UpdateCapture = z.infer<typeof UpdateCaptureSchema>;
