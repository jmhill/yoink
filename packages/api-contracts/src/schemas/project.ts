import { z } from 'zod';

export const PROJECT_OBJECTIVE_MAX_LENGTH = 2000;
export const PROJECT_WAITING_ON_MAX_LENGTH = 200;

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

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).optional(),
  status: ProjectStatusSchema,
  waitingOn: z.string().max(PROJECT_WAITING_ON_MAX_LENGTH).nullable(),
  waitingSince: z.string().date().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastChangedAt: z.string().datetime().nullable(),
  lastChangedBy: z.string().uuid().nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;

const ProjectNameSchema = z.string().trim().min(1).max(200);

export const CreateProjectSchema = z.object({
  name: ProjectNameSchema,
  objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).optional(),
});

export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    name: ProjectNameSchema.optional(),
    objective: z.string().max(PROJECT_OBJECTIVE_MAX_LENGTH).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.objective !== undefined, {
    message: 'Provide a name or objective',
  });

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
