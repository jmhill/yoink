import type {
  Actor,
  AnonymousActor,
  AppliedImport,
  Capture,
  DiscardedImport,
  ImportProject,
  NamedList,
  Note,
  NoteListPage,
  NoteChangePage,
  Project,
  StagedImport,
  Task,
  NowOwner,
  NowQuery,
  NowNextActionsPage,
  ReviewPage,
  ReviewQuery,
  DoneListPage,
  DoneListQuery,
  TaskListPage,
  WorkListsPage,
  NowNextActionRow,
  NowDueRow,
  NowListRow,
  Token,
  CreateTokenResult,
  PasskeyCredentialInfo,
  CreateCaptureInput,
  UpdateCaptureInput,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
  ProcessCaptureToProjectInput,
  ProcessCaptureToProjectResult,
  MintedAgent,
  Member,
  CreateProjectInput,
  ListProjectsQuery,
  ConfirmProjectProposalInput,
  ConfirmProjectProposalResult,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ImportInvalidError,
  UnsupportedOperationError,
  ConflictError,
  StaleNoteError,
  NoteSyncConflictError,
  ForbiddenError,
  CannotDeleteLastPasskeyError,
  TokenLimitReachedError,
} from '../../dsl/index.js';
import type { HttpClient } from './http-client.js';

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * HTTP implementation of the Actor interface.
 * All requests are authenticated with the provided token.
 */
export type HttpActorOptions = {
  /**
   * HTTP actors authenticate with a person's API token (user actor, via token).
   * Minting is web-session only, so the HTTP driver provisions agents through
   * admin for tenant-admin actors. Personal and agent tokens both get 403 on
   * POST /agents.
   */
  provisionAgent?: (name: string) => Promise<MintedAgent>;
};

