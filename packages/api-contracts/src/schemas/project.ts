import { z } from 'zod';
import { ImportEntryErrorSchema } from './error.js';

export const PROJECT_NAME_MAX_LENGTH = 200;
export const PROJECT_OBJECTIVE_MAX_LENGTH = 2000;
export const PROJECT_WAITING_ON_MAX_LENGTH = 200;
export const NOTEBOOK_PAGE_PATH_MAX_LENGTH = 500;
export const NOTEBOOK_PAGES_MAX = 20;
export const IMPORT_PROJECTS_MAX = 50;
export const IMPORT_TASKS_MAX = 200;

export const ProjectStatusSchema = z.enum([
  'active',
  'waiting',
  'someday',
  'done',
  'proposed',
]);

export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const AssignableProjectStatusSchema = z.enum([
  'active',
  'waiting',
  'someday',
  'done',
]);

export type AssignableProjectStatus = z.infer<typeof AssignableProjectStatusSchema>;

export const NotebookPageSchema = z.object({
  path: z.string().min(1).max(NOTEBOOK_PAGE_PATH_MAX_LENGTH),
  url: z.string().min(1),
});

export type NotebookPage = z.infer<typeof NotebookPageSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(PROJECT_NAME_MAX_LENGTH),
  objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).optional(),
  status: ProjectStatusSchema,
  waitingOn: z.string().max(PROJECT_WAITING_ON_MAX_LENGTH).nullable(),
  waitingSince: z.string().date().nullable(),
  nextActionTaskId: z.string().uuid().nullable(),
  notebookPages: z.array(NotebookPageSchema),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastChangedAt: z.string().datetime().nullable(),
  lastChangedBy: z.string().uuid().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;

const ProjectNameSchema = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

export const CreateProjectSchema = z.object({
  name: ProjectNameSchema,
  objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).optional(),
});

export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    name: ProjectNameSchema.optional(),
    objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).nullable().optional(),
    notebookPages: z.array(z.string()).max(NOTEBOOK_PAGES_MAX).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.objective !== undefined ||
      body.notebookPages !== undefined,
    {
      message: 'Provide a name, objective, or notebook pages',
    }
  );

export type UpdateProject = z.infer<typeof UpdateProjectSchema>;

export const ChangeProjectStatusSchema = z.object({
  status: AssignableProjectStatusSchema,
  waitingOn: z.string().max(PROJECT_WAITING_ON_MAX_LENGTH).nullable().optional(),
  waitingSince: z.string().date().nullable().optional(),
  openTasks: z.enum(['complete', 'remove']).optional(),
});

export type ChangeProjectStatus = z.infer<typeof ChangeProjectStatusSchema>;

export const ChangeProjectStatusResponseSchema = z.object({
  project: ProjectSchema,
  completedTaskCount: z.number().int().nonnegative(),
  removedTaskCount: z.number().int().nonnegative(),
});

export type ChangeProjectStatusResponse = z.infer<typeof ChangeProjectStatusResponseSchema>;

const NewNextActionTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  dueDate: z.string().date().optional(),
  assigneeId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
});

export const SetProjectNextActionSchema = z.union([
  z.object({ taskId: z.string().uuid() }),
  z.object({ taskId: z.null() }),
  z.object({ newTask: NewNextActionTaskSchema }),
]);

export type SetProjectNextAction = z.infer<typeof SetProjectNextActionSchema>;

export const SetProjectNextActionResponseSchema = z.object({
  project: ProjectSchema,
  task: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
    })
    .optional(),
});

export type SetProjectNextActionResponse = z.infer<typeof SetProjectNextActionResponseSchema>;

export const ImportNewTaskSchema = z.object({
  key: z.string().min(1),
  title: z.string(),
  dueDate: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
});

export type ImportNewTask = z.infer<typeof ImportNewTaskSchema>;

export const ImportNextActionSchema = z.union([
  z.object({ existingTaskId: z.string().uuid() }),
  z.object({ newTaskKey: z.string().min(1) }),
]);

export type ImportNextAction = z.infer<typeof ImportNextActionSchema>;

export const ImportProjectSchema = z.object({
  name: z.string(),
  objective: z.string().optional(),
  status: z.enum(['active', 'waiting', 'someday', 'done', 'proposed']),
  waitingOn: z.string().optional(),
  waitingSince: z.string().nullable().optional(),
  notebookPages: z.array(z.string()).optional(),
  existingTaskIds: z.array(z.string().uuid()).optional(),
  newTasks: z.array(ImportNewTaskSchema).optional(),
  nextAction: ImportNextActionSchema.nullable().optional(),
});

export type ImportProject = z.infer<typeof ImportProjectSchema>;

export const StageImportSchema = z.object({
  projects: z.array(ImportProjectSchema).min(1).max(IMPORT_PROJECTS_MAX),
});

export type StageImport = z.infer<typeof StageImportSchema>;

export const ImportPreviewWarningSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});

export type ImportPreviewWarning = z.infer<typeof ImportPreviewWarningSchema>;

export const ImportPreviewTaskSchema = z.object({
  title: z.string(),
  source: z.enum(['existing', 'new']),
  dueDate: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
});

export type ImportPreviewTask = z.infer<typeof ImportPreviewTaskSchema>;

export const ImportPreviewProjectSchema = z.object({
  name: z.string(),
  objective: z.string().optional(),
  status: z.enum(['active', 'waiting', 'someday']),
  waitingOn: z.string().nullable().optional(),
  waitingSince: z.string().nullable().optional(),
  nextActionTitle: z.string().nullable(),
  tasks: z.array(ImportPreviewTaskSchema),
  notebookPages: z.array(NotebookPageSchema),
  warnings: z.array(ImportPreviewWarningSchema),
});

export type ImportPreviewProject = z.infer<typeof ImportPreviewProjectSchema>;

export const ImportPreviewTotalsSchema = z.object({
  projectCount: z.number().int().nonnegative(),
  existingTaskCount: z.number().int().nonnegative(),
  newTaskCount: z.number().int().nonnegative(),
  projectsWithNoNextAction: z.number().int().nonnegative(),
});

export type ImportPreviewTotals = z.infer<typeof ImportPreviewTotalsSchema>;

export const ImportPreviewSchema = z.object({
  projects: z.array(ImportPreviewProjectSchema),
  totals: ImportPreviewTotalsSchema,
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const StagedImportStatusSchema = z.enum(['pending', 'applied', 'discarded']);

export type StagedImportStatus = z.infer<typeof StagedImportStatusSchema>;

export const StagedImportSchema = z.object({
  id: z.string().uuid(),
  status: StagedImportStatusSchema,
  createdById: z.string().uuid(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  decidedById: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  preview: ImportPreviewSchema.nullable(),
  errors: z.array(ImportEntryErrorSchema),
});

export type StagedImport = z.infer<typeof StagedImportSchema>;

export const StagedImportListSchema = z.object({
  imports: z.array(StagedImportSchema),
});

export type StagedImportList = z.infer<typeof StagedImportListSchema>;

export const AppliedImportSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('applied'),
  preview: ImportPreviewSchema,
  projects: z.array(ProjectSchema),
});

export type AppliedImport = z.infer<typeof AppliedImportSchema>;

export const DiscardedImportSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('discarded'),
  decidedById: z.string().uuid(),
  decidedAt: z.string().datetime(),
});

export type DiscardedImport = z.infer<typeof DiscardedImportSchema>;
