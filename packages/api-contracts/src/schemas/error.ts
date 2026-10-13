import { z } from 'zod';

export const ErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof ErrorSchema>;

export const ProjectHasOpenTasksErrorSchema = ErrorSchema.extend({
  openTaskCount: z.number().int().nonnegative(),
});

export type ProjectHasOpenTasksError = z.infer<typeof ProjectHasOpenTasksErrorSchema>;

export const ImportEntryErrorSchema = z.object({
  index: z.number().int(),
  name: z.string(),
  field: z.string(),
  code: z.string(),
  message: z.string(),
  taskTitle: z.string().optional(),
});

export type ImportEntryError = z.infer<typeof ImportEntryErrorSchema>;

export const ImportInvalidErrorSchema = ErrorSchema.extend({
  code: z.literal('IMPORT_INVALID'),
  errors: z.array(ImportEntryErrorSchema),
});

export type ImportInvalidError = z.infer<typeof ImportInvalidErrorSchema>;

export const StaleNoteErrorSchema = ErrorSchema.extend({
  code: z.literal('STALE_NOTE'),
  currentVersion: z.string().min(1),
  updatedAt: z.string().datetime(),
  updatedById: z.string().uuid(),
  updatedByName: z.string(),
});

export type StaleNoteError = z.infer<typeof StaleNoteErrorSchema>;
