import { z } from 'zod';

// Status enum for captures
// - inbox: capture is in the inbox, awaiting triage
// - trashed: capture has been moved to trash
// - processed: capture has been converted to a task or note
export const CaptureStatusSchema = z.enum(['inbox', 'trashed', 'processed']);
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

// Type of entity a capture was processed into
export const ProcessedToTypeSchema = z.enum(['task', 'note']);
export type ProcessedToType = z.infer<typeof ProcessedToTypeSchema>;

export const CaptureSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  content: z.string().min(1).max(10000),
  title: z.string().max(200).optional(),
  sourceUrl: z.string().url().optional(),
  sourceApp: z.string().max(100).optional(),
  status: CaptureStatusSchema,
  capturedAt: z.string().datetime(),
  trashedAt: z.string().datetime().optional(),
  snoozedUntil: z.string().datetime().optional(),
  // Processing fields - populated when capture is converted to task/note
  processedAt: z.string().datetime().optional(),
  processedToType: ProcessedToTypeSchema.optional(),
  processedToId: z.string().uuid().optional(),
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