export const createHttpActor = (
  client: HttpClient,
  credentials: ActorCredentials,
  options: HttpActorOptions = {}
): Actor => {
  const authHeaders = () => ({
    authorization: `Bearer ${credentials.token}`,
  });

  const handleCaptureResponse = (
    response: { statusCode: number; body: string; json: <T>() => T },
    captureId?: string
  ): Capture => {
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404 && captureId) {
      throw new NotFoundError('Capture', captureId);
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    return response.json<Capture>();
  };

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      const response = await client.post('/api/captures', input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Agents cannot create captures');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create capture: ${response.body}`);
      }
      return response.json<Capture>();
    },

    async listCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=inbox&snoozed=false', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async listTrashedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=trashed', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async getCapture(id: string): Promise<Capture> {
      const response = await client.get(`/api/captures/${id}`, authHeaders());
      return handleCaptureResponse(response, id);
    },

    async updateCapture(
      id: string,
      input: UpdateCaptureInput
    ): Promise<Capture> {
      const response = await client.patch(
        `/api/captures/${id}`,
        input,
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async trashCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/trash`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async restoreCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/restore`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/snooze`,
        { until },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/unsnooze`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=inbox&snoozed=true', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async deleteCapture(id: string): Promise<void> {
      const response = await client.delete(`/api/captures/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Capture', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Capture must be in trash before deletion');
      }
      // 204 No Content is success
    },

    async emptyTrash(): Promise<{ deletedCount: number }> {
      const response = await client.post('/api/captures/trash/empty', {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ deletedCount: number }>();
    },

    // Process capture to task
    async processCaptureToTask(captureId: string, input?: ProcessCaptureToTaskInput): Promise<Task> {
      const response = await client.post(
        `/api/captures/${captureId}/process`,
        { type: 'task', data: input ?? {} },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Capture', captureId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to process capture: ${response.body}`);
      }
      return response.json<Task>();
    },

    async processCaptureToProject(
      captureId: string,
      input: ProcessCaptureToProjectInput
    ): Promise<ProcessCaptureToProjectResult> {
      const response = await client.post(
        `/api/captures/${captureId}/process-to-project`,
        input,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        const error = response.json<{ message?: string }>();
        throw new ForbiddenError(error.message ?? 'Creating a project requires a person');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Capture', captureId);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Capture must be in the inbox');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to process capture to project: ${response.body}`);
      }
      return response.json<ProcessCaptureToProjectResult>();
    },

    async listNamedLists(): Promise<NamedList[]> {
      const response = await client.get('/api/lists', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list named lists: ${response.body}`);
      }
      return response.json<{ lists: NamedList[] }>().lists;
    },

    async createProject(input: CreateProjectInput): Promise<Project> {
      const response = await client.post('/api/projects', input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Creating a project requires a person');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A project with this name already exists');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create project: ${response.body}`);
      }
      return response.json<Project>();
    },

    async listProjects(query?: ListProjectsQuery): Promise<Project[]> {
      const params = new URLSearchParams();
      if (query?.status !== undefined) {
        params.set('status', query.status);
      }
      if (query?.createdById !== undefined) {
        params.set('createdById', query.createdById);
      }
      const suffix = params.toString();
      const response = await client.get(
        suffix === '' ? '/api/projects' : `/api/projects?${suffix}`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list projects: ${response.body}`);
      }
      return response.json<{ projects: Project[] }>().projects;
    },

    async getProject(id: string): Promise<Project> {
      const response = await client.get(`/api/projects/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to get project: ${response.body}`);
      }
      return response.json<Project>();
    },

    async updateProject(
      id: string,
      input: { name?: string; objective?: string | null; notebookPages?: string[] }
    ): Promise<Project> {
      const response = await client.patch(`/api/projects/${id}`, input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A project with this name already exists');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to update project: ${response.body}`);
      }
      return response.json<Project>();
    },

    async confirmProjectProposal(
      id: string,
      input: ConfirmProjectProposalInput = {}
    ): Promise<ConfirmProjectProposalResult> {
      const response = await client.post(`/api/projects/${id}/confirm`, input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Confirming a proposal requires a person');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A project with this name already exists');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to confirm proposal: ${response.body}`);
      }
      return response.json<ConfirmProjectProposalResult>();
    },

    async declineProjectProposal(id: string): Promise<Project> {
      const response = await client.post(`/api/projects/${id}/decline`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Turning down a proposal requires a person');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to decline proposal: ${response.body}`);
      }
      return response.json<Project>();
    },

    async restoreProjectProposal(id: string): Promise<Project> {
      const response = await client.post(`/api/projects/${id}/restore`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Restoring a proposal requires a person');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A project with this name already exists');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to restore proposal: ${response.body}`);
      }
      return response.json<Project>();
    },

    async stageProjectImport(projects: ImportProject[]) {
      const response = await client.post('/api/projects/imports', { projects }, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{
          message?: string;
          code?: string;
          errors?: Array<{
            index: number;
            name: string;
            field: string;
            code: string;
            message: string;
          }>;
        }>();
        if (error.code === 'IMPORT_INVALID') {
          throw new ImportInvalidError(error.message ?? 'The import batch is invalid', error.errors ?? []);
        }
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to stage import: ${response.body}`);
      }
      return response.json<StagedImport>();
    },

    async listPendingProjectImports() {
      const response = await client.get('/api/projects/imports', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list imports: ${response.body}`);
      }
      return response.json<{ imports: StagedImport[] }>().imports;
    },

    async getProjectImport(id: string) {
      const response = await client.get(`/api/projects/imports/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to get import: ${response.body}`);
      }
      return response.json<StagedImport>();
    },

    async applyProjectImport(id: string) {
      const response = await client.post(`/api/projects/imports/${id}/apply`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Applying or discarding an import requires a person');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'This import is no longer pending');
      }
      if (response.statusCode === 400) {
        const error = response.json<{
          message?: string;
          code?: string;
          errors?: Array<{
            index: number;
            name: string;
            field: string;
            code: string;
            message: string;
          }>;
        }>();
        if (error.code === 'IMPORT_INVALID') {
          throw new ImportInvalidError(error.message ?? 'The import batch is invalid', error.errors ?? []);
        }
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to apply import: ${response.body}`);
      }
      return response.json<AppliedImport>();
    },

    async discardProjectImport(id: string) {
      const response = await client.post(`/api/projects/imports/${id}/discard`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Applying or discarding an import requires a person');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'This import is no longer pending');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to discard import: ${response.body}`);
      }
      return response.json<DiscardedImport>();
    },

    async changeProjectStatus(
      id: string,
      input: {
        status: 'active' | 'waiting' | 'someday' | 'done';
        waitingOn?: string | null;
        waitingSince?: string | null;
        openTasks?: 'complete' | 'remove';
      }
    ): Promise<{
      project: Project;
      completedTaskCount: number;
      removedTaskCount: number;
    }> {
      const response = await client.put(`/api/projects/${id}/status`, input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        const error = response.json<{ message?: string }>();
        throw new ForbiddenError(error.message ?? 'Permission denied');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Conflict');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to change project status: ${response.body}`);
      }
      return response.json<{
        project: Project;
        completedTaskCount: number;
        removedTaskCount: number;
      }>();
    },

    async setNextAction(
      projectId: string,
      input:
        | { taskId: string }
        | { taskId: null }
        | { newTask: { title: string; dueDate?: string; assigneeId?: string; listId?: string } }
    ): Promise<{ project: Project; task?: { id: string; title: string } }> {
      const response = await client.put(
        `/api/projects/${projectId}/next-action`,
        input,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        const error = response.json<{ message?: string; code?: string }>();
        if (error.code === 'TASK_NOT_FOUND') {
          throw new NotFoundError('Task', 'taskId' in input && input.taskId ? input.taskId : '');
        }
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to set next action: ${response.body}`);
      }
      return response.json<{ project: Project; task?: { id: string; title: string } }>();
    },

    async listOpenTasksOnProject(projectId: string): Promise<Task[]> {
      const response = await client.get(`/api/projects/${projectId}/tasks`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list open tasks on project: ${response.body}`);
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async listFinishedTasksOnProject(
      projectId: string,
      query?: { limit?: number; cursor?: string }
    ) {
      const qs = new URLSearchParams({ status: 'finished' });
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const response = await client.get(
        `/api/projects/${projectId}/tasks?${qs.toString()}`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list finished tasks: ${response.body}`);
      }
      return response.json<{
        tasks: Task[];
        hasMore: boolean;
        nextCursor: string | null;
        total: number;
      }>();
    },

    async listProjectHistory(
      projectId: string,
      query?: { limit?: number; cursor?: string }
    ) {
      const qs = new URLSearchParams();
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await client.get(
        `/api/projects/${projectId}/history${suffix}`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list project history: ${response.body}`);
      }
      return response.json<{
        entries: Array<{
          id: string;
          kind: string;
          occurredAt: string;
          actor: { userId: string | null; kind: 'user' | 'bot' | null; name: string | null };
          subject: { type: 'task' | 'project'; id: string; title: string | null; deleted: boolean };
          details: { kind: string; [key: string]: unknown };
        }>;
        hasMore: boolean;
        nextCursor: string | null;
        total: number;
        historyStartsAt: string;
      }>();
    },

    async listTaskHistory(taskId: string, query?: { limit?: number; cursor?: string }) {
      const qs = new URLSearchParams();
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await client.get(`/api/tasks/${taskId}/history${suffix}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', taskId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list task history: ${response.body}`);
      }
      return response.json<{
        entries: Array<{
          id: string;
          kind: string;
          occurredAt: string;
          actor: { userId: string | null; kind: 'user' | 'bot' | null; name: string | null };
          subject: { type: 'task' | 'project'; id: string; title: string | null; deleted: boolean };
          details: { kind: string; [key: string]: unknown };
        }>;
        hasMore: boolean;
        nextCursor: string | null;
        total: number;
        historyStartsAt: string;
      }>();
    },

    async expectInvalidProjectHistoryCursor(projectId: string, cursor: string) {
      const response = await client.get(
        `/api/projects/${projectId}/history?cursor=${encodeURIComponent(cursor)}`,
        authHeaders()
      );
      if (response.statusCode !== 400) {
        throw new Error(`Expected 400 invalid_cursor, got ${response.statusCode}`);
      }
      const body = response.json<{ message: string; code: string }>();
      if (body.code !== 'invalid_cursor') {
        throw new Error(`Expected code invalid_cursor, got ${body.code}`);
      }
      return body;
    },

    async listNotes(
      projectId: string,
      query?: { limit?: number; cursor?: string }
    ): Promise<NoteListPage> {
      const qs = new URLSearchParams();
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await client.get(
        `/api/projects/${projectId}/notes${suffix}`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list notes: ${response.body}`);
      }
      return response.json<NoteListPage>();
    },

    async getNote(projectId: string, noteId: string): Promise<Note> {
      const response = await client.get(
        `/api/projects/${projectId}/notes/${noteId}`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Note', noteId);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to get note: ${response.body}`);
      }
      return response.json<Note>();
    },

    async createNote(
      projectId: string,
      input: { title: string; body?: string }
    ): Promise<Note> {
      const response = await client.post(
        `/api/projects/${projectId}/notes`,
        input,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create note: ${response.body}`);
      }
      return response.json<Note>();
    },

    async updateNote(
      projectId: string,
      noteId: string,
      input: { title?: string; body?: string; expectedVersion: string }
    ): Promise<Note> {
      const response = await client.patch(
        `/api/projects/${projectId}/notes/${noteId}`,
        input,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Note', noteId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{
          message?: string;
          currentVersion?: string;
          updatedAt?: string;
          updatedByName?: string;
        }>();
        throw new StaleNoteError({
          message: error.message ?? 'This note changed since you opened it',
          currentVersion: error.currentVersion ?? '',
          updatedAt: error.updatedAt ?? '',
          updatedByName: error.updatedByName ?? '',
        });
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to update note: ${response.body}`);
      }
      return response.json<Note>();
    },

    async deleteNote(projectId: string, noteId: string): Promise<void> {
      const response = await client.request({
        method: 'DELETE',
        url: `/api/projects/${projectId}/notes/${noteId}`,
        headers: authHeaders(),
        payload: {},
      });
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Note', noteId);
      }
      if (response.statusCode !== 204) {
        throw new Error(`Failed to delete note: ${response.body}`);
      }
    },

    async listNotesChanged(query: {
      since: string;
      limit?: number;
      cursor?: string;
    }): Promise<NoteChangePage> {
      const qs = new URLSearchParams({ since: query.since });
      if (query.limit !== undefined) qs.set('limit', String(query.limit));
      if (query.cursor) qs.set('cursor', query.cursor);
      const response = await client.get(`/api/notes/changed?${qs.toString()}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list notes changed: ${response.body}`);
      }
      return response.json<NoteChangePage>();
    },

    async importNoteFromObsidian(input: {
      projectId: string;
      noteId?: string;
      title: string;
      body: string;
      baseVersion?: string;
    }): Promise<Note> {
      const response = await client.post('/api/notes/import', input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError(response.json<{ message?: string }>().message ?? 'Forbidden');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Note', input.noteId ?? input.projectId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{
          message?: string;
          currentVersion?: string;
          title?: string;
          body?: string;
          updatedAt?: string;
          updatedByName?: string;
        }>();
        throw new NoteSyncConflictError({
          message: error.message ?? 'This note changed in Yoink since the Obsidian file was last synced',
          currentVersion: error.currentVersion ?? '',
          title: error.title ?? '',
          body: error.body ?? '',
          updatedAt: error.updatedAt ?? '',
          updatedByName: error.updatedByName ?? '',
        });
      }
      if (response.statusCode !== 200 && response.statusCode !== 201) {
        throw new Error(`Failed to import note: ${response.body}`);
      }
      return response.json<Note>();
    },

    async createNamedList(name: string): Promise<NamedList> {
      const response = await client.post('/api/lists', { name }, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A list with this name already exists');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create named list: ${response.body}`);
      }
      return response.json<NamedList>();
    },

    async renameNamedList(id: string, name: string): Promise<NamedList> {
      const response = await client.patch(`/api/lists/${id}`, { name }, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('List', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'A list with this name already exists');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to rename named list: ${response.body}`);
      }
      return response.json<NamedList>();
    },

    async deleteNamedList(id: string): Promise<void> {
      const response = await client.delete(`/api/lists/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('List', id);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'This list still has open tasks');
      }
      if (response.statusCode !== 204) {
        throw new Error(`Failed to delete named list: ${response.body}`);
      }
    },

    async listOpenTasksOnList(listId: string): Promise<Task[]> {
      const response = await client.get(`/api/lists/${listId}/tasks`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('List', listId);
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list open tasks on list: ${response.body}`);
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]> {
      const response = await client.put(
        `/api/lists/${listId}/tasks/order`,
        { taskIds },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('List', listId);
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Only open tasks can be reordered');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to reorder open tasks: ${response.body}`);
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async listUnlistedOpenTasks(): Promise<Task[]> {
      const response = await client.get('/api/unlisted/tasks', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list unlisted open tasks: ${response.body}`);
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]> {
      const response = await client.put(
        '/api/unlisted/tasks/order',
        { taskIds },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Only open tasks can be reordered');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to reorder unlisted open tasks: ${response.body}`);
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async goToLists(): Promise<void> {
      throw new UnsupportedOperationError('goToLists', 'http');
    },

    async openListsUrl(): Promise<void> {
      throw new UnsupportedOperationError('openListsUrl', 'http');
    },

    async openNamedListUrl(_listId: string): Promise<void> {
      throw new UnsupportedOperationError('openNamedListUrl', 'http');
    },

    async openUnlistedListUrl(): Promise<void> {
      throw new UnsupportedOperationError('openUnlistedListUrl', 'http');
    },

    async shouldSeeEmptyNamedLists(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeEmptyNamedLists', 'http');
    },

    async shouldSeeNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedList', 'http');
    },

    async shouldNotSeeNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeNamedList', 'http');
    },

    async openNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('openNamedList', 'http');
    },

    async openUnlistedPile(): Promise<void> {
      throw new UnsupportedOperationError('openUnlistedPile', 'http');
    },

    async shouldSeeOpenTasksInOrder(_titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOpenTasksInOrder', 'http');
    },

    async openDone(): Promise<void> {
      throw new UnsupportedOperationError('openDone', 'http');
    },

    async clickLoadMore(): Promise<void> {
      throw new UnsupportedOperationError('clickLoadMore', 'http');
    },

    async shouldSeeLoadMore(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeLoadMore', 'http');
    },

    async shouldNotSeeLoadMore(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeLoadMore', 'http');
    },

    async shouldSeeEveryTaskTitle(_titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeEveryTaskTitle', 'http');
    },

    async shouldSeeEveryCaptureContent(_contents: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeEveryCaptureContent', 'http');
    },

    async moveOpenTask(_title: string, _direction: 'up' | 'down'): Promise<void> {
      throw new UnsupportedOperationError('moveOpenTask', 'http');
    },

    async dragOpenTaskOnto(_sourceTitle: string, _targetTitle: string): Promise<void> {
      throw new UnsupportedOperationError('dragOpenTaskOnto', 'http');
    },

    async dragOpenTaskOntoByTouch(_sourceTitle: string, _targetTitle: string): Promise<void> {
      throw new UnsupportedOperationError('dragOpenTaskOntoByTouch', 'http');
    },

    async refreshOpenList(): Promise<void> {
      throw new UnsupportedOperationError('refreshOpenList', 'http');
    },

    async shouldNotSeeAllDestination(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeAllDestination', 'http');
    },

    async openOldAllUrl(_path: string): Promise<void> {
      throw new UnsupportedOperationError('openOldAllUrl', 'http');
    },

    async shouldBeOnToday(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnToday', 'http');
    },

    async openAllOverview(): Promise<void> {
      throw new UnsupportedOperationError('openAllOverview', 'http');
    },

    async openAllNamedPile(_name: string): Promise<void> {
      throw new UnsupportedOperationError('openAllNamedPile', 'http');
    },

    async openAllUnlistedPile(): Promise<void> {
      throw new UnsupportedOperationError('openAllUnlistedPile', 'http');
    },

    async shouldSeeAllPileGroups(_names: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeAllPileGroups', 'http');
    },

    async shouldSeeTasksInAllPileGroup(_groupName: string, _titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTasksInAllPileGroup', 'http');
    },

    async shouldNotSeeReorderControls(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeReorderControls', 'http');
    },

    async shouldNotSeePinControls(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeePinControls', 'http');
    },

    async shouldSeeTaskFilterWithoutAllPile(
      _filter: 'today' | 'upcoming' | 'mine' | 'completed'
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskFilterWithoutAllPile', 'http');
    },

    async openWork(_options?: { mine?: boolean }): Promise<void> {
      throw new UnsupportedOperationError('openWork', 'http');
    },

    async openRailWork(): Promise<void> {
      throw new UnsupportedOperationError('openRailWork', 'http');
    },

    async toggleNowMine(): Promise<void> {
      throw new UnsupportedOperationError('toggleNowMine', 'http');
    },

    async shouldSeeNowReady(_owner: NowOwner): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowReady', 'http');
    },

    async shouldSeeNowSubcopy(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowSubcopy', 'http');
    },

    async shouldSeeNowMinePressed(_pressed: boolean): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowMinePressed', 'http');
    },

    async shouldSeeNowNextActionRows(_rows: NowNextActionRow[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowNextActionRows', 'http');
    },

    async shouldSeeNowDueRows(_rows: NowDueRow[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowDueRows', 'http');
    },

    async shouldSeeNowEmpty(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowEmpty', 'http');
    },

    async openNowListsSheet(): Promise<void> {
      throw new UnsupportedOperationError('openNowListsSheet', 'http');
    },

    async shouldSeeNowListRows(_rows: NowListRow[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNowListRows', 'http');
    },

    async pickNowList(_listId: string): Promise<void> {
      throw new UnsupportedOperationError('pickNowList', 'http');
    },

    async shouldSeeRailListCount(_listId: string, _count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailListCount', 'http');
    },

    async shouldSeeRailLabelOnOneLine(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailLabelOnOneLine', 'http');
    },

    async scrollNowDueClearOfTabBar(): Promise<void> {
      throw new UnsupportedOperationError('scrollNowDueClearOfTabBar', 'http');
    },

    async openToday(): Promise<void> {
      throw new UnsupportedOperationError('openToday', 'http');
    },

    async openUpcoming(): Promise<void> {
      throw new UnsupportedOperationError('openUpcoming', 'http');
    },

    async shouldSeePileGroups(_names: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePileGroups', 'http');
    },

    async shouldSeeTasksInPileGroup(_groupName: string, _titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTasksInPileGroup', 'http');
    },

    async shouldSeeTodayOuterSections(
      _sections: Array<'overdue' | 'due-today'>
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTodayOuterSections', 'http');
    },

    async shouldSeePileGroupsInTodaySection(
      _section: 'overdue' | 'due-today',
      _names: string[]
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePileGroupsInTodaySection', 'http');
    },

    async shouldSeeTasksInTodaySectionPileGroup(
      _section: 'overdue' | 'due-today',
      _groupName: string,
      _titles: string[]
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTasksInTodaySectionPileGroup', 'http');
    },

    async shouldNotSeeTodayDueSplit(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeTodayDueSplit', 'http');
    },

    async shouldSeeAllPileDropdown(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeAllPileDropdown', 'http');
    },

    async openMineOverview(): Promise<void> {
      throw new UnsupportedOperationError('openMineOverview', 'http');
    },

    async openOldMinePileUrl(_pile: string): Promise<void> {
      throw new UnsupportedOperationError('openOldMinePileUrl', 'http');
    },

    async shouldBeOnMineOverview(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnMineOverview', 'http');
    },

    async shouldNotSeeMinePileDropdown(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeMinePileDropdown', 'http');
    },

    async shouldSeeRailMineHighlighted(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailMineHighlighted', 'http');
    },

    async shouldSeeReorderControls(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReorderControls', 'http');
    },

    async enterReorderMode(): Promise<void> {
      throw new UnsupportedOperationError('enterReorderMode', 'http');
    },

    async exitReorderMode(): Promise<void> {
      throw new UnsupportedOperationError('exitReorderMode', 'http');
    },

    async shouldSeeReorderMode(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReorderMode', 'http');
    },

    async shouldSeeDropSlotWhileDragging(
      _sourceTitle: string,
      _targetTitle: string
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDropSlotWhileDragging', 'http');
    },

    async shouldSeeTaskTitles(_titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskTitles', 'http');
    },

    async shouldNotSeeTask(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeTask', 'http');
    },

    async shouldNotSeeCreateListOnMine(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeCreateListOnMine', 'http');
    },

    async shouldNotSeeDeleteListOnMine(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeDeleteListOnMine', 'http');
    },

    async shouldNotSeeListsNav(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeListsNav', 'http');
    },

    async createNamedListFromAll(_name: string): Promise<NamedList> {
      throw new UnsupportedOperationError('createNamedListFromAll', 'http');
    },

    async shouldBeOnAllNamedPile(_listId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnAllNamedPile', 'http');
    },

    async shouldSeeNamedPileOnAll(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedPileOnAll', 'http');
    },

    async shouldSeeEmptyNamedPile(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeEmptyNamedPile', 'http');
    },

    async shouldNotSeeDeleteListOnAll(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeDeleteListOnAll', 'http');
    },

    async deleteNamedListFromAll(_name: string): Promise<void> {
      throw new UnsupportedOperationError('deleteNamedListFromAll', 'http');
    },

    async shouldBeOnAllOverview(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnAllOverview', 'http');
    },

    async shouldBeOnAllUnlistedPile(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnAllUnlistedPile', 'http');
    },

    async shouldNotSeeNamedPileOnAll(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeNamedPileOnAll', 'http');
    },

    async shouldSeeRailItems(_labels: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailItems', 'http');
    },

    async shouldSeeProcessCountOnRail(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessCountOnRail', 'http');
    },

    async shouldNotSeeProcessCountOnRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeProcessCountOnRail', 'http');
    },

    async shouldSeeDesktopRailSections(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDesktopRailSections', 'http');
    },

    async shouldSeeRailSectionHighlighted(
      _key: 'capture' | 'process' | 'work' | 'review'
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailSectionHighlighted', 'http');
    },

    async scrollDesktopRailSoLabelIsVisible(_label: string): Promise<void> {
      throw new UnsupportedOperationError('scrollDesktopRailSoLabelIsVisible', 'http');
    },

    async openRailProcess(): Promise<void> {
      throw new UnsupportedOperationError('openRailProcess', 'http');
    },

    async openRailReview(): Promise<void> {
      throw new UnsupportedOperationError('openRailReview', 'http');
    },

    async shouldSeeRailRowHighlighted(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailRowHighlighted', 'http');
    },

    async shouldSeeNoCountOnCaptureSection(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoCountOnCaptureSection', 'http');
    },

    async shouldSeeBackToWorkAbovePlaceHeading(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeBackToWorkAbovePlaceHeading', 'http');
    },

    async shouldSeeListsHeadingAboveNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeListsHeadingAboveNamedList', 'http');
    },

    async shouldSeeInboxModeSeparatedFromTaskFamily(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxModeSeparatedFromTaskFamily', 'http');
    },

    async openRailNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('openRailNamedList', 'http');
    },

    async openRailUnlisted(): Promise<void> {
      throw new UnsupportedOperationError('openRailUnlisted', 'http');
    },

    async openRailSmartView(_view: 'today' | 'upcoming' | 'mine' | 'done'): Promise<void> {
      throw new UnsupportedOperationError('openRailSmartView', 'http');
    },

    async shouldSeeAddTaskField(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeAddTaskField', 'http');
    },

    async shouldNotSeeAddTaskField(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeAddTaskField', 'http');
    },

    async createNamedListFromRail(_name: string): Promise<NamedList> {
      throw new UnsupportedOperationError('createNamedListFromRail', 'http');
    },

    async createProjectFromRail(_input: {
      name: string;
      objective?: string;
    }): Promise<Project> {
      throw new UnsupportedOperationError('createProjectFromRail', 'http');
    },

    async shouldSeeProjectPage(_input: {
      name: string;
      objective?: string;
      status: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProjectPage', 'http');
    },

    async editProjectName(_name: string): Promise<void> {
      throw new UnsupportedOperationError('editProjectName', 'http');
    },

    async editProjectObjective(_objective: string): Promise<void> {
      throw new UnsupportedOperationError('editProjectObjective', 'http');
    },

    async goToProject(_projectId: string): Promise<void> {
      throw new UnsupportedOperationError('goToProject', 'http');
    },

    async goToImportPreview(_importId: string): Promise<void> {
      throw new UnsupportedOperationError('goToImportPreview', 'http');
    },

    async reviewPendingImport(): Promise<void> {
      throw new UnsupportedOperationError('reviewPendingImport', 'http');
    },

    async shouldSeePendingImportBanner(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePendingImportBanner', 'http');
    },

    async shouldNotSeePendingImportBanner(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeePendingImportBanner', 'http');
    },

    async shouldSeeImportPreviewProject(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportPreviewProject', 'http');
    },

    async shouldSeeImportPreviewSummary(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportPreviewSummary', 'http');
    },

    async shouldSeeImportPreviewCollapsed(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportPreviewCollapsed', 'http');
    },

    async shouldSeeImportPreviewExpanded(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportPreviewExpanded', 'http');
    },

    async expandImportPreviewProject(_name: string): Promise<void> {
      throw new UnsupportedOperationError('expandImportPreviewProject', 'http');
    },

    async shouldSeeImportFooter(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportFooter', 'http');
    },

    async shouldSeeImportFooterWhilePreviewScrolledTo(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportFooterWhilePreviewScrolledTo', 'http');
    },

    async shouldSeeImportWarning(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportWarning', 'http');
    },

    async shouldSeeImportError(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeImportError', 'http');
    },

    async applyImportOnPreview(): Promise<void> {
      throw new UnsupportedOperationError('applyImportOnPreview', 'http');
    },

    async discardImportOnPreview(): Promise<void> {
      throw new UnsupportedOperationError('discardImportOnPreview', 'http');
    },

    async scrollImportPreviewProject(_name: string): Promise<void> {
      throw new UnsupportedOperationError('scrollImportPreviewProject', 'http');
    },

    async scrollImportActionsIntoView(): Promise<void> {
      throw new UnsupportedOperationError('scrollImportActionsIntoView', 'http');
    },

    async highlightImportDiscard(): Promise<void> {
      throw new UnsupportedOperationError('highlightImportDiscard', 'http');
    },

    async pressImportDiscardAndHold(): Promise<void> {
      throw new UnsupportedOperationError('pressImportDiscardAndHold', 'http');
    },

    async releaseHeldImportDiscard(): Promise<void> {
      throw new UnsupportedOperationError('releaseHeldImportDiscard', 'http');
    },

    async shouldSeeNotebookPage(_path: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotebookPage', 'http');
    },

    async shouldSeeNotebookHref(_path: string, _href: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotebookHref', 'http');
    },

    async shouldSeeNotebookPageInputs(_paths: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotebookPageInputs', 'http');
    },

    async typeNotebookPageAndKeepFocus(_index: number, _extra: string): Promise<void> {
      throw new UnsupportedOperationError('typeNotebookPageAndKeepFocus', 'http');
    },

    async addNotebookPageWithEnter(_path: string): Promise<void> {
      throw new UnsupportedOperationError('addNotebookPageWithEnter', 'http');
    },

    async scrollProjectHeadingIntoView(): Promise<void> {
      throw new UnsupportedOperationError('scrollProjectHeadingIntoView', 'http');
    },

    async scrollProjectHistoryIntoView(): Promise<void> {
      throw new UnsupportedOperationError('scrollProjectHistoryIntoView', 'http');
    },

    async openProjectStatusSelect(_visibleOptionName?: string): Promise<void> {
      throw new UnsupportedOperationError('openProjectStatusSelect', 'http');
    },

    async pageClickWaitingOption(): Promise<void> {
      throw new UnsupportedOperationError('pageClickWaitingOption', 'http');
    },

    async pageClickDoneOption(): Promise<void> {
      throw new UnsupportedOperationError('pageClickDoneOption', 'http');
    },

    async setProjectStatusFromPage(_status: 'active' | 'someday' | 'done'): Promise<void> {
      throw new UnsupportedOperationError('setProjectStatusFromPage', 'http');
    },

    async setProjectWaitingFromPage(_input: {
      waitingOn: string;
      waitingSince?: string;
      unknownSince?: boolean;
    }): Promise<void> {
      throw new UnsupportedOperationError('setProjectWaitingFromPage', 'http');
    },

    async confirmDoneComplete(): Promise<void> {
      throw new UnsupportedOperationError('confirmDoneComplete', 'http');
    },

    async confirmDoneRemove(): Promise<void> {
      throw new UnsupportedOperationError('confirmDoneRemove', 'http');
    },

    async shouldSeeWaitingSummary(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeWaitingSummary', 'http');
    },

    async openNextActionPicker(): Promise<void> {
      throw new UnsupportedOperationError('openNextActionPicker', 'http');
    },

    async pickNextActionFromPicker(_title: string): Promise<void> {
      throw new UnsupportedOperationError('pickNextActionFromPicker', 'http');
    },

    async createNextActionFromPicker(_title: string): Promise<void> {
      throw new UnsupportedOperationError('createNextActionFromPicker', 'http');
    },

    async completeNextActionFromPage(_title: string): Promise<void> {
      throw new UnsupportedOperationError('completeNextActionFromPage', 'http');
    },

    async skipWhatsNext(): Promise<void> {
      throw new UnsupportedOperationError('skipWhatsNext', 'http');
    },

    async pickWhatsNextTask(_title: string): Promise<void> {
      throw new UnsupportedOperationError('pickWhatsNextTask', 'http');
    },

    async shouldSeeNextAction(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNextAction', 'http');
    },

    async shouldSeeNoNextActionCard(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoNextActionCard', 'http');
    },

    async shouldSeeWhatsNext(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeWhatsNext', 'http');
    },

    async shouldSeeSomedaySetNextActionLink(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeSomedaySetNextActionLink', 'http');
    },

    async dismissNextActionPicker(): Promise<void> {
      throw new UnsupportedOperationError('dismissNextActionPicker', 'http');
    },

    async shouldSeePickerCreateInViewport(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePickerCreateInViewport', 'http');
    },

    async shouldSeeWhatsNextFooterInViewport(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeWhatsNextFooterInViewport', 'http');
    },

    async shouldSeeNoNextActionOnAllProjects(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoNextActionOnAllProjects', 'http');
    },

    async shouldSeeNoNextActionDotOnRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoNextActionDotOnRail', 'http');
    },

    async shouldSeeBlankProjectNameError(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeBlankProjectNameError', 'http');
    },

    async openProjectEditDialog(): Promise<void> {
      throw new UnsupportedOperationError('openProjectEditDialog', 'http');
    },

    async dismissProjectEditDialog(): Promise<void> {
      throw new UnsupportedOperationError('dismissProjectEditDialog', 'http');
    },

    async deleteTaskFromEdit(): Promise<void> {
      throw new UnsupportedOperationError('deleteTaskFromEdit', 'http');
    },

    async clearTaskProjectFromEdit(): Promise<void> {
      throw new UnsupportedOperationError('clearTaskProjectFromEdit', 'http');
    },

    async shouldSeeSingleStatusControl(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeSingleStatusControl', 'http');
    },

    async shouldSeeHistorySection(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistorySection', 'http');
    },

    async expandProjectHistory(): Promise<void> {
      throw new UnsupportedOperationError('expandProjectHistory', 'http');
    },

    async expandProjectFinished(): Promise<void> {
      throw new UnsupportedOperationError('expandProjectFinished', 'http');
    },

    async clickProjectHistoryMore(): Promise<void> {
      throw new UnsupportedOperationError('clickProjectHistoryMore', 'http');
    },

    async loadAllProjectHistory(): Promise<void> {
      throw new UnsupportedOperationError('loadAllProjectHistory', 'http');
    },

    async shouldSeeHistoryEntry(_input: {
      kind: string;
      actor: string;
      text: string;
      deleted?: boolean;
      highlight?: boolean;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistoryEntry', 'http');
    },

    async shouldSeeHistoryEntryCount(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistoryEntryCount', 'http');
    },

    async shouldSeeHistoryMore(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistoryMore', 'http');
    },

    async shouldSeeHistoryStart(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistoryStart', 'http');
    },

    async shouldNotSeeHistoryStart(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeHistoryStart', 'http');
    },

    async shouldSeeHistoryLinesInOrder(_texts: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeHistoryLinesInOrder', 'http');
    },

    async shouldSeeNotesReady(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotesReady', 'http');
    },

    async shouldSeeNotesEmpty(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotesEmpty', 'http');
    },

    async shouldSeeNoteOnProject(_input: {
      title: string;
      excerpt?: string;
      stamp?: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoteOnProject', 'http');
    },

    async shouldNotSeeNoteOnProject(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeNoteOnProject', 'http');
    },

    async shouldSeeNotesBetweenNextActionAndNotebook(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotesBetweenNextActionAndNotebook', 'http');
    },

    async addNoteOnProject(_input: { title: string; body?: string }): Promise<Note> {
      throw new UnsupportedOperationError('addNoteOnProject', 'http');
    },

    async openNoteOnProject(_title: string): Promise<void> {
      throw new UnsupportedOperationError('openNoteOnProject', 'http');
    },

    async shouldSeeOpenNote(_input: { title: string; bodyText?: string }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOpenNote', 'http');
    },

    async shouldNotSeeRawHtmlInNote(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeRawHtmlInNote', 'http');
    },

    async startEditingOpenNote(): Promise<void> {
      throw new UnsupportedOperationError('startEditingOpenNote', 'http');
    },

    async editOpenNote(_input: { title?: string; body?: string }): Promise<void> {
      throw new UnsupportedOperationError('editOpenNote', 'http');
    },

    async saveOpenNote(): Promise<void> {
      throw new UnsupportedOperationError('saveOpenNote', 'http');
    },

    async cancelOpenNote(): Promise<void> {
      throw new UnsupportedOperationError('cancelOpenNote', 'http');
    },

    async shouldSeeNoteEditor(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoteEditor', 'http');
    },

    async shouldSeeNoteStale(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoteStale', 'http');
    },

    async seeNewerNoteVersion(): Promise<void> {
      throw new UnsupportedOperationError('seeNewerNoteVersion', 'http');
    },

    async saveOpenNoteAsCopy(): Promise<void> {
      throw new UnsupportedOperationError('saveOpenNoteAsCopy', 'http');
    },

    async deleteOpenNote(): Promise<void> {
      throw new UnsupportedOperationError('deleteOpenNote', 'http');
    },

    async toggleNotePreview(): Promise<void> {
      throw new UnsupportedOperationError('toggleNotePreview', 'http');
    },

    async shouldSeeNotePreview(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNotePreview', 'http');
    },

    async shouldSeeDiscardChangesPrompt(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDiscardChangesPrompt', 'http');
    },

    async keepEditingNote(): Promise<void> {
      throw new UnsupportedOperationError('keepEditingNote', 'http');
    },

    async discardNoteChanges(): Promise<void> {
      throw new UnsupportedOperationError('discardNoteChanges', 'http');
    },

    async shouldSeeFinishedTask(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeFinishedTask', 'http');
    },

    async shouldSeeFinishedBy(_title: string, _text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeFinishedBy', 'http');
    },

    async shouldNotSeeFinishedTask(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeFinishedTask', 'http');
    },

    async reopenFinishedTask(_title: string): Promise<void> {
      throw new UnsupportedOperationError('reopenFinishedTask', 'http');
    },

    async shouldSeeProjectOnRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProjectOnRail', 'http');
    },

    async shouldSeeProjectInSomedayGroup(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProjectInSomedayGroup', 'http');
    },

    async shouldNotSeeProjectOnRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeProjectOnRail', 'http');
    },

    async openSomedayGroup(): Promise<void> {
      throw new UnsupportedOperationError('openSomedayGroup', 'http');
    },

    async goToAllProjects(): Promise<void> {
      throw new UnsupportedOperationError('goToAllProjects', 'http');
    },

    async shouldSeeProjectOnAllProjects(_input: {
      name: string;
      status: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProjectOnAllProjects', 'http');
    },

    async openReview(): Promise<void> {
      throw new UnsupportedOperationError('openReview', 'http');
    },

    async shouldSeeReviewReady(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewReady', 'http');
    },

    async shouldSeeReviewEmpty(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewEmpty', 'http');
    },

    async shouldSeeReviewSubcopy(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewSubcopy', 'http');
    },

    async shouldSeeReviewSection(
      _section: 'noNextAction' | 'quiet' | 'waiting'
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewSection', 'http');
    },

    async shouldSeeReviewItem(_input: {
      name: string;
      section: 'noNextAction' | 'quiet' | 'waiting';
      reasons: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewItem', 'http');
    },

    async shouldNotSeeReviewItem(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeReviewItem', 'http');
    },

    async shouldSeeReviewWaitingGroup(_input: { label: string; names: string[] }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewWaitingGroup', 'http');
    },

    async shouldSeeReviewRowCopy(_name: string, _copy: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewRowCopy', 'http');
    },

    async setReviewNextAction(_input: { projectName: string; title: string }): Promise<void> {
      throw new UnsupportedOperationError('setReviewNextAction', 'http');
    },

    async changeReviewStatusToWaiting(_input: {
      projectName: string;
      waitingOn: string;
      waitingSince: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('changeReviewStatusToWaiting', 'http');
    },

    async expandAllProjects(): Promise<void> {
      throw new UnsupportedOperationError('expandAllProjects', 'http');
    },

    async shouldSeeReviewBadge(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewBadge', 'http');
    },

    async shouldNotSeeReviewBadge(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeReviewBadge', 'http');
    },

    async openReviewSetNextAction(_projectName: string): Promise<void> {
      throw new UnsupportedOperationError('openReviewSetNextAction', 'http');
    },

    async openReviewChangeStatus(_projectName: string): Promise<void> {
      throw new UnsupportedOperationError('openReviewChangeStatus', 'http');
    },

    async shouldSeeDoneWeek(_monday: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneWeek', 'http');
    },

    async shouldSeeDoneGroup(_input: { name: string; titles: string[] }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneGroup', 'http');
    },

    async shouldSeeDoneTaskWhen(_input: {
      projectName: string;
      title: string;
      copy: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneTaskWhen', 'http');
    },

    async shouldSeeDoneOther(_copy: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneOther', 'http');
    },

    async shouldSeeDoneEmpty(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneEmpty', 'http');
    },

    async shouldSeeDoneNext(_input: { projectName: string; title: string }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneNext', 'http');
    },

    async shouldSeeDoneSetNext(_projectName: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDoneSetNext', 'http');
    },

    async openDoneSetNextAction(_projectName: string): Promise<void> {
      throw new UnsupportedOperationError('openDoneSetNextAction', 'http');
    },

    async setDoneNextAction(_input: { projectName: string; title: string }): Promise<void> {
      throw new UnsupportedOperationError('setDoneNextAction', 'http');
    },

    async goToPreviousDoneWeek(): Promise<void> {
      throw new UnsupportedOperationError('goToPreviousDoneWeek', 'http');
    },

    async goToNextDoneWeek(): Promise<void> {
      throw new UnsupportedOperationError('goToNextDoneWeek', 'http');
    },

    async scrollDoneIntoView(): Promise<void> {
      throw new UnsupportedOperationError('scrollDoneIntoView', 'http');
    },

    async scrollReviewWaitingIntoView(): Promise<void> {
      throw new UnsupportedOperationError('scrollReviewWaitingIntoView', 'http');
    },

    async shouldSeeEditTaskDialogSubtitle(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeEditTaskDialogSubtitle', 'http');
    },

    async shouldSeeOpenTaskOnProject(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOpenTaskOnProject', 'http');
    },

    async shouldNotSeeOpenTaskOnProject(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeOpenTaskOnProject', 'http');
    },

    async shouldSeeOpenTasksOnProjectInOrder(_titles: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOpenTasksOnProjectInOrder', 'http');
    },

    async confirmPromoteOnProject(_projectName: string): Promise<Task> {
      throw new UnsupportedOperationError('confirmPromoteOnProject', 'http');
    },

    async shouldSeeNamedListOverflowOnRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListOverflowOnRail', 'http');
    },

    async shouldSeeNamedListOverflowAboveMobileDrawer(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListOverflowAboveMobileDrawer', 'http');
    },

    async shouldSeeNamedListOverflowOnDesktopSidebar(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListOverflowOnDesktopSidebar', 'http');
    },

    async shouldNotNavigateWhenOpeningNamedListOverflow(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotNavigateWhenOpeningNamedListOverflow', 'http');
    },

    async shouldSeeWrappedRailNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeWrappedRailNamedList', 'http');
    },

    async shouldSeeRailNamedListHighlighted(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailNamedListHighlighted', 'http');
    },

    async shouldSeeNoHorizontalPageScrollFromRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoHorizontalPageScrollFromRail', 'http');
    },

    async shouldSeeNamedListLabelsClearOfCountAndOverflow(): Promise<void> {
      throw new UnsupportedOperationError(
        'shouldSeeNamedListLabelsClearOfCountAndOverflow',
        'http'
      );
    },

    async shouldNotSeeNamedListOverflowOnRail(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeNamedListOverflowOnRail', 'http');
    },

    async deleteNamedListFromRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('deleteNamedListFromRail', 'http');
    },

    async renameNamedListFromRail(
      _currentName: string,
      _newName: string,
      _options?: { submit?: 'enter' | 'done' }
    ): Promise<NamedList> {
      throw new UnsupportedOperationError('renameNamedListFromRail', 'http');
    },

    async cancelNamedListRenameFromRail(
      _currentName: string,
      _draftName: string,
      _via: 'escape' | 'click-away'
    ): Promise<void> {
      throw new UnsupportedOperationError('cancelNamedListRenameFromRail', 'http');
    },

    async beginNamedListRenameFromRail(_currentName: string): Promise<void> {
      throw new UnsupportedOperationError('beginNamedListRenameFromRail', 'http');
    },

    async shouldSeeNamedListRenameDraft(_value: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListRenameDraft', 'http');
    },

    async shouldBeOnTaskFilter(
      _filter: 'today' | 'upcoming' | 'mine' | 'completed'
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnTaskFilter', 'http');
    },

    async shouldNotSeeListOnVisibleTask(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeListOnVisibleTask', 'http');
    },

    async shouldSeeCreateTaskListPicker(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCreateTaskListPicker', 'http');
    },

    async shouldNotSeeCreateTaskListPicker(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeCreateTaskListPicker', 'http');
    },

    async addTaskOnCurrentView(_title: string): Promise<Task> {
      throw new UnsupportedOperationError('addTaskOnCurrentView', 'http');
    },

    async openRailCapture(): Promise<void> {
      throw new UnsupportedOperationError('openRailCapture', 'http');
    },

    async shouldBeOnInboxPane(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnInboxPane', 'http');
    },

    async shouldSeeInboxPaneTabs(_labels: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxPaneTabs', 'http');
    },

    async shouldNotSeeSnoozedOrTrashOnRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeSnoozedOrTrashOnRail', 'http');
    },

    async openInboxPaneTab(_tab: 'inbox' | 'snoozed' | 'trash'): Promise<void> {
      throw new UnsupportedOperationError('openInboxPaneTab', 'http');
    },

    async shouldBeOnInboxPaneTab(_tab: 'inbox' | 'snoozed' | 'trash'): Promise<void> {
      throw new UnsupportedOperationError('shouldBeOnInboxPaneTab', 'http');
    },

    async shouldSeeRailCaptureHighlighted(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailCaptureHighlighted', 'http');
    },

    async shouldSeeCaptureOnCurrentPane(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureOnCurrentPane', 'http');
    },

    async shouldSeeInboxCaptureActions(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxCaptureActions', 'http');
    },

    async shouldSeeDenseCaptureSnippet(
      _content: string,
      _sourceLine: string | RegExp
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDenseCaptureSnippet', 'http');
    },

    async shouldSeeUsableCaptureActionTargets(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeUsableCaptureActionTargets', 'http');
    },

    async shouldSeeCaptureSnippetReadable(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureSnippetReadable', 'http');
    },

    async trashCaptureBySwipe(_content: string): Promise<void> {
      throw new UnsupportedOperationError('trashCaptureBySwipe', 'http');
    },

    async shouldSeeInboxTriageSurface(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxTriageSurface', 'http');
    },

    async shouldSeeTaskSurface(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskSurface', 'http');
    },

    async shouldSeeTaskPlace(_heading: string, _subcopy: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskPlace', 'http');
    },

    async shouldSeeTaskPlaceReadable(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskPlaceReadable', 'http');
    },

    async useAppearance(_appearance: {
      mode: 'light' | 'dark';
      colorTheme: 'default' | 'tokyo-night';
    }): Promise<void> {
      throw new UnsupportedOperationError('useAppearance', 'http');
    },

    async shouldSeeInboxSurfaceDistinctFromTaskSurface(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxSurfaceDistinctFromTaskSurface', 'http');
    },

    async shouldSeeCaptureContentLink(_content: string, _href: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureContentLink', 'http');
    },

    async shouldSeeCaptureContentWithoutLinks(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureContentWithoutLinks', 'http');
    },

    async shouldSeeCaptureSourceUrl(_content: string, _href: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureSourceUrl', 'http');
    },

    async openCaptureContentLink(_content: string, _href: string): Promise<void> {
      throw new UnsupportedOperationError('openCaptureContentLink', 'http');
    },

    async shouldSeeQuickAddCapture(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeQuickAddCapture', 'http');
    },

    async shouldNotSeeQuickAddCapture(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeQuickAddCapture', 'http');
    },

    async shouldNotSeeQuickCaptureField(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeQuickCaptureField', 'http');
    },

    async pressQuickCaptureShortcut(): Promise<void> {
      throw new UnsupportedOperationError('pressQuickCaptureShortcut', 'http');
    },

    async submitFocusedQuickCapture(_content: string): Promise<void> {
      throw new UnsupportedOperationError('submitFocusedQuickCapture', 'http');
    },

    async shouldHaveQuickCaptureFocused(): Promise<void> {
      throw new UnsupportedOperationError('shouldHaveQuickCaptureFocused', 'http');
    },

    async shouldSeeQuickCaptureShortcutHint(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeQuickCaptureShortcutHint', 'http');
    },

    async shouldNotSeeQuickCaptureShortcutHint(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeQuickCaptureShortcutHint', 'http');
    },

    async shouldSeeQuickCaptureShortcutHintReadable(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeQuickCaptureShortcutHintReadable', 'http');
    },

    async focusAddTaskField(): Promise<void> {
      throw new UnsupportedOperationError('focusAddTaskField', 'http');
    },

    async focusTaskEditTitle(): Promise<void> {
      throw new UnsupportedOperationError('focusTaskEditTitle', 'http');
    },

    async typeIntoFocusedField(_text: string): Promise<void> {
      throw new UnsupportedOperationError('typeIntoFocusedField', 'http');
    },

    async shouldSeeFocusedFieldValue(_value: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeFocusedFieldValue', 'http');
    },

    async openPromoteSheet(_content: string): Promise<void> {
      throw new UnsupportedOperationError('openPromoteSheet', 'http');
    },

    async shouldSeePromoteSheet(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePromoteSheet', 'http');
    },

    async shouldSeePromoteTitlePrefill(_title: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePromoteTitlePrefill', 'http');
    },

    async shouldSeePromoteListUnlisted(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePromoteListUnlisted', 'http');
    },

    async confirmPromoteUnlisted(): Promise<Task> {
      throw new UnsupportedOperationError('confirmPromoteUnlisted', 'http');
    },

    async confirmPromoteOnList(_listName: string): Promise<Task> {
      throw new UnsupportedOperationError('confirmPromoteOnList', 'http');
    },

    async cancelPromoteSheet(): Promise<void> {
      throw new UnsupportedOperationError('cancelPromoteSheet', 'http');
    },

    async shouldNotSeeCaptureOnCurrentPane(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeCaptureOnCurrentPane', 'http');
    },

    async useMobileViewport(): Promise<void> {
      throw new UnsupportedOperationError('useMobileViewport', 'http');
    },

    async useDesktopViewport(_size?: { width: number; height: number }): Promise<void> {
      throw new UnsupportedOperationError('useDesktopViewport', 'http');
    },

    async openEditTaskProjectPicker(_visibleProjectName: string): Promise<void> {
      throw new UnsupportedOperationError('openEditTaskProjectPicker', 'http');
    },

    async openCreateTaskProjectPicker(_visibleProjectName: string): Promise<void> {
      throw new UnsupportedOperationError('openCreateTaskProjectPicker', 'http');
    },

    async openPromoteProjectPicker(_visibleProjectName: string): Promise<void> {
      throw new UnsupportedOperationError('openPromoteProjectPicker', 'http');
    },

    async dismissOpenSelect(): Promise<void> {
      throw new UnsupportedOperationError('dismissOpenSelect', 'http');
    },

    async saveWalkthroughScreenshot(_input: {
      story: string;
      step: string;
      includeToasts?: boolean;
    }): Promise<void> {
      throw new UnsupportedOperationError('saveWalkthroughScreenshot', 'http');
    },

    async openMobileBottomTab(_tab: 'capture' | 'process' | 'work' | 'review'): Promise<void> {
      throw new UnsupportedOperationError('openMobileBottomTab', 'http');
    },

    async shouldSeeLitMobileTab(_tab: 'capture' | 'process' | 'work' | 'review' | null): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeLitMobileTab', 'http');
    },

    async shouldSeeProcessReady(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessReady', 'http');
    },

    async shouldSeeProcessCurrent(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessCurrent', 'http');
    },

    async shouldSeeProcessProposal(_input: {
      name: string;
      proposedBy: string;
      reason?: string;
      suggestedNextAction?: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessProposal', 'http');
    },

    async openProcessProposalConfirm(): Promise<void> {
      throw new UnsupportedOperationError('openProcessProposalConfirm', 'http');
    },

    async openProcessProposalEdit(): Promise<void> {
      throw new UnsupportedOperationError('openProcessProposalEdit', 'http');
    },

    async turnDownProcessProposal(): Promise<void> {
      throw new UnsupportedOperationError('turnDownProcessProposal', 'http');
    },

    async fillConfirmProposal(_input: {
      name?: string;
      objective?: string;
      status?: 'active' | 'someday' | 'waiting';
      suggestedNextAction?: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('fillConfirmProposal', 'http');
    },

    async confirmProcessProposal(): Promise<ConfirmProjectProposalResult> {
      throw new UnsupportedOperationError('confirmProcessProposal', 'http');
    },

    async shouldSeeProposalBanner(_input: { proposedBy: string; reason?: string }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProposalBanner', 'http');
    },

    async shouldSeeProcessLeft(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessLeft', 'http');
    },

    async shouldSeeProcessSnoozedComingBack(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessSnoozedComingBack', 'http');
    },

    async openProcessMakeTask(): Promise<void> {
      throw new UnsupportedOperationError('openProcessMakeTask', 'http');
    },

    async openProcessProjectSheet(_status: 'active' | 'someday'): Promise<void> {
      throw new UnsupportedOperationError('openProcessProjectSheet', 'http');
    },

    async shouldSeeProcessProjectPrefill(_input: { name: string; objective: string }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessProjectPrefill', 'http');
    },

    async fillProcessProject(_input: { name?: string; objective?: string }): Promise<void> {
      throw new UnsupportedOperationError('fillProcessProject', 'http');
    },

    async confirmProcessProject(): Promise<ProcessCaptureToProjectResult> {
      throw new UnsupportedOperationError('confirmProcessProject', 'http');
    },

    async shouldSeeProcessProjectError(_text: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessProjectError', 'http');
    },

    async cancelProcessProjectSheet(): Promise<void> {
      throw new UnsupportedOperationError('cancelProcessProjectSheet', 'http');
    },

    async openProcessSnoozeMenu(): Promise<void> {
      throw new UnsupportedOperationError('openProcessSnoozeMenu', 'http');
    },

    async pickProcessSnooze(_option: 'later-today' | 'tomorrow' | 'next-week'): Promise<void> {
      throw new UnsupportedOperationError('pickProcessSnooze', 'http');
    },

    async trashProcessCurrent(): Promise<void> {
      throw new UnsupportedOperationError('trashProcessCurrent', 'http');
    },

    async shouldSeeProcessSourceUrl(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessSourceUrl', 'http');
    },

    async pressProcessKey(_key: 't' | 'p' | 's' | 'z' | 'Delete' | 'Backspace'): Promise<void> {
      throw new UnsupportedOperationError('pressProcessKey', 'http');
    },

    async pressProcessDeleteWhileTrashHeld(): Promise<void> {
      throw new UnsupportedOperationError('pressProcessDeleteWhileTrashHeld', 'http');
    },

    async pressProcessDeleteAfterTrashError(): Promise<void> {
      throw new UnsupportedOperationError('pressProcessDeleteAfterTrashError', 'http');
    },

    async shouldSeeProcessKeyHints(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessKeyHints', 'http');
    },

    async shouldSeeProcessActionsFitCard(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessActionsFitCard', 'http');
    },

    async shouldSeeUndoToast(_message: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeUndoToast', 'http');
    },

    async shouldSeeToast(_message: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeToast', 'http');
    },

    async shouldNotSeeToast(_message: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeToast', 'http');
    },

    async undoFromToast(_message: string): Promise<void> {
      throw new UnsupportedOperationError('undoFromToast', 'http');
    },

    async undoReviewNextActionFromToast(
      _message: string,
      _options?: { deleteFails?: boolean }
    ): Promise<{
      method: string;
      url: string;
      requestBody: unknown;
      status: number;
      deletedUrl: string | null;
      deletedStatus: number | null;
      deletedBody: string | null;
      savedToastReappeared: boolean;
    }> {
      throw new UnsupportedOperationError('undoReviewNextActionFromToast', 'http');
    },

    async shouldSeeAlreadyProcessedNotice(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeAlreadyProcessedNotice', 'http');
    },

    async shouldNotSeeAlreadyProcessedNotice(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeAlreadyProcessedNotice', 'http');
    },

    async shouldNotSeeWhatsNext(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeWhatsNext', 'http');
    },

    async shouldSeeTaskCreatedToast(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskCreatedToast', 'http');
    },

    async shouldSeeProjectCreatedToast(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProjectCreatedToast', 'http');
    },

    async shouldSeeProcessEmpty(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessEmpty', 'http');
    },

    async shouldSeeProcessBadge(_count: number | null): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeProcessBadge', 'http');
    },

    async shouldSeeBackToWork(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeBackToWork', 'http');
    },

    async shouldNotSeeBackToWork(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeBackToWork', 'http');
    },

    async openBackToWork(): Promise<void> {
      throw new UnsupportedOperationError('openBackToWork', 'http');
    },

    async shouldSeeReviewNewProject(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeReviewNewProject', 'http');
    },

    async createProjectFromReview(_input: { name: string; objective?: string }): Promise<Project> {
      throw new UnsupportedOperationError('createProjectFromReview', 'http');
    },

    async openProjectFromIndex(_name: string): Promise<void> {
      throw new UnsupportedOperationError('openProjectFromIndex', 'http');
    },

    async openAllProjectsBackLink(): Promise<void> {
      throw new UnsupportedOperationError('openAllProjectsBackLink', 'http');
    },

    async openProcess(): Promise<void> {
      throw new UnsupportedOperationError('openProcess', 'http');
    },

    async shouldSeeNoRailItemHighlighted(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNoRailItemHighlighted', 'http');
    },

    async openRailProject(_name: string): Promise<void> {
      throw new UnsupportedOperationError('openRailProject', 'http');
    },

    async confirmPromoteOnListAndProject(_input: {
      listName: string;
      projectName: string;
      dueDate?: string;
    }): Promise<Task> {
      throw new UnsupportedOperationError('confirmPromoteOnListAndProject', 'http');
    },

    async shouldSeeClearOfMobileTabBar(_selector: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeClearOfMobileTabBar', 'http');
    },

    async snoozeCaptureOnCurrentPane(_content: string): Promise<void> {
      throw new UnsupportedOperationError('snoozeCaptureOnCurrentPane', 'http');
    },

    async trashCaptureOnCurrentPane(_content: string): Promise<void> {
      throw new UnsupportedOperationError('trashCaptureOnCurrentPane', 'http');
    },

    async shouldSeeMobileBottomTabs(_labels: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeMobileBottomTabs', 'http');
    },

    async shouldNotSeeMobileBottomTab(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeMobileBottomTab', 'http');
    },

    async shouldSeeDesktopAppRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeDesktopAppRail', 'http');
    },

    async shouldNotSeeMobileBottomNav(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeMobileBottomNav', 'http');
    },

    async shouldSeeTasksContentWithoutMobileRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTasksContentWithoutMobileRail', 'http');
    },

    async openMobileTasksRail(): Promise<void> {
      throw new UnsupportedOperationError('openMobileTasksRail', 'http');
    },

    async shouldSeeMobileTasksRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeMobileTasksRail', 'http');
    },

    async shouldNotSeeMobileTasksRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeMobileTasksRail', 'http');
    },

    async shouldSeeLargeCompleteControlOnTask(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeLargeCompleteControlOnTask', 'http');
    },

    async completeOpenTaskFromRow(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('completeOpenTaskFromRow', 'http');
    },

    async completeOpenTaskFromRowAgainstStalePilePoll(
      _taskId: string,
      _listId: string
    ): Promise<void> {
      throw new UnsupportedOperationError(
        'completeOpenTaskFromRowAgainstStalePilePoll',
        'http'
      );
    },

    async uncompleteTaskFromRow(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('uncompleteTaskFromRow', 'http');
    },

    async completeOpenTaskBySwipe(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('completeOpenTaskBySwipe', 'http');
    },

    async scrollTaskListWithoutCompleting(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('scrollTaskListWithoutCompleting', 'http');
    },

    async shouldKeepTaskAfterDesktopRowDrag(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldKeepTaskAfterDesktopRowDrag', 'http');
    },

    async shouldKeepTaskAfterVerticalRowDrag(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldKeepTaskAfterVerticalRowDrag', 'http');
    },

    async shouldSeeTaskRowAlignedWithTitle(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskRowAlignedWithTitle', 'http');
    },

    async shouldSeeTaskRowMetadataBelowTitle(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskRowMetadataBelowTitle', 'http');
    },

    async shouldSeeWrappedTaskTitle(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeWrappedTaskTitle', 'http');
    },

    async deleteOpenTaskFromRow(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('deleteOpenTaskFromRow', 'http');
    },

    async shouldNotOpenTaskEditFromTitle(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotOpenTaskEditFromTitle', 'http');
    },

    async shouldNotOpenTaskEditFromComplete(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotOpenTaskEditFromComplete', 'http');
    },

    async shouldNotOpenTaskEditInReorderMode(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotOpenTaskEditInReorderMode', 'http');
    },

    async shouldSeeTaskEditControl(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskEditControl', 'http');
    },

    async shouldSeeOnePileTaskRowChrome(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOnePileTaskRowChrome', 'http');
    },

    async shouldSeeSmartViewTaskRowChrome(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeSmartViewTaskRowChrome', 'http');
    },

    async shouldSeeTaskRowOverflowActions(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskRowOverflowActions', 'http');
    },

    async shouldSeeTaskRowChromeReadable(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskRowChromeReadable', 'http');
    },

    async openTaskEditFromRow(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('openTaskEditFromRow', 'http');
    },

    async shouldSeeExistingTaskEditUi(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeExistingTaskEditUi', 'http');
    },

    async shouldSeeTaskEditChangeHistory(_options?: {
      lastChangedBeforeHistory?: boolean;
      completed?: boolean;
      changedBy?: string;
    }): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskEditChangeHistory', 'http');
    },

    async closeTaskEdit(): Promise<void> {
      throw new UnsupportedOperationError('closeTaskEdit', 'http');
    },

    async saveOpenTaskEdit(): Promise<void> {
      throw new UnsupportedOperationError('saveOpenTaskEdit', 'http');
    },

    async shouldSeeNamedListInCreateTaskPicker(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListInCreateTaskPicker', 'http');
    },

    async useShortLiveQueryInterval(_intervalMs?: number): Promise<void> {
      throw new UnsupportedOperationError('useShortLiveQueryInterval', 'http');
    },

    async awaitLiveOpenListTasks(
      _listId: string,
      _matches: (tasks: Array<{ id: string; title: string }>) => boolean
    ): Promise<void> {
      throw new UnsupportedOperationError('awaitLiveOpenListTasks', 'http');
    },

    async awaitLiveNamedLists(
      _matches: (lists: Array<{ id: string; name: string }>) => boolean
    ): Promise<void> {
      throw new UnsupportedOperationError('awaitLiveNamedLists', 'http');
    },

    async awaitLiveInboxCaptures(
      _matches: (captures: Array<{ id: string; content: string }>) => boolean
    ): Promise<void> {
      throw new UnsupportedOperationError('awaitLiveInboxCaptures', 'http');
    },

    async awaitLiveNowNextActions(
      _matches: (items: Array<{ title: string; project: string }>) => boolean
    ): Promise<void> {
      throw new UnsupportedOperationError('awaitLiveNowNextActions', 'http');
    },

    async hideApp(): Promise<void> {
      throw new UnsupportedOperationError('hideApp', 'http');
    },

    async showApp(): Promise<void> {
      throw new UnsupportedOperationError('showApp', 'http');
    },

    async countLiveDataGetsDuring(_durationMs: number): Promise<number> {
      throw new UnsupportedOperationError('countLiveDataGetsDuring', 'http');
    },

    async failBackgroundLiveQueries(): Promise<void> {
      throw new UnsupportedOperationError('failBackgroundLiveQueries', 'http');
    },

    async restoreBackgroundLiveQueries(): Promise<void> {
      throw new UnsupportedOperationError('restoreBackgroundLiveQueries', 'http');
    },

    async shouldNotSeeQueryError(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeQueryError', 'http');
    },

    async shouldNotSeeLoadingPlaceholder(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeLoadingPlaceholder', 'http');
    },

    // Task operations
    async createTask(input: CreateTaskInput): Promise<Task> {
      const response = await client.post('/api/tasks', input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', input.projectId ?? 'unknown');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create task: ${response.body}`);
      }
      return response.json<Task>();
    },

    async listTasks(
      filter?: TaskFilter,
      viewer?: { timeZone?: string }
    ): Promise<Task[]> {
      const params = new URLSearchParams();
      if (filter) {
        params.set('filter', filter);
      }
      if (viewer?.timeZone) {
        params.set('timeZone', viewer.timeZone);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await client.get(`/api/tasks${query}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async listNowNextActions(query?: NowQuery): Promise<NowNextActionsPage> {
      const params = new URLSearchParams();
      if (query?.owner) {
        params.set('owner', query.owner);
      }
      if (query?.timeZone) {
        params.set('timeZone', query.timeZone);
      }
      if (query?.limit !== undefined) {
        params.set('limit', String(query.limit));
      }
      if (query?.cursor) {
        params.set('cursor', query.cursor);
      }
      const encoded = params.toString() ? `?${params.toString()}` : '';
      const response = await client.get(`/api/work/next-actions${encoded}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list now next actions: ${response.body}`);
      }
      return response.json<NowNextActionsPage>();
    },

    async listNowDue(query?: NowQuery): Promise<TaskListPage> {
      const params = new URLSearchParams();
      if (query?.owner) {
        params.set('owner', query.owner);
      }
      if (query?.timeZone) {
        params.set('timeZone', query.timeZone);
      }
      if (query?.limit !== undefined) {
        params.set('limit', String(query.limit));
      }
      if (query?.cursor) {
        params.set('cursor', query.cursor);
      }
      const encoded = params.toString() ? `?${params.toString()}` : '';
      const response = await client.get(`/api/work/due${encoded}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list now due: ${response.body}`);
      }
      return response.json<TaskListPage>();
    },

    async listWorkLists(): Promise<WorkListsPage> {
      const response = await client.get('/api/work/lists', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list work lists: ${response.body}`);
      }
      return response.json<WorkListsPage>();
    },

    async listReview(query?: ReviewQuery): Promise<ReviewPage> {
      const params = new URLSearchParams();
      if (query?.timeZone) {
        params.set('timeZone', query.timeZone);
      }
      if (query?.limit !== undefined) {
        params.set('limit', String(query.limit));
      }
      if (query?.cursor) {
        params.set('cursor', query.cursor);
      }
      const encoded = params.toString() ? `?${params.toString()}` : '';
      const response = await client.get(`/api/review${encoded}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list review: ${response.body}`);
      }
      return response.json<ReviewPage>();
    },

    async listDone(query?: DoneListQuery): Promise<DoneListPage> {
      const params = new URLSearchParams();
      if (query?.week) {
        params.set('week', query.week);
      }
      if (query?.limit !== undefined) {
        params.set('limit', String(query.limit));
      }
      if (query?.cursor) {
        params.set('cursor', query.cursor);
      }
      const encoded = params.toString() ? `?${params.toString()}` : '';
      const response = await client.get(`/api/review/done${encoded}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list done: ${response.body}`);
      }
      return response.json<DoneListPage>();
    },

    async finishTaskAt(taskId: string, completedAt: string): Promise<void> {
      const response = await client.post(
        '/api/test/review-fixture/finish-task',
        { taskId, completedAt },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        throw new ValidationError('Invalid finish-task');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', taskId);
      }
      if (response.statusCode !== 204) {
        throw new Error(`Failed to finish task at: ${response.body}`);
      }
    },

    async backdateReviewProject(projectId: string, occurredAt: string): Promise<void> {
      const response = await client.post(
        '/api/test/review-fixture/backdate',
        { projectId, occurredAt },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        throw new ValidationError('Invalid backdate');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.statusCode !== 204) {
        throw new Error(`Failed to backdate review project: ${response.body}`);
      }
    },

    async getTask(id: string): Promise<Task> {
      const response = await client.get(`/api/tasks/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      return response.json<Task>();
    },

    async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
      const response = await client.patch(`/api/tasks/${id}`, input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      return response.json<Task>();
    },

    async completeTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/complete`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async uncompleteTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/uncomplete`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async pinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/pin`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async unpinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/unpin`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async deleteTask(id: string): Promise<void> {
      const response = await client.delete(`/api/tasks/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      // 204 No Content is success
    },

    async goToSettings(): Promise<void> {
      throw new UnsupportedOperationError('goToSettings', 'http');
    },

    async openOrganizationSettings(): Promise<void> {
      throw new UnsupportedOperationError('openOrganizationSettings', 'http');
    },

    async issueNewTokenForAgentFromMembers(_memberName: string): Promise<string> {
      throw new UnsupportedOperationError('issueNewTokenForAgentFromMembers', 'http');
    },

    async logout(): Promise<void> {
      throw new UnsupportedOperationError('logout', 'http');
    },

    async requiresConfiguration(): Promise<boolean> {
      throw new UnsupportedOperationError('requiresConfiguration', 'http');
    },

    async shareContent(): Promise<Capture> {
      throw new UnsupportedOperationError('shareContent', 'http');
    },

    async goOffline(): Promise<void> {
      throw new UnsupportedOperationError('goOffline', 'http');
    },

    async goOnline(): Promise<void> {
      throw new UnsupportedOperationError('goOnline', 'http');
    },

    async shouldSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOfflineWarning', 'http');
    },

    async shouldNotSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeOfflineWarning', 'http');
    },

    async shouldBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeAbleToAddCaptures', 'http');
    },

    async shouldNotBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotBeAbleToAddCaptures', 'http');
    },

    async shouldSeeAssigneeOnTask(_taskId: string, _assigneeLabel: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeAssigneeOnTask', 'http');
    },

    async shouldNotSeeAssigneeOnTask(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeAssigneeOnTask', 'http');
    },

    async shouldSeeListOnTask(_taskId: string, _listName: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeListOnTask', 'http');
    },

    async shouldNotSeeListOnTask(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeListOnTask', 'http');
    },

    async shouldSeeTaskOnMine(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskOnMine', 'http');
    },

    async shouldNotSeeTaskOnMine(_taskId: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeTaskOnMine', 'http');
    },

    // Passkey operations
    async registerPasskey(_name?: string): Promise<PasskeyCredentialInfo> {
      // WebAuthn registration requires browser-level interaction or server-side mocking.
      // For full passkey testing, use the Playwright driver with CDP virtual authenticator.
      throw new UnsupportedOperationError('registerPasskey', 'http');
    },

    async listPasskeys(): Promise<PasskeyCredentialInfo[]> {
      const response = await client.get('/api/auth/passkey/credentials', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ credentials: PasskeyCredentialInfo[] }>().credentials;
    },

    async deletePasskey(credentialId: string): Promise<void> {
      const response = await client.delete(`/api/auth/passkey/credentials/${credentialId}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Passkey', credentialId);
      }
      if (response.statusCode === 403) {
        throw new UnauthorizedError('You do not own this passkey');
      }
      if (response.statusCode === 409) {
        throw new CannotDeleteLastPasskeyError();
      }
      // 200 is success
    },

    // API Token operations
    async listTokens(): Promise<Token[]> {
      const response = await client.get('/api/auth/tokens', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ tokens: Token[] }>().tokens;
    },

    async createToken(name: string): Promise<CreateTokenResult> {
      const response = await client.post('/api/auth/tokens', { name }, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        const error = response.json<{ message?: string }>();
        throw new ForbiddenError(error.message ?? 'Permission denied');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        throw new TokenLimitReachedError(2);
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create token: ${response.body}`);
      }
      return response.json<CreateTokenResult>();
    },

    async reissueAgentToken(memberUserId: string): Promise<{ token: Token; rawToken: string }> {
      const response = await client.post(
        `/api/organizations/${credentials.organizationId}/members/${memberUserId}/token`,
        {},
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        const error = response.json<{ message?: string }>();
        throw new ForbiddenError(error.message ?? 'Permission denied');
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Agent member', memberUserId);
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to reissue agent token: ${response.body}`);
      }
      return response.json<{ token: Token; rawToken: string }>();
    },

    async revokeToken(tokenId: string): Promise<void> {
      const response = await client.delete(`/api/auth/tokens/${tokenId}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Token', tokenId);
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('You do not own this token');
      }
      // 200 is success
    },

    async mintAgent(name: string): Promise<MintedAgent> {
      if (options.provisionAgent) {
        return options.provisionAgent(name);
      }

      const response = await client.post(
        `/api/organizations/${credentials.organizationId}/agents`,
        { name },
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Only owners and admins can mint agents');
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to mint agent: ${response.body}`);
      }
      return response.json<MintedAgent>();
    },

    async getSessionInfo(): Promise<{
      user: { id: string; email: string };
      organizationId: string;
      organizations: Array<{
        id: string;
        name: string;
        isPersonal: boolean;
        role: 'owner' | 'admin' | 'member';
      }>;
    }> {
      const response = await client.get('/api/auth/session', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{
        user: { id: string; email: string };
        organizationId: string;
        organizations: Array<{
          id: string;
          name: string;
          isPersonal: boolean;
          role: 'owner' | 'admin' | 'member';
        }>;
      }>();
    },

    async switchOrganization(_organizationId: string): Promise<void> {
      // Organization switching requires session-based auth (not token auth).
      // The HTTP driver uses token auth, so this operation is not supported.
      throw new UnsupportedOperationError('switchOrganization', 'http');
    },

    async shouldSeeCurrentOrganizationInHeader(_orgName: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCurrentOrganizationInHeader', 'http');
    },

    async shouldOpenOrgSwitcherPicker(_orgNames: string[]): Promise<void> {
      throw new UnsupportedOperationError('shouldOpenOrgSwitcherPicker', 'http');
    },

    async pickOrganizationFromHeader(_orgName: string): Promise<void> {
      throw new UnsupportedOperationError('pickOrganizationFromHeader', 'http');
    },

    async shouldSeeOrgSwitchFailureToast(_orgName: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOrgSwitchFailureToast', 'http');
    },

    async leaveOrganization(_organizationId: string): Promise<void> {
      // Leaving an organization requires session-based auth (not token auth).
      // The HTTP driver uses token auth, so this operation is not supported.
      throw new UnsupportedOperationError('leaveOrganization', 'http');
    },

    async listMembers(): Promise<Member[]> {
      const response = await client.get(
        `/api/organizations/${credentials.organizationId}/members`,
        authHeaders()
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 403) {
        throw new ForbiddenError('Not a member of this organization');
      }
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list members: ${response.body}`);
      }
      return response.json<{ members: Member[] }>().members;
    },

    async removeMember(_userId: string): Promise<void> {
      throw new UnsupportedOperationError('removeMember', 'http');
    },

    // Invitation management operations require session-based auth
    async createInvitation(_input?: { role?: 'admin' | 'member'; email?: string; expiresInDays?: number }): Promise<{ id: string; code: string; email: string | null; organizationId: string; role: 'admin' | 'member'; expiresAt: string; createdAt: string }> {
      throw new UnsupportedOperationError('createInvitation', 'http');
    },

    async listPendingInvitations(): Promise<{ id: string; code: string; email: string | null; organizationId: string; role: 'admin' | 'member'; expiresAt: string; createdAt: string }[]> {
      throw new UnsupportedOperationError('listPendingInvitations', 'http');
    },

    async revokeInvitation(_invitationId: string): Promise<void> {
      throw new UnsupportedOperationError('revokeInvitation', 'http');
    },

    async acceptInvitation(_code: string): Promise<{ organizationId: string; organizationName: string; role: 'admin' | 'member' }> {
      throw new UnsupportedOperationError('acceptInvitation', 'http');
    },
  };
};

