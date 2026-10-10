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
  openOrder: z.number().int(),
  createdById: z.string(),
});

export const taskUpdatedPayloadV1Schema = z.object({
  title: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  listId: z.string().nullable().optional(),
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
