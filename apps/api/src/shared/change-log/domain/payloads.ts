import { z } from 'zod';

const orderEntrySchema = z.object({
  id: z.string().min(1),
  openOrder: z.number().int(),
});

export const taskCreatedPayloadV1Schema = z.object({
  title: z.string(),
  dueDate: z.string().optional(),
  captureId: z.string().optional(),
  assigneeId: z.string().optional(),
  listId: z.string().optional(),
  projectId: z.string().optional(),
  openOrder: z.number().int(),
  createdById: z.string(),
});

export const taskUpdatedPayloadV1Schema = z.object({
  title: z.string().optional(),
  /** Optional, backward-compatible addition to v1. Older records lack it. */
  previousTitle: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  listId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  openOrder: z.number().int().optional(),
});

export const taskCompletedPayloadV1Schema = z.object({
  completedAt: z.string().datetime(),
});

export const taskUncompletedPayloadV1Schema = z.object({
  openOrder: z.number().int(),
});

export const taskDeletedPayloadV1Schema = z.object({
  captureId: z.string().optional(),
});

export const taskPinnedPayloadV1Schema = z.object({
  pinnedAt: z.string().datetime(),
});

export const taskUnpinnedPayloadV1Schema = z.object({});

export const openTasksReorderedPayloadV1Schema = z.object({
  listId: z.string().nullable(),
  orders: z.array(orderEntrySchema),
});

export const openTasksRenumberedPayloadV1Schema = z.object({
  listId: z.string().nullable(),
  orders: z.array(orderEntrySchema),
});

export const namedListCreatedPayloadV1Schema = z.object({
  name: z.string(),
  createdById: z.string(),
});

export const namedListRenamedPayloadV1Schema = z.object({
  name: z.string(),
});

export const namedListDeletedPayloadV1Schema = z.object({});

export const projectCreatedPayloadV1Schema = z.object({
  name: z.string(),
  objective: z.string().optional(),
  status: z.literal('active'),
  createdById: z.string(),
});

export const projectUpdatedPayloadV1Schema = z.object({
  name: z.string().optional(),
  objective: z.string().nullable().optional(),
});

export const projectStatusChangedPayloadV1Schema = z.object({
  from: z.enum(['active', 'waiting', 'someday', 'done', 'proposed']),
  to: z.enum(['active', 'waiting', 'someday', 'done']),
  waitingOn: z.string().nullable().optional(),
  waitingSince: z.string().nullable().optional(),
});

export const projectWaitingChangedPayloadV1Schema = z.object({
  waitingOn: z.string(),
  waitingSince: z.string().nullable(),
});

export const projectNextActionSetPayloadV1Schema = z.object({
  taskId: z.string(),
  previousTaskId: z.string().nullable(),
});

export const projectNextActionClearedPayloadV1Schema = z.object({
  taskId: z.string(),
  reason: z.enum(['cleared', 'completed', 'deleted', 'removedFromProject', 'projectDone']),
});

export const taskAddedToProjectPayloadV1Schema = z.object({
  projectId: z.string(),
});

export const taskRemovedFromProjectPayloadV1Schema = z.object({
  projectId: z.string(),
  /** Optional; present when the task moved to another project. Older records lack it. */
  toProjectId: z.string().optional(),
  /** Destination name at write time. Older move records may have only toProjectId. */
  toProjectName: z.string().optional(),
});

export const projectImportedPayloadV1Schema = z.object({
  taskCount: z.number().int().min(0),
});

export type TaskCreatedPayloadV1 = z.infer<typeof taskCreatedPayloadV1Schema>;
export type TaskUpdatedPayloadV1 = z.infer<typeof taskUpdatedPayloadV1Schema>;
export type TaskCompletedPayloadV1 = z.infer<typeof taskCompletedPayloadV1Schema>;
export type TaskUncompletedPayloadV1 = z.infer<typeof taskUncompletedPayloadV1Schema>;
export type TaskDeletedPayloadV1 = z.infer<typeof taskDeletedPayloadV1Schema>;
export type TaskPinnedPayloadV1 = z.infer<typeof taskPinnedPayloadV1Schema>;
export type TaskUnpinnedPayloadV1 = z.infer<typeof taskUnpinnedPayloadV1Schema>;
export type OpenTasksReorderedPayloadV1 = z.infer<
  typeof openTasksReorderedPayloadV1Schema
>;
export type OpenTasksRenumberedPayloadV1 = z.infer<
  typeof openTasksRenumberedPayloadV1Schema
>;
export type NamedListCreatedPayloadV1 = z.infer<typeof namedListCreatedPayloadV1Schema>;
export type NamedListRenamedPayloadV1 = z.infer<typeof namedListRenamedPayloadV1Schema>;
export type NamedListDeletedPayloadV1 = z.infer<typeof namedListDeletedPayloadV1Schema>;
export type ProjectCreatedPayloadV1 = z.infer<typeof projectCreatedPayloadV1Schema>;
export type ProjectUpdatedPayloadV1 = z.infer<typeof projectUpdatedPayloadV1Schema>;
export type ProjectStatusChangedPayloadV1 = z.infer<
  typeof projectStatusChangedPayloadV1Schema
>;
export type ProjectWaitingChangedPayloadV1 = z.infer<
  typeof projectWaitingChangedPayloadV1Schema
>;
export type ProjectNextActionSetPayloadV1 = z.infer<
  typeof projectNextActionSetPayloadV1Schema
>;
export type ProjectNextActionClearedPayloadV1 = z.infer<
  typeof projectNextActionClearedPayloadV1Schema
>;
export type TaskAddedToProjectPayloadV1 = z.infer<typeof taskAddedToProjectPayloadV1Schema>;
export type TaskRemovedFromProjectPayloadV1 = z.infer<
  typeof taskRemovedFromProjectPayloadV1Schema
>;
export type ProjectImportedPayloadV1 = z.infer<typeof projectImportedPayloadV1Schema>;
