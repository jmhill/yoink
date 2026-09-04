import type {
  Actor,
  AnonymousActor,
  Capture,
  NamedList,
  Task,
  Token,
  CreateTokenResult,
  PasskeyCredentialInfo,
  CreateCaptureInput,
  UpdateCaptureInput,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
  MintedAgent,
  Member,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  UnsupportedOperationError,
  ConflictError,
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
export const createHttpActor = (
  client: HttpClient,
  credentials: ActorCredentials
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

    async moveOpenTask(_title: string, _direction: 'up' | 'down'): Promise<void> {
      throw new UnsupportedOperationError('moveOpenTask', 'http');
    },

    async refreshOpenList(): Promise<void> {
      throw new UnsupportedOperationError('refreshOpenList', 'http');
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

    async shouldSeePinControls(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeePinControls', 'http');
    },

    async shouldSeeTaskFilterWithoutAllPile(
      _filter: 'today' | 'upcoming' | 'mine' | 'completed'
    ): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeTaskFilterWithoutAllPile', 'http');
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

    async shouldSeeInboxCountOnRail(_count: number): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxCountOnRail', 'http');
    },

    async shouldNotSeeInboxCountOnRail(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeInboxCountOnRail', 'http');
    },

    async shouldSeeListsHeadingAboveNamedList(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeListsHeadingAboveNamedList', 'http');
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

    async shouldSeeNamedListOverflowOnRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeNamedListOverflowOnRail', 'http');
    },

    async shouldNotSeeNamedListOverflowOnRail(_label: string): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeNamedListOverflowOnRail', 'http');
    },

    async deleteNamedListFromRail(_name: string): Promise<void> {
      throw new UnsupportedOperationError('deleteNamedListFromRail', 'http');
    },

    async shouldBeOnTaskFilter(
      _filter: 'today' | 'upcoming' | 'mine' | 'completed' | 'all'
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

    async openRailInbox(): Promise<void> {
      throw new UnsupportedOperationError('openRailInbox', 'http');
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

    async shouldSeeRailInboxHighlighted(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeRailInboxHighlighted', 'http');
    },

    async shouldSeeCaptureOnCurrentPane(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeCaptureOnCurrentPane', 'http');
    },

    async shouldSeeInboxCaptureActions(_content: string): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeInboxCaptureActions', 'http');
    },

    async shouldSeeQuickAddCapture(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeQuickAddCapture', 'http');
    },

    async shouldNotSeeQuickAddCapture(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeQuickAddCapture', 'http');
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

    // Task operations
    async createTask(input: CreateTaskInput): Promise<Task> {
      const response = await client.post('/api/tasks', input, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
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

    async listTasks(filter?: TaskFilter): Promise<Task[]> {
      const query = filter ? `?filter=${filter}` : '';
      const response = await client.get(`/api/tasks${query}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ tasks: Task[] }>().tasks;
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
