import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  title: z.string().min(1).max(500),
  captureId: z.string().uuid().optional(), // Source capture, if any
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD format
  completedAt: z.string().datetime().optional(),
  pinnedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), // null to clear
});

export type UpdateTask = z.infer<typeof UpdateTaskSchema>;

// Filter options for listing tasks
export const TaskFilterSchema = z.enum(['today', 'upcoming', 'all', 'completed']);
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
