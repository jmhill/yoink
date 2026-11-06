import { z } from 'zod';
import { CaptureSchema, CaptureStatusSchema } from './capture.js';
import { ListPageQuerySchema } from './list-page.js';
import { CreateProjectSchema, ProjectSchema } from './project.js';

// Request body for processing a capture into a task
// Using discriminated union to support future processing types (e.g., note)
export const ProcessCaptureToTaskSchema = z.object({
  type: z.literal('task'),
  data: z.object({
    title: z.string().min(1).max(500).optional(), // Defaults to capture content
    dueDate: z.string().date().optional(), // YYYY-MM-DD format, validates actual date
    // Optional single list bucket. Omit for unlisted — same as create-task.
    listId: z.string().uuid().optional(),
    // Optional project. Omit for no project — same as create-task.
    projectId: z.string().uuid().optional(),
  }),
});

export type ProcessCaptureToTask = z.infer<typeof ProcessCaptureToTaskSchema>;

// Currently only supports 'task', but designed for future extensibility
export const ProcessCaptureBodySchema = ProcessCaptureToTaskSchema;
// Future: z.discriminatedUnion('type', [ProcessCaptureToTaskSchema, ProcessCaptureToNoteSchema])

export type ProcessCaptureBody = z.infer<typeof ProcessCaptureBodySchema>;

export const ProcessCaptureToProjectSchema = CreateProjectSchema.omit({
  reason: true,
  suggestedNextAction: true,
}).extend({
  status: z.enum(['active', 'someday']),
});

export type ProcessCaptureToProject = z.infer<typeof ProcessCaptureToProjectSchema>;

export const ProcessCaptureToProjectResponseSchema = z.object({
  project: ProjectSchema,
  capture: CaptureSchema,
});

export type ProcessCaptureToProjectResponse = z.infer<
  typeof ProcessCaptureToProjectResponseSchema
>;

/** Query string for `GET /api/captures`. */
export const CaptureListQuerySchema = ListPageQuerySchema.extend({
  status: CaptureStatusSchema.optional(),
  snoozed: z.coerce.boolean().optional(), // true = only snoozed, false = exclude snoozed
});
