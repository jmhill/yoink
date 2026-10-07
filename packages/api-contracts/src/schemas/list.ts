import { z } from 'zod';

export const NamedListSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  createdById: z.string().uuid(),
});

export type NamedList = z.infer<typeof NamedListSchema>;

const NamedListNameSchema = z.string().trim().min(1).max(200);

export const CreateNamedListSchema = z.object({
  name: NamedListNameSchema,
});

export type CreateNamedList = z.infer<typeof CreateNamedListSchema>;

export const RenameNamedListSchema = z.object({
  name: NamedListNameSchema,
});

export type RenameNamedList = z.infer<typeof RenameNamedListSchema>;

export const ReorderOpenTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()),
});

export type ReorderOpenTasks = z.infer<typeof ReorderOpenTasksSchema>;
