import { z } from 'zod';
import { ListPageMetaSchema } from './list-page.js';

/**
 * Story 2 (#155) shipped Oct 10, 2026 at 8:56 AM CT (CDT, UTC−5).
 * Shared by API and web so the timeline and the docs stay aligned.
 */
export const HISTORY_STARTS_AT = '2026-10-10T13:56:00.000Z';

export const TimelineActorKindSchema = z.enum(['user', 'bot']);

export const TimelineActorSchema = z.object({
  userId: z.string().nullable(),
  kind: TimelineActorKindSchema.nullable(),
  name: z.string().nullable(),
});

export type TimelineActor = z.infer<typeof TimelineActorSchema>;

export const TimelineSubjectTypeSchema = z.enum(['task', 'project']);

export const TimelineSubjectSchema = z.object({
  type: TimelineSubjectTypeSchema,
  id: z.string(),
  title: z.string().nullable(),
  deleted: z.boolean(),
});

export type TimelineSubject = z.infer<typeof TimelineSubjectSchema>;

const projectStatusSchema = z.enum(['active', 'waiting', 'someday', 'done']);
const projectStatusFromSchema = z.enum(['active', 'waiting', 'someday', 'done', 'proposed']);

export const TimelineDetailsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('Unknown') }),
  z.object({
    kind: z.literal('TaskCreated'),
    via: z.literal('import').optional(),
    projectName: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('TaskUpdated'),
    title: z.string().optional(),
    /** Optional, backward-compatible addition to v1. Older records lack it. */
    previousTitle: z.string().optional(),
    dueDate: z.string().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    listId: z.string().nullable().optional(),
  }),
  z.object({ kind: z.literal('TaskCompleted') }),
  z.object({ kind: z.literal('TaskUncompleted') }),
  z.object({ kind: z.literal('TaskDeleted') }),
  z.object({
    kind: z.literal('ProjectCreated'),
    name: z.string(),
    objective: z.string().optional(),
    captureId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('ProjectUpdated'),
    name: z.string().optional(),
    objective: z.string().nullable().optional(),
    notebookPages: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('ProjectStatusChanged'),
    from: projectStatusFromSchema,
    to: projectStatusSchema,
    waitingOn: z.string().nullable().optional(),
    waitingSince: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('ProjectWaitingChanged'),
    waitingOn: z.string(),
    waitingSince: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('ProjectNextActionSet'),
    taskId: z.string(),
    taskTitle: z.string().nullable(),
    previousTaskId: z.string().nullable(),
    previousTaskTitle: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('ProjectNextActionCleared'),
    taskId: z.string(),
    taskTitle: z.string().nullable(),
    reason: z.enum(['cleared', 'completed', 'deleted', 'removedFromProject', 'projectDone']),
  }),
  z.object({
    kind: z.literal('TaskAddedToProject'),
    projectId: z.string(),
    projectName: z.string().nullable().optional(),
    via: z.literal('import').optional(),
  }),
  z.object({
    kind: z.literal('TaskRemovedFromProject'),
    projectId: z.string(),
    toProjectName: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('ProjectImported'),
    taskCount: z.number().int().min(0),
  }),
]);

export type TimelineDetails = z.infer<typeof TimelineDetailsSchema>;

export const TimelineEntryKindSchema = z.enum([
  'Unknown',
  'TaskCreated',
  'TaskUpdated',
  'TaskCompleted',
  'TaskUncompleted',
  'TaskDeleted',
  'ProjectCreated',
  'ProjectUpdated',
  'ProjectStatusChanged',
  'ProjectWaitingChanged',
  'ProjectNextActionSet',
  'ProjectNextActionCleared',
  'TaskAddedToProject',
  'TaskRemovedFromProject',
  'ProjectImported',
]);

export type TimelineEntryKind = z.infer<typeof TimelineEntryKindSchema>;

export const TimelineEntrySchema = z.object({
  id: z.string(),
  kind: TimelineEntryKindSchema,
  occurredAt: z.string().datetime(),
  actor: TimelineActorSchema,
  subject: TimelineSubjectSchema,
  details: TimelineDetailsSchema,
});

export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const HistoryPageSchema = ListPageMetaSchema.extend({
  entries: z.array(TimelineEntrySchema),
  historyStartsAt: z.string(),
});

export type HistoryPage = z.infer<typeof HistoryPageSchema>;

export const ProjectTasksStatusSchema = z.enum(['open', 'finished']).optional();

export type ProjectTasksStatus = z.infer<typeof ProjectTasksStatusSchema>;
