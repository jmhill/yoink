import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ProjectTasksStatusSchema, HistoryPageSchema } from '../schemas/history.js';
import { ListPageQuerySchema, ProjectListPageSchema, TaskListPageSchema } from '../schemas/list-page.js';
import {
  AppliedImportSchema,
  ChangeProjectStatusResponseSchema,
  ChangeProjectStatusSchema,
  ConfirmProposedProjectSchema,
  CreateProjectSchema,
  DiscardedImportSchema,
  ProjectSchema,
  SetProjectNextActionResponseSchema,
  SetProjectNextActionSchema,
  StageImportSchema,
  StagedImportListSchema,
  StagedImportSchema,
  UpdateProjectSchema,
} from '../schemas/project.js';

/**
 * ts-rest parses query values with JSON.parse (`jsonQuery: true`).
 * `json` style is that parse-or-keep-string rule, so limits stay numbers
 * and status filters such as `proposed,declined` stay strings.
 */
const projectListQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
  createdById: 'json',
} as const;

const projectTasksQueryStyles = {
  limit: 'json',
  cursor: 'json',
  status: 'json',
} as const;

const historyQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const projectId = z.object({
  id: z.string().uuid(),
});

const projectListQuery = ListPageQuerySchema.extend({
  status: z.string().min(1).optional(),
  createdById: z.string().uuid().optional(),
});

const projectTasksQuery = ListPageQuerySchema.extend({
  status: ProjectTasksStatusSchema,
});

export const projectOrpcContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects',
        summary: "View this organization's projects",
        queryStyles: projectListQueryStyles,
      })
    )
    .input(projectListQuery)
    .output(ProjectListPageSchema),
  create: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects',
        successStatus: 201,
        summary: 'Create a project (person) or propose one with status proposed (bot)',
      })
    )
    .input(CreateProjectSchema)
    .output(ProjectSchema),
  stageImport: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/imports',
        successStatus: 201,
        summary: 'Stage a project-import batch after all-or-nothing validation (bots and people)',
      })
    )
    .input(StageImportSchema)
    .output(StagedImportSchema),
  listImports: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/imports',
        summary: 'List pending staged project imports in this organization',
      })
    )
    .input(z.object({}))
    .output(StagedImportListSchema),
  getImport: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/imports/{id}',
        summary: 'Read a staged import and its current preview',
      })
    )
    .input(projectId)
    .output(StagedImportSchema),
  applyImport: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/imports/{id}/apply',
        summary: 'Apply a pending staged import (person only)',
      })
    )
    .input(projectId)
    .output(AppliedImportSchema),
  discardImport: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/imports/{id}/discard',
        summary: 'Discard a pending staged import (person only)',
      })
    )
    .input(projectId)
    .output(DiscardedImportSchema),
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/{id}',
        summary: 'Read one project in this organization',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/api/projects/{id}',
        summary: "Edit a project's name, objective, or notebook pages",
      })
    )
    .input(projectId.and(UpdateProjectSchema))
    .output(ProjectSchema),
  listOpenTasks: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/{id}/tasks',
        summary:
          "List a project's open tasks (default) or finished tasks (?status=finished), newest first",
        queryStyles: projectTasksQueryStyles,
      })
    )
    .input(projectId.merge(projectTasksQuery))
    .output(TaskListPageSchema),
  listHistory: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/projects/{id}/history',
        summary: "Read a project's visible change-log timeline, newest first",
        queryStyles: historyQueryStyles,
      })
    )
    .input(projectId.merge(ListPageQuerySchema))
    .output(HistoryPageSchema),
  changeStatus: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/api/projects/{id}/status',
        summary: "Change a project's status, including waiting on / since",
      })
    )
    .input(projectId.merge(ChangeProjectStatusSchema))
    .output(ChangeProjectStatusResponseSchema),
  confirmProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/{id}/confirm',
        summary: 'Confirm a proposed project (person only)',
      })
    )
    .input(projectId.merge(ConfirmProposedProjectSchema))
    .output(SetProjectNextActionResponseSchema),
  declineProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/{id}/decline',
        summary: 'Turn down a proposed project (person only)',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  restoreProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/api/projects/{id}/restore',
        summary: 'Restore a declined proposal to proposed (person only)',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  setNextAction: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/api/projects/{id}/next-action',
        summary: "Set, replace, or clear a project's next action, or create a task and set it",
      })
    )
    .input(projectId.and(SetProjectNextActionSchema))
    .output(SetProjectNextActionResponseSchema),
});