/**
 * HTTP implementation of AnonymousActor.
 * All requests are made without authentication and should throw UnauthorizedError.
 */
export const createHttpAnonymousActor = (client: HttpClient): AnonymousActor => ({
  async createCapture(input: CreateCaptureInput): Promise<Capture> {
    const response = await client.post('/api/captures', input);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    // Shouldn't get here, but handle it
    return response.json<Capture>();
  },

  async listCaptures(): Promise<Capture[]> {
    const response = await client.get('/api/captures');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ captures: Capture[] }>().captures;
  },

  async getCapture(id: string): Promise<Capture> {
    const response = await client.get(`/api/captures/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Capture', id);
    }
    return response.json<Capture>();
  },

  async listNamedLists(): Promise<NamedList[]> {
    const response = await client.get('/api/lists');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ lists: NamedList[] }>().lists;
  },

  async createNamedList(name: string): Promise<NamedList> {
    const response = await client.post('/api/lists', { name });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    return response.json<NamedList>();
  },

  async renameNamedList(id: string, name: string): Promise<NamedList> {
    const response = await client.patch(`/api/lists/${id}`, { name });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    return response.json<NamedList>();
  },

  async deleteNamedList(id: string): Promise<void> {
    const response = await client.delete(`/api/lists/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
  },

  async listOpenTasksOnList(listId: string): Promise<Task[]> {
    const response = await client.get(`/api/lists/${listId}/tasks`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list open tasks on list: ${response.body}`);
  },

  async listOpenTasksOnProject(projectId: string): Promise<Task[]> {
    const response = await client.get(`/api/projects/${projectId}/tasks`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list open tasks on project: ${response.body}`);
  },

  async listFinishedTasksOnProject(
    projectId: string,
    _query?: { limit?: number; cursor?: string }
  ) {
    const response = await client.get(`/api/projects/${projectId}/tasks?status=finished`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list finished tasks: ${response.body}`);
  },

  async listProjectHistory(
    projectId: string,
    _query?: { limit?: number; cursor?: string }
  ) {
    const response = await client.get(`/api/projects/${projectId}/history`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list project history: ${response.body}`);
  },

  async listTaskHistory(taskId: string, _query?: { limit?: number; cursor?: string }) {
    const response = await client.get(`/api/tasks/${taskId}/history`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list task history: ${response.body}`);
  },

  async expectInvalidProjectHistoryCursor(projectId: string, cursor: string) {
    const response = await client.get(
      `/api/projects/${projectId}/history?cursor=${encodeURIComponent(cursor)}`
    );
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Expected 400 invalid_cursor, got ${response.statusCode}`);
  },

  async reorderOpenTasksOnList(listId: string, _taskIds: string[]): Promise<Task[]> {
    const response = await client.put(`/api/lists/${listId}/tasks/order`, {
      taskIds: _taskIds,
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to reorder open tasks: ${response.body}`);
  },

  async listUnlistedOpenTasks(): Promise<Task[]> {
    const response = await client.get('/api/unlisted/tasks');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to list unlisted open tasks: ${response.body}`);
  },

  async reorderUnlistedOpenTasks(_taskIds: string[]): Promise<Task[]> {
    const response = await client.put('/api/unlisted/tasks/order', {
      taskIds: _taskIds,
    });
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    throw new Error(`Failed to reorder unlisted open tasks: ${response.body}`);
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    const response = await client.post('/api/tasks', input);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Project', input.projectId ?? 'unknown');
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    if (response.statusCode !== 201) {
      throw new Error(`Failed to create task: ${response.body}`);
    }
    return response.json<Task>();
  },

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    const response = await client.patch(`/api/tasks/${id}`, input);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Task', id);
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    return response.json<Task>();
  },
});
