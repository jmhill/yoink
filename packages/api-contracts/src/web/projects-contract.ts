import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';
import {
  AppliedImportSchema,
  ChangeProjectStatusResponseSchema,
  ChangeProjectStatusSchema,
  ConfirmProposedProjectSchema,
  DiscardedImportSchema,
  ProjectSchema,
  SetProjectNextActionResponseSchema,
  SetProjectNextActionSchema,
  StagedImportListSchema,
  StagedImportSchema,
  UpdateProjectSchema,
} from '../schemas/project.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const projectTasksQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const projectId = z.object({
  id: z.string().uuid(),
});

/**
 * Project page and staged import. Paths are the resource after `/web-api`.
 * Open tasks are the default list. Finished tasks, history, and notes stay
 * on `/api`. Create and the shared project catalog stay there too.
 * The same procedures stay on `/api` and `/api/v1`.
 */
export const webProjectsContract = oc.router({
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/{id}',
        summary: 'Read one project in this organization',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  listOpenTasks: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/{id}/tasks',
        summary: "List a project's open tasks, newest first",
        queryStyles: projectTasksQueryStyles,
      })
    )
    .input(projectId.merge(ListPageQuerySchema))
    .output(TaskListPageSchema),
  update: oc
    .meta(
      openapi({
        method: 'PATCH',
        path: '/projects/{id}',
        summary: "Edit a project's name, objective, or notebook pages",
      })
    )
    .input(projectId.and(UpdateProjectSchema))
    .output(ProjectSchema),
  changeStatus: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/projects/{id}/status',
        summary: "Change a project's status, including waiting on / since",
      })
    )
    .input(projectId.merge(ChangeProjectStatusSchema))
    .output(ChangeProjectStatusResponseSchema),
  setNextAction: oc
    .meta(
      openapi({
        method: 'PUT',
        path: '/projects/{id}/next-action',
        summary: "Set, replace, or clear a project's next action, or create a task and set it",
      })
    )
    .input(projectId.and(SetProjectNextActionSchema))
    .output(SetProjectNextActionResponseSchema),
  confirmProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/{id}/confirm',
        summary: 'Confirm a proposed project (person only)',
      })
    )
    .input(projectId.merge(ConfirmProposedProjectSchema))
    .output(SetProjectNextActionResponseSchema),
  declineProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/{id}/decline',
        summary: 'Turn down a proposed project (person only)',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  restoreProposal: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/{id}/restore',
        summary: 'Restore a declined proposal to proposed (person only)',
      })
    )
    .input(projectId)
    .output(ProjectSchema),
  listImports: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/imports',
        summary: 'List pending staged project imports in this organization',
      })
    )
    .input(z.object({}))
    .output(StagedImportListSchema),
  getImport: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/projects/imports/{id}',
        summary: 'Read a staged import and its current preview',
      })
    )
    .input(projectId)
    .output(StagedImportSchema),
  applyImport: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/imports/{id}/apply',
        summary: 'Apply a pending staged import (person only)',
      })
    )
    .input(projectId)
    .output(AppliedImportSchema),
  discardImport: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/projects/imports/{id}/discard',
        summary: 'Discard a pending staged import (person only)',
      })
    )
    .input(projectId)
    .output(DiscardedImportSchema),
});
