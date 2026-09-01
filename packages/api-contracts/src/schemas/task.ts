import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdById: z.string().uuid(),
  title: z.string().min(1).max(500),
  captureId: z.string().uuid().optional(), // Source capture, if any
  dueDate: z.string().date().optional(), // YYYY-MM-DD format, validates actual date
  completedAt: z.string().datetime().optional(),
  pinnedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  assigneeId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  // Position among open tasks in the current pile (that list, or unlisted).
  // Completed tasks keep this remembered index; they are not in the open sequence.
  openOrder: z.number().int().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  dueDate: z.string().date().optional(),
  assigneeId: z.string().uuid().optional(),
  // Optional single list bucket. New tasks are open; unknown/other-org lists are rejected in the write.
  listId: z.string().uuid().optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  dueDate: z.string().date().nullable().optional(), // null to clear
  assigneeId: z.string().uuid().nullable().optional(), // null to clear
  // Set, replace, or clear (null) the single list bucket. Omit to leave unchanged.
  listId: z.string().uuid().nullable().optional(),
});

export type UpdateTask = z.infer<typeof UpdateTaskSchema>;

// Filter options for listing tasks
export const TaskFilterSchema = z.enum(['today', 'upcoming', 'all', 'completed', 'mine']);
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
