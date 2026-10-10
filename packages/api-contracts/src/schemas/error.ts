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
