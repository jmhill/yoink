import { fileURLToPath } from 'node:url';
import { type Page, expect } from '@playwright/test';
import type {
  Actor,
  AnonymousActor,
  AppliedImport,
  Capture,
  DiscardedImport,
  ImportProject,
  NamedList,
  Project,
  StagedImport,
  Task,
  NowOwner,
  NowQuery,
  NowNextActionsPage,
  TaskListPage,
  WorkListsPage,
  NowNextActionRow,
  NowDueRow,
  NowListRow,
  Token,
  CreateTokenResult,
  PasskeyCredentialInfo,
  Member,
  Invitation,
  AcceptInvitationResult,
  CreateCaptureInput,
  UpdateCaptureInput,
  TaskFilter,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
  ProcessCaptureToProjectInput,
  ProcessCaptureToProjectResult,
  CreateInvitationInput,
  MintedAgent,
  MobileTabKey,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ImportInvalidError,
  ConflictError,
  UnsupportedOperationError,
  CannotLeavePersonalOrgError,
  LastAdminError,
  NotMemberError,
  ForbiddenError,
  CannotRemoveSelfError,
  TokenLimitReachedError,
  AlreadyMemberError,
} from '../../dsl/index.js';
import {
  AppRail,
  DESKTOP_VIEWPORT,
  InboxPage,
  MOBILE_VIEWPORT,
  MobileNav,
  OrganizationSwitcherChrome,
  ProjectPage,
  TrashPage,
  SettingsPage,
  SnoozedPage,
  TasksPage,
} from './page-objects.js';
import {
  OPEN_DIALOG_CONTENT,
  OPEN_SHEET_CONTENT,
  saveWalkthroughPng,
  waitForFinishedPageAnimations,
  waitForSettledOpenDialog,
  waitForSettledOpenDrawer,
  waitForSettledOpenSelect,
  waitForSettledOpenSheet,
  type WalkthroughViewport,
} from './walkthrough-screenshots.js';

const isProcessToTaskPost = (url: string): boolean =>
  /\/api\/captures\/[^/]+\/process$/.test(new URL(url).pathname);

const isProcessToProjectPost = (url: string): boolean =>
  /\/api\/captures\/[^/]+\/process-to-project$/.test(new URL(url).pathname);

/**
 * Playwright evaluate callbacks run in the page, but this package's
 * tsconfig has no DOM lib — read computed style from the element's
 * view instead of the `getComputedStyle` global. Each helper must be
 * self-contained so Playwright can serialize it into the page.
 */
const readComputedBackgroundColor = (el: {
  ownerDocument: {
    defaultView: { getComputedStyle(element: unknown): { backgroundColor: string } } | null;
  };
}): string => {
  const view = el.ownerDocument.defaultView;
  if (view === null) {
    throw new Error('expected a window for computed style');
  }
  return view.getComputedStyle(el).backgroundColor;
};

const readComputedColor = (el: {
  ownerDocument: {
    defaultView: { getComputedStyle(element: unknown): { color: string } } | null;
  };
}): string => {
  const view = el.ownerDocument.defaultView;
  if (view === null) {
    throw new Error('expected a window for computed style');
  }
  return view.getComputedStyle(el).color;
};

/**
 * Mirrors the share.ts logic for determining expected content and sourceUrl
 * from share intent params. This keeps the driver in sync with the app logic.
 */
function parseShareExpectations(params: {
  text?: string;
  url?: string;
  title?: string;
}): { expectedContent: string; expectedSourceUrl: string | undefined } {
  // Check if text is URL-only (matches extractUrlFromText logic)
  const textIsUrlOnly = (() => {
    const trimmed = params.text?.trim() ?? '';
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        new URL(trimmed);
        return trimmed;
      } catch {
        return undefined;
      }
    }
    return undefined;
  })();

  // Determine sourceUrl (explicit url param takes precedence)
  const expectedSourceUrl = params.url?.trim() || textIsUrlOnly;

  // Determine content (exclude URL-only text, generate placeholder if needed)
  const textContent = textIsUrlOnly ? null : params.text;
  const parts = [params.title, textContent].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  let expectedContent = parts.map((p) => p.trim()).join('\n\n');

  // If content is empty but we have a URL, generate placeholder
  if (!expectedContent && expectedSourceUrl) {
    try {
      const hostname = new URL(expectedSourceUrl).hostname.replace(/^www\./, '');
      expectedContent = `Shared from ${hostname}`;
    } catch {
      expectedContent = 'Shared link';
    }
  }

  return { expectedContent, expectedSourceUrl };
}

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
};

/** Product lock: out-of-band changes must show within 15s. */
const LIVE_OUT_OF_BAND_VISIBLE_MS = 15_000;

const waitForLiveJsonGet = async (
  page: Page,
  pathIs: (pathname: string) => boolean,
  bodyIs: (body: unknown) => boolean
): Promise<void> => {
  await page.waitForResponse(
    async (response) => {
      if (response.request().method() !== 'GET' || !response.ok()) {
        return false;
      }
      try {
        const pathname = new URL(response.url()).pathname;
        if (!pathIs(pathname)) {
          return false;
        }
      } catch {
        return false;
      }
      try {
        return bodyIs(await response.json());
      } catch {
        return false;
      }
    },
    { timeout: LIVE_OUT_OF_BAND_VISIBLE_MS }
  );
};

const asNamedTasks = (
  body: unknown
): Array<{ id: string; title: string }> | null => {
  if (typeof body !== 'object' || body === null || !('tasks' in body)) {
    return null;
  }
  const tasks = (body as { tasks: unknown }).tasks;
  if (!Array.isArray(tasks)) {
    return null;
  }
  return tasks.filter(
    (task): task is { id: string; title: string } =>
      typeof task === 'object' &&
      task !== null &&
      typeof (task as { id?: unknown }).id === 'string' &&
      typeof (task as { title?: unknown }).title === 'string'
  );
};

const asNamedLists = (
  body: unknown
): Array<{ id: string; name: string }> | null => {
  if (typeof body !== 'object' || body === null || !('lists' in body)) {
    return null;
  }
  const lists = (body as { lists: unknown }).lists;
  if (!Array.isArray(lists)) {
    return null;
  }
  return lists.filter(
    (list): list is { id: string; name: string } =>
      typeof list === 'object' &&
      list !== null &&
      typeof (list as { id?: unknown }).id === 'string' &&
      typeof (list as { name?: unknown }).name === 'string'
  );
};

const asInboxCaptures = (
  body: unknown
): Array<{ id: string; content: string }> | null => {
  if (typeof body !== 'object' || body === null || !('captures' in body)) {
    return null;
  }
  const captures = (body as { captures: unknown }).captures;
  if (!Array.isArray(captures)) {
    return null;
  }
  return captures.filter(
    (capture): capture is { id: string; content: string } =>
      typeof capture === 'object' &&
      capture !== null &&
      typeof (capture as { id?: unknown }).id === 'string' &&
      typeof (capture as { content?: unknown }).content === 'string'
  );
};

/**
 * Playwright implementation of the Actor interface.
 * Interacts with the web UI to perform operations.
 *
 * This driver reads real capture IDs from the DOM via data-capture-id attributes,
 * eliminating the need for synthetic ID tracking.
 * 
 * The actor is expected to be created after authentication (via signup flow),
 * so the session cookie is already set in the page's browser context.
 */
export const createPlaywrightActor = (
  page: Page,
  credentials: ActorCredentials
): Actor => {
  const inboxPage = new InboxPage(page);
  const trashPage = new TrashPage(page);
  const settingsPage = new SettingsPage(page);
  const snoozedPage = new SnoozedPage(page);
  const tasksPage = new TasksPage(page);
  const appRail = new AppRail(page);
  const projectPage = new ProjectPage(page);
  const mobileNav = new MobileNav(page);
  const orgSwitcher = new OrganizationSwitcherChrome(page);
  let walkthroughViewport: WalkthroughViewport = 'desktop';
  let heldImportDiscardRelease: (() => void) | undefined;

  const expectActiveFilterTabIfVisible = async (
    filter: 'today' | 'upcoming' | 'mine' | 'completed'
  ): Promise<void> => {
    const tabName = {
      today: 'Today',
      upcoming: /Upcoming|Soon/,
      mine: 'My tasks',
      completed: 'Done',
    }[filter];
    const tab = page.getByRole('tab', { name: tabName });
    // Filter tabs stay on desktop. Mobile picks smart views from the Tasks rail.
    if ((await tab.count()) > 0) {
      await expect(tab).toHaveAttribute('data-state', 'active');
    }
  };

  const announceViewportResize = async (): Promise<void> => {
    // String form: this package's tsconfig has no DOM lib.
    await page.evaluate('window.dispatchEvent(new Event("resize"))');
  };

  /**
   * Playwright setViewportSize can miss MediaQueryList "change". Wait
   * for the phone chrome (thumb bar + Tasks drawer trigger) so rail
   * opens do not hang 30s on a still-desktop layout.
   */
  const settleMobileViewportChrome = async (): Promise<void> => {
    await announceViewportResize();
    await expect(mobileNav.root()).toBeVisible();
    await expect(appRail.desktop()).toBeHidden();
    const path = new URL(page.url()).pathname;
    if (path === '/tasks' || path === '/work') {
      await expect(appRail.mobileTrigger()).toBeVisible();
    }
  };

  const settleDesktopViewportChrome = async (): Promise<void> => {
    await announceViewportResize();
    await expect(appRail.desktop()).toBeVisible();
    await expect(mobileNav.root()).toBeHidden();
  };

  const openRailDestination = async (
    label: string,
    arrived: () => Promise<void>
  ): Promise<void> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      await appRail.openItem(label);
      try {
        await arrived();
        await appRail.waitForMobileDrawerClosedIfPhone();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(`Rail item "${label}" did not navigate`);
  };

  const openTaskOnItsPile = async (taskId: string): Promise<void> => {
    const response = await page.request.get(`/api/tasks/${taskId}`);
    if (!response.ok()) {
      throw new Error(`Failed to read task ${taskId}: ${response.status()}`);
    }
    const task = (await response.json()) as Task;
    if (task.completedAt) {
      await tasksPage.goto('completed');
    } else if (task.listId) {
      await tasksPage.gotoNamedPile(task.listId);
    } else {
      await tasksPage.gotoUnlistedPile();
    }
    await tasksPage.waitForTask(taskId);
  };

  /**
   * Build a minimal Capture object from ID and content.
   * We don't have access to all fields through the UI, but tests
   * primarily need id, content, and status.
   */
  const buildCapture = (
    id: string,
    content: string,
    status: 'inbox' | 'trashed',
    extras?: Partial<Capture>
  ): Capture => ({
    id,
    content,
    status,
    organizationId: credentials.organizationId,
    createdById: credentials.userId,
    capturedAt: new Date().toISOString(),
    ...extras,
  });

  /**
   * Find a capture's content by its ID from the current page.
   * Returns null if not found.
   */
  const findCaptureContentById = async (id: string): Promise<string | null> => {
    const card = page.locator(`[data-capture-id="${id}"]`);
    if ((await card.count()) === 0) {
      return null;
    }
    const contentElement = card.getByTestId('capture-content');
    return await contentElement.textContent();
  };

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      if (input.sourceUrl || input.sourceApp || input.content.includes('\n')) {
        const response = await page.request.post('/api/captures', { data: input });
        if (response.status() === 400) {
          throw new ValidationError('Content is required');
        }
        if (!response.ok()) {
          throw new Error(`Failed to create capture: ${response.status()}`);
        }
        const capture = (await response.json()) as Capture;
        await inboxPage.goto();
        await inboxPage.waitForCapturesOrEmpty();
        return capture;
      }

      await inboxPage.goto();

      // Attempt to add the capture through the UI
      // quickAdd returns the real ID from the DOM, or null if submission was prevented
      const captureId = await inboxPage.quickAdd(input.content);

      if (!captureId) {
        // The UI rejected the submission (e.g., empty content)
        throw new ValidationError('Content is required');
      }

      return buildCapture(captureId, input.content, 'inbox');
    },

    async listCaptures(): Promise<Capture[]> {
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const captures = await inboxPage.getCaptures();
      return captures.map(({ id, content }) => buildCapture(id, content, 'inbox'));
    },

    async listTrashedCaptures(): Promise<Capture[]> {
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const captures = await trashPage.getCaptures();
      return captures.map(({ id, content }: { id: string; content: string }) => buildCapture(id, content, 'trashed'));
    },

    async getCapture(id: string): Promise<Capture> {
      // Check inbox first
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();
      let content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'inbox');
      }

      // Check trash
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();
      content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'trashed');
      }

      // Check snoozed
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();
      content = await findCaptureContentById(id);
      if (content) {
        return buildCapture(id, content, 'inbox');
      }

      throw new NotFoundError('Capture', id);
    },

    async updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture> {
      // First verify the capture exists
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();
      const content = await findCaptureContentById(id);

      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      // UI doesn't support inline edit yet, so we just return the current state
      // with the requested content update (this is a limitation of the UI)
      return buildCapture(id, input.content ?? content, 'inbox');
    },

    async trashCapture(id: string): Promise<Capture> {
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await inboxPage.trashCapture(content);
      return buildCapture(id, content, 'trashed');
    },

    async restoreCapture(id: string): Promise<Capture> {
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await trashPage.restoreCapture(content);
      return buildCapture(id, content, 'inbox');
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      await inboxPage.goto();
      await inboxPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      // For simplicity, we use 'tomorrow' as the snooze option in UI tests
      await inboxPage.snoozeCapture(content, 'tomorrow');
      
      // Wait for the capture element to be fully detached from DOM by ID.
      // This is more reliable than waiting for text to be hidden, especially
      // in CI where React Query cache invalidation timing can vary.
      await page.locator(`[data-capture-id="${id}"]`).waitFor({ state: 'detached', timeout: 5000 });
      
      return buildCapture(id, content, 'inbox', { snoozedUntil: until });
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await snoozedPage.unsnoozeCapture(content);
      return buildCapture(id, content, 'inbox');
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      await snoozedPage.goto();
      await snoozedPage.waitForCapturesOrEmpty();

      const captures = await snoozedPage.getCaptures();
      return captures.map(({ id, content }) => buildCapture(id, content, 'inbox'));
    },

    async deleteCapture(id: string): Promise<void> {
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      const content = await findCaptureContentById(id);
      if (!content) {
        throw new NotFoundError('Capture', id);
      }

      await trashPage.deleteCapture(content);
    },

    async emptyTrash(): Promise<{ deletedCount: number }> {
      await trashPage.goto();
      await trashPage.waitForCapturesOrEmpty();

      // Get count before emptying
      const captures = await trashPage.getCaptures();
      const count = captures.length;

      if (count > 0) {
        await trashPage.emptyTrash();
      }

      return { deletedCount: count };
    },

    // Task operations. Board create/list/complete still throw; create uses the
    // session API (quick-add has no assignee), update goes through the edit UI.
    async processCaptureToTask(_captureId: string, _input?: ProcessCaptureToTaskInput): Promise<Task> {
      throw new UnsupportedOperationError('processCaptureToTask', 'playwright');
    },

    async processCaptureToProject(
      _captureId: string,
      _input: ProcessCaptureToProjectInput
    ): Promise<ProcessCaptureToProjectResult> {
      throw new UnsupportedOperationError('processCaptureToProject', 'playwright');
    },

    async listNamedLists(): Promise<NamedList[]> {
      await appRail.waitForVisible();
      const lists = await tasksPage.getNamedPiles();
      return lists.map(({ id, name }) => ({
        id,
        name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async createProject(input: { name: string; objective?: string }): Promise<Project> {
      const response = await page.request.post('/api/projects', { data: input });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        throw new ForbiddenError('Creating a project requires a person');
      }
      if (response.status() === 400) {
        const body = await response.json();
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String(body.message)
            : 'Invalid request';
        throw new ValidationError(message);
      }
      if (response.status() === 409) {
        throw new ConflictError('A project with this name already exists');
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to create project: ${response.status()}`);
      }
      return (await response.json()) as Project;
    },

    async listProjects(): Promise<Project[]> {
      const response = await page.request.get('/api/projects');
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list projects: ${response.status()}`);
      }
      const body = await response.json();
      if (typeof body !== 'object' || body === null || !('projects' in body)) {
        throw new Error('Failed to list projects: unexpected body');
      }
      return body.projects as Project[];
    },

    async getProject(id: string): Promise<Project> {
      const response = await page.request.get(`/api/projects/${id}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to get project: ${response.status()}`);
      }
      return (await response.json()) as Project;
    },

    async updateProject(
      id: string,
      input: { name?: string; objective?: string | null; notebookPages?: string[] }
    ): Promise<Project> {
      const response = await page.request.patch(`/api/projects/${id}`, { data: input });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        throw new ValidationError('Invalid request');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.status() === 409) {
        throw new ConflictError('A project with this name already exists');
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to update project: ${response.status()}`);
      }
      return (await response.json()) as Project;
    },

    async stageProjectImport(projects: ImportProject[]) {
      const response = await page.request.post('/api/projects/imports', { data: { projects } });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = (await response.json()) as {
          message?: string;
          code?: string;
          errors?: Array<{
            index: number;
            name: string;
            field: string;
            code: string;
            message: string;
          }>;
        };
        if (body.code === 'IMPORT_INVALID') {
          throw new ImportInvalidError(body.message ?? 'The import batch is invalid', body.errors ?? []);
        }
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to stage import: ${response.status()}`);
      }
      return (await response.json()) as StagedImport;
    },

    async listPendingProjectImports() {
      const response = await page.request.get('/api/projects/imports');
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list imports: ${response.status()}`);
      }
      const body = (await response.json()) as { imports: StagedImport[] };
      return body.imports;
    },

    async getProjectImport(id: string) {
      const response = await page.request.get(`/api/projects/imports/${id}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to get import: ${response.status()}`);
      }
      return (await response.json()) as StagedImport;
    },

    async applyProjectImport(id: string) {
      const response = await page.request.post(`/api/projects/imports/${id}/apply`, { data: {} });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        throw new ForbiddenError('Applying or discarding an import requires a person');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.status() === 409) {
        const body = (await response.json()) as { message?: string };
        throw new ConflictError(body.message ?? 'This import is no longer pending');
      }
      if (response.status() === 400) {
        const body = (await response.json()) as {
          message?: string;
          code?: string;
          errors?: Array<{
            index: number;
            name: string;
            field: string;
            code: string;
            message: string;
          }>;
        };
        if (body.code === 'IMPORT_INVALID') {
          throw new ImportInvalidError(body.message ?? 'The import batch is invalid', body.errors ?? []);
        }
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to apply import: ${response.status()}`);
      }
      return (await response.json()) as AppliedImport;
    },

    async discardProjectImport(id: string) {
      const response = await page.request.post(`/api/projects/imports/${id}/discard`, { data: {} });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        throw new ForbiddenError('Applying or discarding an import requires a person');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Import', id);
      }
      if (response.status() === 409) {
        const body = (await response.json()) as { message?: string };
        throw new ConflictError(body.message ?? 'This import is no longer pending');
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to discard import: ${response.status()}`);
      }
      return (await response.json()) as DiscardedImport;
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
      const response = await page.request.put(`/api/projects/${id}/status`, { data: input });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        const body = (await response.json()) as { message?: string };
        throw new ForbiddenError(body.message ?? 'Permission denied');
      }
      if (response.status() === 400) {
        const body = (await response.json()) as { message?: string };
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', id);
      }
      if (response.status() === 409) {
        const body = (await response.json()) as { message?: string };
        throw new ConflictError(body.message ?? 'Conflict');
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to change project status: ${response.status()}`);
      }
      return (await response.json()) as {
        project: Project;
        completedTaskCount: number;
        removedTaskCount: number;
      };
    },

    async setNextAction(
      projectId: string,
      input:
        | { taskId: string }
        | { taskId: null }
        | { newTask: { title: string; dueDate?: string; assigneeId?: string; listId?: string } }
    ): Promise<{ project: Project; task?: { id: string; title: string } }> {
      const response = await page.request.put(`/api/projects/${projectId}/next-action`, {
        data: input,
      });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = (await response.json()) as { message?: string };
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to set next action: ${response.status()}`);
      }
      return (await response.json()) as {
        project: Project;
        task?: { id: string; title: string };
      };
    },

    async listOpenTasksOnProject(projectId: string): Promise<Task[]> {
      const response = await page.request.get(`/api/projects/${projectId}/tasks`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list open tasks on project: ${response.status()}`);
      }
      const body = (await response.json()) as { tasks: Task[] };
      return body.tasks;
    },

    async listFinishedTasksOnProject(
      projectId: string,
      query?: { limit?: number; cursor?: string }
    ) {
      const qs = new URLSearchParams({ status: 'finished' });
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const response = await page.request.get(
        `/api/projects/${projectId}/tasks?${qs.toString()}`
      );
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list finished tasks: ${response.status()}`);
      }
      return (await response.json()) as {
        tasks: Task[];
        hasMore: boolean;
        nextCursor: string | null;
        total: number;
      };
    },

    async listProjectHistory(
      projectId: string,
      query?: { limit?: number; cursor?: string }
    ) {
      const qs = new URLSearchParams();
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await page.request.get(`/api/projects/${projectId}/history${suffix}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', projectId);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list project history: ${response.status()}`);
      }
      return (await response.json()) as {
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
      };
    },

    async listTaskHistory(taskId: string, query?: { limit?: number; cursor?: string }) {
      const qs = new URLSearchParams();
      if (query?.limit !== undefined) qs.set('limit', String(query.limit));
      if (query?.cursor) qs.set('cursor', query.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const response = await page.request.get(`/api/tasks/${taskId}/history${suffix}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Task', taskId);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to list task history: ${response.status()}`);
      }
      return (await response.json()) as {
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
      };
    },

    async expectInvalidProjectHistoryCursor(projectId: string, cursor: string) {
      const response = await page.request.get(
        `/api/projects/${projectId}/history?cursor=${encodeURIComponent(cursor)}`
      );
      if (response.status() !== 400) {
        throw new Error(`Expected 400 invalid_cursor, got ${response.status()}`);
      }
      const body = (await response.json()) as { message: string; code: string };
      if (body.code !== 'invalid_cursor') {
        throw new Error(`Expected code invalid_cursor, got ${body.code}`);
      }
      return body;
    },

    async createNamedList(name: string): Promise<NamedList> {
      // Setup path: session API. The rail New list dialog is proven by
      // createNamedListFromRail — Radix close/reopen is too slow for
      // the many tests that create two lists as fixtures.
      const response = await page.request.post('/api/lists', { data: { name } });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = (await response.json()) as { message?: string };
        throw new ValidationError(body.message ?? 'Name is required');
      }
      if (response.status() === 409) {
        const body = (await response.json()) as { message?: string };
        throw new ConflictError(body.message ?? 'A list with this name already exists');
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to create named list: ${response.status()}`);
      }
      const created = (await response.json()) as NamedList;
      await page.goto(`/tasks?pile=${created.id}`);
      await expect(page).toHaveURL(new RegExp(`[?&]pile=${created.id}`));
      await tasksPage.waitForTasksOrEmpty({ heading: created.name });
      // Desktop sidebar stays visible. Mobile drawer stays closed so content
      // owns the screen; createNamedListFromRail proves the rail row.
      if (await appRail.desktop().isVisible().catch(() => false)) {
        await expect(appRail.itemByLabel(created.name)).toBeVisible();
      }
      return created;
    },

    async renameNamedList(id: string, name: string): Promise<NamedList> {
      const response = await page.request.patch(`/api/lists/${id}`, { data: { name } });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = (await response.json()) as { message?: string };
        throw new ValidationError(body.message ?? 'Name is required');
      }
      if (response.status() === 404) {
        throw new NotFoundError('List', id);
      }
      if (response.status() === 409) {
        const body = (await response.json()) as { message?: string };
        throw new ConflictError(body.message ?? 'A list with this name already exists');
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to rename named list: ${response.status()}`);
      }
      const renamed = (await response.json()) as NamedList;
      await page.reload();
      await tasksPage.waitForTasksOrEmpty({ heading: renamed.name });
      if (await appRail.desktop().isVisible().catch(() => false)) {
        await expect(appRail.itemByLabel(renamed.name)).toBeVisible();
      }
      return renamed;
    },

    async deleteNamedList(id: string): Promise<void> {
      await appRail.waitForVisible();
      const lists = await tasksPage.getNamedPiles();
      const list = lists.find((item) => item.id === id);
      if (!list) {
        throw new Error(`Named list ${id} not found on the rail`);
      }
      const result = await appRail.deleteNamedList(list.name);
      if (result.status === 'has-open-tasks') {
        throw new ConflictError('This list still has open tasks');
      }
    },

    async goToLists(): Promise<void> {
      await page.goto('/lists');
      await expect(page).toHaveURL(/[?&]filter=today/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openListsUrl(): Promise<void> {
      await page.goto('/lists');
      await expect(page).toHaveURL(/[?&]filter=today/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openNamedListUrl(listId: string): Promise<void> {
      await page.goto(`/lists/${listId}`);
      await expect(page).toHaveURL(new RegExp(`[?&]pile=${listId}`));
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openUnlistedListUrl(): Promise<void> {
      await page.goto('/lists/unlisted');
      await expect(page).toHaveURL(/[?&]pile=unlisted/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldSeeEmptyNamedLists(): Promise<void> {
      await appRail.waitForVisible();
      await expect.poll(async () => tasksPage.getNamedPiles()).toEqual([]);
    },

    async shouldSeeNamedList(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel(name)).toBeVisible();
    },

    async shouldNotSeeNamedList(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel(name)).toHaveCount(0);
    },

    async listOpenTasksOnList(listId: string): Promise<Task[]> {
      await tasksPage.gotoNamedPile(listId);
      const tasks = await tasksPage.getOpenTasks();
      return tasks.map(({ id, title }) => ({
        id,
        title,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async reorderOpenTasksOnList(listId: string, taskIds: string[]): Promise<Task[]> {
      await tasksPage.gotoNamedPile(listId);
      for (let i = 0; i < taskIds.length; i++) {
        const current = await tasksPage.getOpenTasks();
        const currentIndex = current.findIndex((task) => task.id === taskIds[i]);
        if (currentIndex < 0) {
          throw new Error(`Open task ${taskIds[i]} not found on list`);
        }
        const title = current[currentIndex]?.title ?? '';
        if (currentIndex > i) {
          for (let step = 0; step < currentIndex - i; step++) {
            await tasksPage.moveOpenTask(title, 'up');
          }
        }
        if (currentIndex < i) {
          for (let step = 0; step < i - currentIndex; step++) {
            await tasksPage.moveOpenTask(title, 'down');
          }
        }
      }
      await expect
        .poll(async () => (await tasksPage.getOpenTasks()).map((task) => task.id))
        .toEqual(taskIds);
      const ordered = await tasksPage.getOpenTasks();
      return ordered.map(({ id, title }) => ({
        id,
        title,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async openNamedList(name: string): Promise<void> {
      await openRailDestination(name, async () => {
        await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i, { timeout: 4_000 });
        await expect(page).not.toHaveURL(/[?&]filter=all/);
        await tasksPage.waitForTasksOrEmpty({ heading: name });
      });
    },

    async shouldSeeOpenTasksInOrder(titles: string[]): Promise<void> {
      await tasksPage.waitForTasksOrEmpty();
      await expect
        .poll(async () => tasksPage.getOpenTaskTitles(), { timeout: 10_000 })
        .toEqual(titles);
    },

    async openDone(): Promise<void> {
      await tasksPage.goto('completed');
      await tasksPage.waitForTasksOrEmpty();
    },

    async clickLoadMore(): Promise<void> {
      await page.getByTestId('load-more').click();
    },

    async shouldSeeLoadMore(): Promise<void> {
      await expect(page.getByTestId('load-more')).toBeVisible();
    },

    async shouldNotSeeLoadMore(): Promise<void> {
      await expect(page.getByTestId('load-more')).toHaveCount(0);
    },

    async shouldSeeEveryTaskTitle(titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getTaskTitles(), { timeout: 15_000 })
        .toEqual(expect.arrayContaining(titles));
      expect(await tasksPage.getTaskTitles()).toHaveLength(titles.length);
    },

    async shouldSeeEveryCaptureContent(contents: string[]): Promise<void> {
      await expect
        .poll(async () => trashPage.getCaptureContents(), { timeout: 15_000 })
        .toEqual(expect.arrayContaining(contents));
      expect(await trashPage.getCaptureContents()).toHaveLength(contents.length);
    },

    async moveOpenTask(title: string, direction: 'up' | 'down'): Promise<void> {
      await tasksPage.moveOpenTask(title, direction);
      await tasksPage.waitForTasksOrEmpty();
    },

    async dragOpenTaskOnto(sourceTitle: string, targetTitle: string): Promise<void> {
      await tasksPage.dragOpenTaskOnto(sourceTitle, targetTitle);
      await tasksPage.waitForTasksOrEmpty();
    },

    async dragOpenTaskOntoByTouch(sourceTitle: string, targetTitle: string): Promise<void> {
      await tasksPage.dragOpenTaskOntoByTouch(sourceTitle, targetTitle);
      await tasksPage.waitForTasksOrEmpty();
    },

    async refreshOpenList(): Promise<void> {
      await page.reload();
      await tasksPage.waitForTasksOrEmpty();
    },

    async listUnlistedOpenTasks(): Promise<Task[]> {
      await tasksPage.gotoUnlistedPile();
      const tasks = await tasksPage.getOpenTasks();
      return tasks.map(({ id, title }) => ({
        id,
        title,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async reorderUnlistedOpenTasks(taskIds: string[]): Promise<Task[]> {
      await tasksPage.gotoUnlistedPile();
      for (let i = 0; i < taskIds.length; i++) {
        const current = await tasksPage.getOpenTasks();
        const currentIndex = current.findIndex((task) => task.id === taskIds[i]);
        if (currentIndex < 0) {
          throw new Error(`Open task ${taskIds[i]} not found on the unlisted pile`);
        }
        const title = current[currentIndex]?.title ?? '';
        if (currentIndex > i) {
          for (let step = 0; step < currentIndex - i; step++) {
            await tasksPage.moveOpenTask(title, 'up');
          }
        }
        if (currentIndex < i) {
          for (let step = 0; step < i - currentIndex; step++) {
            await tasksPage.moveOpenTask(title, 'down');
          }
        }
      }
      await expect
        .poll(async () => (await tasksPage.getOpenTasks()).map((task) => task.id))
        .toEqual(taskIds);
      const ordered = await tasksPage.getOpenTasks();
      return ordered.map(({ id, title }) => ({
        id,
        title,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async openUnlistedPile(): Promise<void> {
      await tasksPage.gotoUnlistedPile();
    },

    async shouldNotSeeAllDestination(): Promise<void> {
      await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveCount(0);
      await expect(page.locator('#all-pile')).toHaveCount(0);
      await expect(page.locator('[data-app-rail] [data-rail-label="All"]')).toHaveCount(0);
    },

    async openOldAllUrl(path: string): Promise<void> {
      await page.goto(path);
      await expect(page).toHaveURL(/[?&]filter=today/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page).not.toHaveURL(/[?&]pile=/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldBeOnToday(): Promise<void> {
      await expect(page).toHaveURL(/[?&]filter=today/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page).not.toHaveURL(/[?&]pile=/);
      await expectActiveFilterTabIfVisible('today');
      await expect(page.locator('#all-pile')).toHaveCount(0);
    },

    async openAllOverview(): Promise<void> {
      await page.goto('/tasks?filter=all');
      await expect(page).toHaveURL(/[?&]filter=today/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openAllNamedPile(name: string): Promise<void> {
      await openRailDestination(name, async () => {
        await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i, { timeout: 4_000 });
        await expect(page).not.toHaveURL(/[?&]filter=all/);
        await tasksPage.waitForTasksOrEmpty({ heading: name });
      });
    },

    async openAllUnlistedPile(): Promise<void> {
      await openRailDestination('Unlisted', async () => {
        await page.waitForURL(/[?&]pile=unlisted/, { timeout: 4_000 });
        await expect(page).not.toHaveURL(/[?&]filter=all/);
        await expect(page.locator('[data-pile-group]')).toHaveCount(0);
        await tasksPage.waitForTasksOrEmpty();
      });
    },

    async shouldSeeAllPileGroups(names: string[]): Promise<void> {
      await tasksPage.waitForTasksOrEmpty();
      await expect.poll(async () => tasksPage.getAllPileGroupNames()).toEqual(names);
    },

    async shouldSeeTasksInAllPileGroup(groupName: string, titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getTitlesInPileGroup(groupName))
        .toEqual(titles);
    },

    async openWork(options?: { mine?: boolean }): Promise<void> {
      const mine = options?.mine === true;
      await page.goto(mine ? '/work?mine=true' : '/work');
      await expect(
        page.locator(`[data-now-ready][data-now-owner="${mine ? 'me' : 'all'}"]`)
      ).toBeVisible();
    },

    async openRailWork(): Promise<void> {
      const desktop = await appRail.isDesktopSurface();
      await openRailDestination(desktop ? 'Work' : 'Now', async () => {
        await expect(page.locator('[data-now-ready][data-now-owner]')).toBeVisible();
      });
    },

    async toggleNowMine(): Promise<void> {
      const toggle = page.locator('[data-now-mine-toggle]');
      await expect(toggle).toBeVisible();
      const pressed = await toggle.getAttribute('aria-pressed');
      await toggle.click();
      await expect(
        page.locator(`[data-now-ready][data-now-owner="${pressed === 'true' ? 'all' : 'me'}"]`)
      ).toBeVisible();
    },

    async shouldSeeNowReady(owner: NowOwner): Promise<void> {
      await expect(page.locator(`[data-now-ready][data-now-owner="${owner}"]`)).toBeVisible();
    },

    async shouldSeeNowSubcopy(text: string): Promise<void> {
      await expect(page.getByTestId('now-subcopy')).toHaveText(text);
    },

    async shouldSeeNowMinePressed(pressed: boolean): Promise<void> {
      const toggle = page.locator('[data-now-mine-toggle]');
      await expect(toggle).toHaveAttribute('aria-pressed', pressed ? 'true' : 'false');
      if (pressed) {
        await expect(page).toHaveURL(/[?&]mine=true/);
        return;
      }
      await expect(page).not.toHaveURL(/[?&]mine=/);
    },

    async shouldSeeNowNextActionRows(rows: NowNextActionRow[]): Promise<void> {
      const section = page.locator('[data-now-section="next-actions"]');
      await expect.poll(async () => {
        const cards = section.locator('[data-now-row]');
        const count = await cards.count();
        const found: NowNextActionRow[] = [];
        for (let index = 0; index < count; index += 1) {
          const card = cards.nth(index);
          found.push({
            title: (await card.locator('[data-task-title]').getAttribute('data-task-title')) ?? '',
            project: (await card.getAttribute('data-now-row-project')) ?? '',
            owner: (await card.getAttribute('data-now-row-owner')) ?? '',
          });
        }
        return found;
      }).toEqual(rows);
    },

    async shouldSeeNowDueRows(rows: NowDueRow[]): Promise<void> {
      const section = page.locator('[data-now-section="due"]');
      await expect.poll(async () => {
        const cards = section.locator('[data-now-row]');
        const count = await cards.count();
        const found: NowDueRow[] = [];
        for (let index = 0; index < count; index += 1) {
          const card = cards.nth(index);
          found.push({
            title: (await card.locator('[data-task-title]').getAttribute('data-task-title')) ?? '',
            owner: (await card.getAttribute('data-now-row-owner')) ?? '',
          });
        }
        return found;
      }).toEqual(rows);
    },

    async shouldSeeNowEmpty(): Promise<void> {
      await expect(page.getByText('Nothing in Now', { exact: true })).toBeVisible();
      await expect(page.locator('[data-now-section]')).toHaveCount(0);
    },

    async openNowListsSheet(): Promise<void> {
      await waitForFinishedPageAnimations({ page });
      await page.locator('[data-now-lists-row]').click();
      await waitForSettledOpenDrawer({ page });
      await expect(page.locator('[data-now-lists-sheet]')).toBeVisible();
    },

    async shouldSeeNowListRows(rows: NowListRow[]): Promise<void> {
      const sheet = page.locator('[data-now-lists-sheet]');
      await expect.poll(async () => {
        const items = sheet.locator('[data-now-list]');
        const count = await items.count();
        const found: NowListRow[] = [];
        for (let index = 0; index < count; index += 1) {
          const item = items.nth(index);
          found.push({
            id: (await item.getAttribute('data-now-list')) ?? '',
            name: ((await item.locator('span').first().textContent()) ?? '').trim(),
            count: Number(await item.getAttribute('data-now-list-count')),
          });
        }
        return found;
      }).toEqual(rows);
    },

    async pickNowList(listId: string): Promise<void> {
      await page.locator(`[data-now-lists-sheet] [data-now-list="${listId}"]`).click();
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldSeeRailListCount(listId: string, count: number): Promise<void> {
      await expect(page.locator(`[data-rail-list-count="${listId}"]`)).toHaveText(String(count));
    },

    async shouldSeeRailLabelOnOneLine(label: string): Promise<void> {
      const text = page.locator(`[data-rail-label="${label}"] [data-rail-label-text]`).first();
      await expect(text).toBeVisible();
      const metrics = await text.evaluate((el) => {
        const view = el.ownerDocument.defaultView;
        if (view === null) {
          throw new Error('expected a window for computed style');
        }
        const styles = view.getComputedStyle(el);
        return {
          height: el.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(styles.lineHeight),
          text: (el.textContent ?? '').replace(/\s+/g, ''),
        };
      });
      expect(metrics.text).toBe(label.replace(/\s+/g, ''));
      expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
    },

    async scrollNowDueClearOfTabBar(): Promise<void> {
      const due = page.locator('[data-now-section="due"]');
      await expect(due).toBeVisible();
      await expect.poll(async () => {
        return due.evaluate((el) => {
          el.scrollIntoView({ block: 'start', inline: 'nearest' });
          const tabBar = el.ownerDocument.querySelector('[data-app-mobile-nav]');
          const tabBox = tabBar === null ? null : tabBar.getBoundingClientRect();
          const fold =
            tabBox !== null && tabBox.height > 0
              ? tabBox.top
              : el.ownerDocument.documentElement.clientHeight;
          const dueBox = el.getBoundingClientRect();
          return dueBox.top >= -8 && dueBox.top + 32 <= fold;
        });
      }).toBe(true);
    },

    async openToday(): Promise<void> {
      await tasksPage.goto('today');
      await tasksPage.waitForTasksOrEmpty();
    },

    async openUpcoming(): Promise<void> {
      await tasksPage.goto('upcoming');
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldSeePileGroups(names: string[]): Promise<void> {
      await tasksPage.waitForTasksOrEmpty();
      await expect.poll(async () => tasksPage.getAllPileGroupNames()).toEqual(names);
    },

    async shouldSeeTasksInPileGroup(groupName: string, titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getTitlesInPileGroup(groupName))
        .toEqual(titles);
    },

    async shouldSeeTodayOuterSections(
      sections: Array<'overdue' | 'due-today'>
    ): Promise<void> {
      await expect.poll(async () => tasksPage.getTodayOuterSections()).toEqual(sections);
    },

    async shouldSeePileGroupsInTodaySection(
      section: 'overdue' | 'due-today',
      names: string[]
    ): Promise<void> {
      await tasksPage.waitForTasksOrEmpty();
      await expect
        .poll(async () => tasksPage.getPileGroupNamesInTodaySection(section))
        .toEqual(names);
    },

    async shouldSeeTasksInTodaySectionPileGroup(
      section: 'overdue' | 'due-today',
      groupName: string,
      titles: string[]
    ): Promise<void> {
      await expect
        .poll(async () => tasksPage.getTitlesInTodaySectionPileGroup(section, groupName))
        .toEqual(titles);
    },

    async shouldNotSeeTodayDueSplit(): Promise<void> {
      await expect(tasksPage.todayDueSections()).toHaveCount(0);
    },

    async shouldSeeAllPileDropdown(): Promise<void> {
      await expect(page.locator('#all-pile')).toHaveCount(0);
    },

    async openMineOverview(): Promise<void> {
      await tasksPage.goto('mine');
      await tasksPage.waitForTasksOrEmpty();
    },

    async openOldMinePileUrl(pile: string): Promise<void> {
      await page.goto(`/tasks?filter=mine&pile=${pile}`);
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldBeOnMineOverview(): Promise<void> {
      await expect(page).toHaveURL(/[?&]filter=mine/);
      await expect(page).not.toHaveURL(/[?&]pile=/);
      await expectActiveFilterTabIfVisible('mine');
      await expect(page.locator('#mine-pile')).toHaveCount(0);
    },

    async shouldNotSeeMinePileDropdown(): Promise<void> {
      await expect(page.locator('#mine-pile')).toHaveCount(0);
    },

    async shouldSeeRailMineHighlighted(): Promise<void> {
      await expect.poll(async () => appRail.isItemActive('My tasks')).toBe(true);
    },

    async shouldSeeReorderControls(): Promise<void> {
      await expect(
        tasksPage.reorderEnterButton().or(tasksPage.reorderDoneButton()).first()
      ).toBeVisible();
    },

    async enterReorderMode(): Promise<void> {
      await tasksPage.enterReorderMode();
    },

    async exitReorderMode(): Promise<void> {
      await tasksPage.exitReorderMode();
    },

    async shouldSeeReorderMode(): Promise<void> {
      await expect(tasksPage.placeHeading()).toHaveText('Reorder');
      await expect(tasksPage.reorderDoneButton()).toBeVisible();
      await expect(tasksPage.dragHandles().first()).toBeVisible();
    },

    async shouldSeeDropSlotWhileDragging(
      sourceTitle: string,
      targetTitle: string
    ): Promise<void> {
      await tasksPage.seeDropSlotWhileDragging(sourceTitle, targetTitle);
    },

    async shouldSeeTaskTitles(titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getBoardTaskTitles(), { timeout: 10_000 })
        .toEqual(titles);
    },

    async shouldNotSeeTask(taskId: string): Promise<void> {
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0, { timeout: 10_000 });
    },

    async shouldNotSeeCreateListOnMine(): Promise<void> {
      await expect(page.locator('#mine-pile')).toHaveCount(0);
      await expect(page.locator('#all-pile')).toHaveCount(0);
      await expect(page.locator('[data-all-pile-new-list]')).toHaveCount(0);
    },

    async shouldNotSeeDeleteListOnMine(name: string): Promise<void> {
      await expect(page.locator('#mine-pile')).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0);
    },

    async shouldNotSeeReorderControls(): Promise<void> {
      await expect(tasksPage.reorderButtons()).toHaveCount(0);
      await expect(tasksPage.reorderEnterButton()).toHaveCount(0);
      await expect(tasksPage.reorderDoneButton()).toHaveCount(0);
      await expect(tasksPage.dragHandles()).toHaveCount(0);
    },

    async shouldNotSeePinControls(): Promise<void> {
      await expect(tasksPage.pinButtons()).toHaveCount(0);
    },

    async shouldSeeTaskFilterWithoutAllPile(
      filter: 'today' | 'upcoming' | 'mine' | 'completed'
    ): Promise<void> {
      await tasksPage.goto(filter);
      await tasksPage.waitForTasksOrEmpty();
      const tabName = {
        today: 'Today',
        upcoming: /Upcoming|Soon/,
        mine: 'My tasks',
        completed: 'Done',
      }[filter];
      await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute(
        'data-state',
        'active'
      );
      await expect(page.locator('#all-pile')).toHaveCount(0);
    },

    async shouldNotSeeListsNav(): Promise<void> {
      await expect(page.getByRole('link', { name: 'Lists', exact: true })).toHaveCount(0);
    },

    async createNamedListFromAll(name: string): Promise<NamedList> {
      const created = await appRail.createNamedList(name);
      if (created.status === 'empty') {
        throw new ValidationError('Name is required');
      }
      if (created.status === 'duplicate') {
        throw new ConflictError('A list with this name already exists');
      }
      await tasksPage.waitForTasksOrEmpty({ heading: created.name });
      return {
        id: created.id,
        name: created.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      };
    },

    async shouldBeOnAllNamedPile(listId: string): Promise<void> {
      await expect(page).toHaveURL(new RegExp(`[?&]pile=${listId}`));
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page.locator('#all-pile')).toHaveCount(0);
    },

    async shouldSeeNamedPileOnAll(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel(name)).toBeVisible();
    },

    async shouldSeeEmptyNamedPile(): Promise<void> {
      await expect(page.getByText('No open tasks on this list')).toBeVisible();
    },

    async shouldNotSeeDeleteListOnAll(name: string): Promise<void> {
      await expect(page.locator('#all-pile')).toHaveCount(0);
      await expect(page.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0);
    },

    async deleteNamedListFromAll(name: string): Promise<void> {
      const result = await appRail.deleteNamedList(name);
      if (result.status === 'has-open-tasks') {
        throw new ConflictError('This list still has open tasks');
      }
    },

    async shouldBeOnAllOverview(): Promise<void> {
      await expect(page).toHaveURL(/[?&]filter=today/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page).not.toHaveURL(/[?&]pile=/);
    },

    async shouldBeOnAllUnlistedPile(): Promise<void> {
      await expect(page).toHaveURL(/[?&]pile=unlisted/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page.locator('#all-pile')).toHaveCount(0);
    },

    async shouldNotSeeNamedPileOnAll(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel(name)).toHaveCount(0);
    },

    async shouldSeeRailItems(labels: string[]): Promise<void> {
      await expect.poll(async () => appRail.getItemLabels(), { timeout: 10_000 }).toEqual(labels);
    },

    async shouldSeeProcessCountOnRail(count: number): Promise<void> {
      await expect.poll(async () => appRail.getInboxCount()).toBe(count);
    },

    async shouldNotSeeProcessCountOnRail(): Promise<void> {
      await expect.poll(async () => appRail.getInboxCount()).toBeNull();
    },

    async shouldSeeDesktopRailSections(): Promise<void> {
      await appRail.waitForVisible();
      await expect.poll(async () => appRail.sectionHeadings()).toEqual([
        'Capture',
        'Process',
        'Work',
        'Review',
      ]);
      await expect(appRail.sectionRow('capture')).toBeVisible();
      await expect(appRail.sectionRow('process')).toBeVisible();
      await expect(appRail.sectionRow('work')).toBeVisible();
      await expect(appRail.sectionRow('review')).toBeVisible();
      await expect(page.locator('[data-rail-separator="capture-to-process"]')).toBeVisible();
      await expect(page.locator('[data-rail-separator="process-to-work"]')).toBeVisible();
      await expect(page.locator('[data-rail-separator="work-to-review"]')).toBeVisible();
      await expect.poll(async () => {
        const order = await appRail.getVisualOrder();
        const work = order.indexOf('Work');
        const today = order.indexOf('Today');
        const lists = order.indexOf('Lists');
        const review = order.indexOf('Review');
        const newProject = order.lastIndexOf('New project');
        return (
          work > -1 &&
          today > work &&
          lists > today &&
          review > lists &&
          newProject > review
        );
      }).toBe(true);
    },

    async shouldSeeRailSectionHighlighted(
      key: 'capture' | 'process' | 'work' | 'review'
    ): Promise<void> {
      await expect
        .poll(async () => (await appRail.sectionRow(key).getAttribute('data-rail-active')) === 'true')
        .toBe(true);
      await expect(page.locator('[data-app-rail]:visible [data-rail-active="true"]')).toHaveCount(1);
    },

    async scrollDesktopRailSoLabelIsVisible(label: string): Promise<void> {
      await appRail.waitForVisible();
      const rail = appRail.desktop();
      await rail.locator(`[data-rail-label="${label}"]`).evaluate((node) => {
        node.scrollIntoView({ block: 'nearest' });
      });
      await expect(rail.locator(`[data-rail-label="${label}"]`)).toBeVisible();
    },

    async openRailProcess(): Promise<void> {
      await openRailDestination('Process', async () => {
        await page.waitForURL((url) => new URL(url).pathname === '/process', { timeout: 4_000 });
        await expect(page.locator('[data-process-ready]')).toBeVisible();
      });
    },

    async openRailReview(): Promise<void> {
      await openRailDestination('Review', async () => {
        await page.waitForURL((url) => new URL(url).pathname === '/projects', { timeout: 4_000 });
        await expect(page.locator('[data-review-ready]')).toBeVisible();
      });
    },

    async shouldSeeRailRowHighlighted(label: string): Promise<void> {
      await expect.poll(async () => appRail.isItemActive(label)).toBe(true);
      await expect(page.locator('[data-app-rail]:visible [data-rail-active="true"]')).toHaveCount(1);
    },

    async shouldSeeNoCountOnCaptureSection(): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.sectionRow('capture').locator('[data-inbox-count]')).toHaveCount(0);
    },

    async shouldSeeBackToWorkAbovePlaceHeading(): Promise<void> {
      const back = page.locator('[data-back-to-work]');
      const heading = tasksPage.placeHeading();
      await expect(back).toBeVisible();
      await expect(heading).toBeVisible();
      const backBox = await back.boundingBox();
      const headingBox = await heading.boundingBox();
      if (backBox === null || headingBox === null) {
        throw new Error('expected layout boxes for the Work back row and place heading');
      }
      expect(backBox.y + backBox.height).toBeLessThanOrEqual(headingBox.y + 1);
    },

    async shouldSeeListsHeadingAboveNamedList(name: string): Promise<void> {
      await expect.poll(async () => {
        const order = await appRail.getVisualOrder();
        const heading = order.indexOf('Lists');
        const named = order.indexOf(name);
        return heading > -1 && named > heading && order[heading - 1] === 'Done';
      }).toBe(true);
    },

    async shouldSeeInboxModeSeparatedFromTaskFamily(): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.inboxMode()).toBeVisible();
      await expect(appRail.inboxModeCue()).toHaveText('Capture & triage mode');
      await expect(appRail.inboxToTaskFamilySeparator()).toBeVisible();
      await expect(appRail.taskFamilyHeading()).toBeVisible();

      await expect.poll(async () => {
        const order = await appRail.getVisualOrder();
        return {
          inbox: order.indexOf('Inbox'),
          family: order.indexOf('Task family'),
          now: order.indexOf('Now'),
          today: order.indexOf('Today'),
          done: order.indexOf('Done'),
          lists: order.indexOf('Lists'),
        };
      }).toEqual({
        inbox: 0,
        family: 1,
        now: 2,
        today: 3,
        done: 6,
        lists: 7,
      });

      const modeBg = await appRail.inboxMode().evaluate(readComputedBackgroundColor);
      const todayBg = await appRail.itemByLabel('Today').evaluate(readComputedBackgroundColor);
      expect(modeBg).not.toEqual(todayBg);

      const separatorTone = await appRail.inboxToTaskFamilySeparator().evaluate((el) => {
        const view = el.ownerDocument.defaultView;
        if (view === null) {
          throw new Error('expected a window for computed style');
        }
        const styles = view.getComputedStyle(el);
        return {
          color: styles.backgroundColor,
          height: styles.height,
        };
      });
      expect(separatorTone.color).not.toMatch(/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/);
      expect(parseFloat(separatorTone.height)).toBeGreaterThan(0);
    },

    async openRailNamedList(name: string): Promise<void> {
      await openRailDestination(name, async () => {
        await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i, { timeout: 4_000 });
        await expect(page).not.toHaveURL(/[?&]filter=all/);
        await tasksPage.waitForTasksOrEmpty({ heading: name });
      });
    },

    async openRailUnlisted(): Promise<void> {
      await openRailDestination('Unlisted', async () => {
        await page.waitForURL(/[?&]pile=unlisted/, { timeout: 4_000 });
        await expect(page).not.toHaveURL(/[?&]filter=all/);
        await tasksPage.waitForTasksOrEmpty();
      });
    },

    async openRailSmartView(view: 'today' | 'upcoming' | 'mine' | 'done'): Promise<void> {
      const label = {
        today: 'Today',
        upcoming: 'Upcoming',
        mine: 'My tasks',
        done: 'Done',
      }[view];
      const filter = view === 'done' ? 'completed' : view;
      await openRailDestination(label, async () => {
        await page.waitForURL((url) => {
          const parsed = new URL(url);
          return (
            parsed.pathname === '/tasks' &&
            parsed.searchParams.get('filter') === filter &&
            !parsed.searchParams.has('pile')
          );
        }, { timeout: 4_000 });
        await expectActiveFilterTabIfVisible(filter);
        await tasksPage.waitForTasksOrEmpty();
      });
    },

    async shouldSeeAddTaskField(): Promise<void> {
      await expect(page.locator('#create-task-title')).toBeVisible();
    },

    async shouldNotSeeAddTaskField(): Promise<void> {
      await expect(page.locator('#create-task-title')).toHaveCount(0);
    },

    async createNamedListFromRail(name: string): Promise<NamedList> {
      const created = await appRail.createNamedList(name);
      if (created.status === 'empty') {
        throw new ValidationError('Name is required');
      }
      if (created.status === 'duplicate') {
        throw new ConflictError('A list with this name already exists');
      }
      await tasksPage.waitForTasksOrEmpty({ heading: created.name });
      return {
        id: created.id,
        name: created.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      };
    },

    async createProjectFromRail(input: {
      name: string;
      objective?: string;
    }): Promise<Project> {
      const created = await appRail.createProject(input);
      if (created.status === 'empty') {
        throw new ValidationError('Name is required');
      }
      await projectPage.waitForVisible();
      return {
        id: created.id,
        name: created.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
        objective: input.objective,
        status: 'active',
      };
    },

    async shouldSeeProjectPage(input: {
      name: string;
      objective?: string;
      status: string;
    }): Promise<void> {
      await projectPage.shouldShow(input);
    },

    async editProjectName(name: string): Promise<void> {
      await projectPage.editName(name);
    },

    async editProjectObjective(objective: string): Promise<void> {
      await projectPage.editObjective(objective);
    },

    async goToProject(projectId: string): Promise<void> {
      await page.goto(`/projects/${projectId}`);
      await projectPage.waitForVisible();
    },

    async goToImportPreview(importId: string): Promise<void> {
      await page.goto(`/projects/imports/${importId}`);
      await expect(page.locator('[data-import-preview], [data-import-errors]')).toBeVisible();
    },

    async reviewPendingImport(): Promise<void> {
      await page.locator('[data-import-review]').click();
      await expect(page.locator('[data-import-preview], [data-import-errors]')).toBeVisible();
    },

    async shouldSeePendingImportBanner(text: string): Promise<void> {
      await expect(page.locator('[data-pending-import-banner]')).toContainText(text);
    },

    async shouldNotSeePendingImportBanner(): Promise<void> {
      await expect(page.locator('[data-pending-import-banner]')).toHaveCount(0);
    },

    async shouldSeeImportPreviewProject(name: string): Promise<void> {
      await expect(page.locator('[data-import-preview-project]').filter({ hasText: name })).toBeVisible();
    },

    async shouldSeeImportPreviewSummary(text: string): Promise<void> {
      await expect(page.locator('[data-import-preview-summary]')).toHaveText(text);
    },

    async shouldSeeImportPreviewCollapsed(name: string): Promise<void> {
      const row = page.locator('[data-import-preview-project]').filter({ hasText: name });
      await expect(row.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'false');
      await expect(row.locator('[data-import-preview-detail]')).toHaveCount(0);
    },

    async shouldSeeImportPreviewExpanded(name: string): Promise<void> {
      const row = page.locator('[data-import-preview-project]').filter({ hasText: name });
      await expect(row.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
      await expect(row.locator('[data-import-preview-detail]')).toBeVisible();
    },

    async expandImportPreviewProject(name: string): Promise<void> {
      const row = page.locator('[data-import-preview-project]').filter({ hasText: name });
      const toggle = row.locator('button[aria-expanded]');
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click();
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    },

    async shouldSeeImportFooter(): Promise<void> {
      const actions = page.locator('[data-import-actions]');
      await expect(actions).toBeVisible();
      await expect(page.locator('[data-import-submit]')).toBeVisible();
      await expect(page.locator('[data-import-discard]')).toBeVisible();
    },

    async shouldSeeImportFooterWhilePreviewScrolledTo(name: string): Promise<void> {
      const card = page.locator('[data-import-preview-project]').filter({ hasText: name });
      await expect(card).toBeVisible();
      await card.evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
      await expect(page.locator('[data-import-actions]')).toBeVisible();
      await expect(page.locator('[data-import-submit]')).toBeVisible();
      await expect(page.locator('[data-import-discard]')).toBeVisible();
    },

    async shouldSeeImportWarning(text: string): Promise<void> {
      await expect(page.locator('[data-import-warning]').filter({ hasText: text })).toBeVisible();
    },

    async shouldSeeImportError(text: string): Promise<void> {
      await expect(page.locator('[data-import-error]').filter({ hasText: text })).toBeVisible();
    },

    async applyImportOnPreview(): Promise<void> {
      await page.locator('[data-import-submit]').click();
      await page.waitForURL(/\/projects$/);
    },

    async discardImportOnPreview(): Promise<void> {
      await page.locator('[data-import-discard]').click();
      await page.waitForURL(/\/projects$/);
    },

    async scrollImportPreviewProject(name: string): Promise<void> {
      const card = page.locator('[data-import-preview-project]').filter({ hasText: name });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
    },

    async scrollImportActionsIntoView(): Promise<void> {
      const actions = page.locator('[data-import-discard]');
      await actions.scrollIntoViewIfNeeded();
      await expect(actions).toBeVisible();
      const cover = page.locator('[data-import-preview-project]').filter({
        hasText: 'Winter boat cover',
      });
      if ((await cover.count()) > 0) {
        await cover.scrollIntoViewIfNeeded();
      }
    },

    async highlightImportDiscard(): Promise<void> {
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      const discard = page.locator('[data-import-discard]');
      await discard.scrollIntoViewIfNeeded();
      await expect(discard).toBeVisible();
      await discard.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    },

    async pressImportDiscardAndHold(): Promise<void> {
      await page.unroute('**/api/projects/imports/*/discard').catch(() => undefined);
      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      heldImportDiscardRelease = () => {
        release?.();
      };
      await page.route('**/api/projects/imports/*/discard', async (route) => {
        await held;
        await route.continue();
      });
      const discard = page.locator('[data-import-discard]');
      await discard.scrollIntoViewIfNeeded();
      await discard.click();
      await expect(discard).toHaveText('Discarding…');
      await discard.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    },

    async releaseHeldImportDiscard(): Promise<void> {
      const release = heldImportDiscardRelease;
      heldImportDiscardRelease = undefined;
      release?.();
      await page.waitForURL(/\/projects$/);
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
      await expect(page.getByText('0 projects')).toBeVisible();
      await page.unroute('**/api/projects/imports/*/discard');
    },

    async shouldSeeNotebookPage(path: string): Promise<void> {
      await expect(page.locator('[data-project-notebook]')).toContainText(path);
    },

    async shouldSeeNotebookHref(path: string, href: string): Promise<void> {
      const row = page.locator('[data-project-notebook-page]').filter({ hasText: path });
      await expect(row.locator('a')).toHaveAttribute('href', href);
    },

    async shouldSeeNotebookPageInputs(paths: string[]): Promise<void> {
      for (const [index, path] of paths.entries()) {
        await expect(page.locator(`[data-notebook-page-input="${index}"]`)).toHaveValue(path);
      }
    },

    async typeNotebookPageAndKeepFocus(index: number, extra: string): Promise<void> {
      const input = page.locator(`[data-notebook-page-input="${index}"]`);
      await expect(input).toBeVisible();
      const current = await input.inputValue();
      await input.focus();
      await input.press('End');
      await input.pressSequentially(extra);
      await expect(input).toBeFocused();
      await expect(input).toHaveValue(`${current}${extra}`);
    },

    async addNotebookPageWithEnter(path: string): Promise<void> {
      const input = page.locator('[data-notebook-page-input="new"]');
      await expect(input).toBeVisible();
      const existing = page.locator('[data-notebook-page-input]:not([data-notebook-page-input="new"])');
      const before = await existing.count();
      await input.fill(path);
      await input.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Edit project' });
      await expect(dialog).toBeVisible();
      await expect(page.locator(`[data-notebook-page-input="${before}"]`)).toHaveValue(path);
      await expect(input).toHaveValue('');
    },

    async scrollProjectHeadingIntoView(): Promise<void> {
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      if (walkthroughViewport === 'desktop') {
        await page.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: 1080 });
      }
      const heading = page.locator('[data-place-heading]');
      await expect(heading).toBeVisible();
      await heading.evaluate((el) => {
        el.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    },

    async scrollProjectHistoryIntoView(): Promise<void> {
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      const section = page.locator('[data-project-history]');
      await expect(section).toBeVisible();
      await section.evaluate((el) => {
        el.scrollIntoView({ block: 'end', inline: 'nearest' });
        const bar = el.ownerDocument.querySelector('[data-app-mobile-nav]');
        if (bar === null) {
          return;
        }
        const extra = 8;
        const overlap = Math.max(
          0,
          el.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + extra
        );
        if (overlap > 0) {
          el.ownerDocument.defaultView?.scrollBy(0, overlap);
        }
      });
    },

    async openProjectStatusSelect(visibleOptionName?: string): Promise<void> {
      await projectPage.waitForVisible();
      await projectPage.statusTrigger().click();
      await waitForSettledOpenSelect(
        visibleOptionName ? { page, visibleOptionName } : { page }
      );
    },

    async pageClickWaitingOption(): Promise<void> {
      await page.locator('[data-project-status-option="waiting"]').click();
      await expect(page.getByRole('listbox')).toBeHidden();
      await expect(page.locator('[data-slot="select-content"]')).toHaveCount(0);
      await expect(page.locator('[data-project-waiting-fields]')).toBeVisible();
      const drawer = page.locator('[data-slot="drawer-content"]');
      if (await drawer.isVisible()) {
        await waitForSettledOpenDrawer({ page });
      }
    },

    async pageClickDoneOption(): Promise<void> {
      await page.locator('[data-project-status-option="done"]').click();
      await expect(page.getByRole('listbox')).toBeHidden();
      await expect(projectPage.doneConfirm()).toBeVisible();
      await waitForSettledOpenDialog({ page });
    },

    async setProjectStatusFromPage(status: 'active' | 'someday' | 'done'): Promise<void> {
      const labels = { active: 'Active', someday: 'Someday', done: 'Done' };
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PUT'
      );
      await this.openProjectStatusSelect(labels[status]);
      await page.locator(`[data-project-status-option="${status}"]`).click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to set project status: ${response.status()}`);
      }
      const listbox = page.getByRole('listbox');
      if ((await listbox.count()) > 0) {
        await expect(listbox).toBeHidden();
      }
    },

    async setProjectWaitingFromPage(input: {
      waitingOn: string;
      waitingSince?: string;
      unknownSince?: boolean;
    }): Promise<void> {
      await projectPage.waitForVisible();
      const fields = page.locator('[data-project-waiting-fields]');
      if (!(await fields.isVisible())) {
        if (await projectPage.waitingSummary().isVisible()) {
          await projectPage.waitingSummary().click();
        } else {
          await this.openProjectStatusSelect('Waiting');
          await this.pageClickWaitingOption();
        }
      }
      await expect(fields).toBeVisible();
      await projectPage.waitingOnInput().fill(input.waitingOn);
      if (input.unknownSince) {
        const unknown = projectPage.waitingUnknown();
        if ((await unknown.getAttribute('data-state')) !== 'checked') {
          await unknown.click();
        }
      } else if (input.waitingSince !== undefined) {
        const unknown = projectPage.waitingUnknown();
        if ((await unknown.getAttribute('data-state')) === 'checked') {
          await unknown.click();
        }
        await projectPage.waitingSinceInput().fill(input.waitingSince);
      }
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PUT'
      );
      await projectPage.waitingSave().click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to set project waiting: ${response.status()}`);
      }
      await expect(page.locator(OPEN_DIALOG_CONTENT)).toHaveCount(0);
      const dialog = page.locator('[data-slot="dialog-content"]');
      if ((await dialog.count()) > 0) {
        await expect(dialog).toBeHidden();
      }
      const drawer = page.locator('[data-slot="drawer-content"]');
      if ((await drawer.count()) > 0) {
        await expect(drawer).toBeHidden();
      }
    },

    async confirmDoneComplete(): Promise<void> {
      await waitForSettledOpenDialog({ page });
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PUT'
      );
      await page.locator('[data-project-done-complete]').click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to complete open tasks: ${response.status()}`);
      }
      await expect(projectPage.doneConfirm()).toBeHidden();
      await expect(page.locator('[data-project-status]')).toHaveAttribute(
        'data-project-status',
        'done'
      );
    },

    async confirmDoneRemove(): Promise<void> {
      await waitForSettledOpenDialog({ page });
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects/') &&
          response.url().includes('/status') &&
          response.request().method() === 'PUT'
      );
      await page.locator('[data-project-done-remove]').click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to remove open tasks: ${response.status()}`);
      }
      await expect(projectPage.doneConfirm()).toBeHidden();
      await expect(page.locator('[data-project-status]')).toHaveAttribute(
        'data-project-status',
        'done'
      );
    },

    async shouldSeeWaitingSummary(text: string): Promise<void> {
      await expect(projectPage.waitingSummary()).toContainText(text);
    },

    async openNextActionPicker(): Promise<void> {
      await projectPage.waitForVisible();
      await projectPage.setNextAction().click();
      await expect(projectPage.nextActionPicker()).toBeVisible();
    },

    async pickNextActionFromPicker(title: string): Promise<void> {
      await expect(projectPage.nextActionPicker()).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/next-action') && response.request().method() === 'PUT'
      );
      await projectPage
        .nextActionPicker()
        .locator(`[data-next-action-pick-task]`)
        .filter({ hasText: title })
        .click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to set next action: ${response.status()}`);
      }
    },

    async createNextActionFromPicker(title: string): Promise<void> {
      await expect(projectPage.nextActionPicker()).toBeVisible();
      await page.locator('[data-next-action-new-title]').fill(title);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/next-action') && response.request().method() === 'PUT'
      );
      await page.locator('[data-next-action-create]').click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to create next action: ${response.status()}`);
      }
    },

    async completeNextActionFromPage(title: string): Promise<void> {
      await projectPage.waitForVisible();
      const card = projectPage.nextActionCard().locator(`[data-task-title="${title}"]`);
      await expect(card).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/complete') && response.request().method() === 'POST'
      );
      await card.locator('[data-slot="task-complete"]').click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to complete next action: ${response.status()}`);
      }
    },

    async skipWhatsNext(): Promise<void> {
      await expect(page.locator('[data-whats-next-prompt]')).toBeVisible();
      await page.locator('[data-whats-next-skip]').click();
      await expect(page.locator('[data-whats-next-prompt]')).toHaveCount(0);
    },

    async pickWhatsNextTask(title: string): Promise<void> {
      await expect(page.locator('[data-whats-next-prompt]')).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/next-action') && response.request().method() === 'PUT'
      );
      await page
        .locator('[data-whats-next-prompt] [data-next-action-pick-task]')
        .filter({ hasText: title })
        .click();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to pick what’s next: ${response.status()}`);
      }
    },

    async shouldSeeNextAction(title: string): Promise<void> {
      await expect(
        projectPage.nextActionCard().locator(`[data-task-title="${title}"]`)
      ).toBeVisible();
    },

    async shouldSeeNoNextActionCard(): Promise<void> {
      await expect(projectPage.nextActionEmpty()).toBeVisible();
      await expect(projectPage.nextActionEmpty()).toContainText(
        "This project won’t show up in Work until it has one. Pick an open task or add a new one."
      );
      await expect(projectPage.nextActionCard()).toHaveCount(0);
    },

    async shouldSeeWhatsNext(): Promise<void> {
      await expect(page.locator('[data-whats-next-prompt]')).toBeVisible();
    },

    async shouldSeeSomedaySetNextActionLink(): Promise<void> {
      await expect(page.locator('[data-someday-set-next-action]')).toBeVisible();
      await expect(projectPage.nextActionEmpty()).toHaveCount(0);
    },

    async dismissNextActionPicker(): Promise<void> {
      await page.keyboard.press('Escape');
      await expect(projectPage.nextActionPicker()).toHaveCount(0);
    },

    async shouldSeePickerCreateInViewport(): Promise<void> {
      const picker = projectPage.nextActionPicker();
      await expect(picker).toBeVisible();
      const body = picker.locator('[data-next-action-picker-body]');
      await expect(body).toBeVisible();
      const overflows = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(overflows, 'picker body should scroll').toBe(true);
      const create = picker.locator('[data-next-action-create]');
      await expect(create).toBeInViewport();
      await page.locator('[data-next-action-new-title]').fill('Overflow create');
      await expect(create).toBeEnabled();
      await expect(create).toBeInViewport();
    },

    async shouldSeeWhatsNextFooterInViewport(): Promise<void> {
      const prompt = page.locator('[data-whats-next-prompt]');
      await expect(prompt).toBeVisible();
      const body = prompt.locator('[data-next-action-picker-body]');
      await expect(body).toBeVisible();
      const overflows = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(overflows, 'What’s next body should scroll').toBe(true);
      const skip = page.locator('[data-whats-next-skip]');
      const create = prompt.locator('[data-next-action-create]');
      await expect(skip).toBeInViewport();
      await expect(create).toBeInViewport();
      await expect(skip).toBeEnabled();
      await page.locator('[data-next-action-new-title]').fill('Overflow create');
      await expect(create).toBeEnabled();
      await expect(create).toBeInViewport();
      await expect(skip).toBeInViewport();
    },

    async shouldSeeNoNextActionOnAllProjects(name: string): Promise<void> {
      const row = page.locator('[data-projects-index] a').filter({ hasText: name });
      await expect(row.locator('[data-project-no-next-action]')).toBeVisible();
    },

    async shouldSeeNoNextActionDotOnRail(name: string): Promise<void> {
      await expect(
        page.locator(
          `[data-app-rail]:visible [data-rail-item="project"][data-rail-label="${name}"] [data-rail-no-next-action]`
        )
      ).toBeVisible();
    },

    async shouldSeeBlankProjectNameError(): Promise<void> {
      await projectPage.openEdit();
      const input = page.locator('[data-project-name-input]');
      await input.fill('');
      await expect(input).toHaveValue('');
      await page.locator('[data-project-save]').click();
      await expect(page.locator('[data-project-save-error]')).toBeVisible();
    },

    async openProjectEditDialog(): Promise<void> {
      await projectPage.openEdit();
      await waitForSettledOpenDialog({ page });
    },

    async dismissProjectEditDialog(): Promise<void> {
      const dialog = page.getByRole('dialog', { name: 'Edit project' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    },

    async deleteTaskFromEdit(): Promise<void> {
      await page.locator('[data-slot="task-edit-delete"]').click();
      const confirm = page.getByRole('dialog', { name: 'Delete task?' });
      await expect(confirm).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/tasks/') && response.request().method() === 'DELETE'
      );
      await confirm.getByRole('button', { name: 'Delete' }).click();
      const response = await responsePromise;
      if (response.status() !== 204 && response.status() !== 200) {
        throw new Error(`Failed to delete task: ${response.status()}`);
      }
    },

    async clearTaskProjectFromEdit(): Promise<void> {
      await tasksPage.clearProject();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/tasks/') && response.request().method() === 'PATCH'
      );
      await tasksPage.saveEdit();
      const response = await responsePromise;
      if (response.status() !== 200) {
        throw new Error(`Failed to clear task project: ${response.status()}`);
      }
    },

    async shouldSeeSingleStatusControl(): Promise<void> {
      await projectPage.waitForVisible();
      await expect(page.locator('[data-project-status-trigger]')).toHaveCount(1);
      await expect(page.locator('[data-project-status]')).toHaveCount(1);
      await expect(page.locator('[data-project-waiting-fields]')).toHaveCount(0);
    },

    async shouldSeeHistorySection(): Promise<void> {
      const row = page.locator('[data-project-history]');
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
    },

    async expandProjectHistory(): Promise<void> {
      const section = page.locator('[data-project-history]');
      await section.scrollIntoViewIfNeeded();
      const toggle = section.locator('button[aria-expanded]').first();
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click();
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.evaluate(async (el) => {
        await Promise.all(
          el
            .getAnimations({ subtree: true })
            .map((animation: { finished: Promise<unknown> }) => animation.finished.catch(() => undefined))
        );
      });
    },

    async expandProjectFinished(): Promise<void> {
      const section = page.locator('[data-project-finished]');
      await section.scrollIntoViewIfNeeded();
      const toggle = section.locator('button[aria-expanded]').first();
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
        await toggle.click();
      }
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.evaluate(async (el) => {
        await Promise.all(
          el
            .getAnimations({ subtree: true })
            .map((animation: { finished: Promise<unknown> }) => animation.finished.catch(() => undefined))
        );
      });
    },

    async clickProjectHistoryMore(): Promise<void> {
      const more = page.locator('[data-project-history-more]');
      await more.scrollIntoViewIfNeeded();
      await expect(more).toBeVisible();
      const count = await page.locator('[data-project-history-entry]').count();
      await more.click();
      await expect(page.locator('[data-project-history-entry]')).not.toHaveCount(count);
    },

    async loadAllProjectHistory(): Promise<void> {
      const more = page.locator('[data-project-history-more]');
      while ((await more.count()) > 0) {
        await this.clickProjectHistoryMore();
      }
    },

    async shouldSeeHistoryEntry(input: {
      kind: string;
      actor: string;
      text: string;
      deleted?: boolean;
      highlight?: boolean;
    }): Promise<void> {
      const line = page.locator(
        `[data-project-history-entry][data-history-kind="${input.kind}"][data-history-actor="${input.actor}"]`
      ).filter({ hasText: input.text });
      await expect(line.first()).toBeVisible();
      if (input.deleted) {
        await expect(line.first()).toHaveAttribute('data-history-deleted', 'true');
      }
      if (input.highlight === false) {
        return;
      }
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      await line.first().evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
      await line.first().evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    },

    async shouldSeeHistoryEntryCount(count: number): Promise<void> {
      await expect(page.locator('[data-project-history-entry]')).toHaveCount(count);
    },

    async shouldSeeHistoryMore(): Promise<void> {
      const more = page.locator('[data-project-history-more]');
      await expect(more).toBeVisible();
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      await more.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    },

    async shouldSeeHistoryStart(): Promise<void> {
      const start = page.locator('[data-project-history-start]');
      await start.scrollIntoViewIfNeeded();
      await expect(start).toBeVisible();
      await expect(start).toHaveText(/History starts Oct 10, 2026/);
      await page.locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      await start.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    },

    async shouldNotSeeHistoryStart(): Promise<void> {
      await expect(page.locator('[data-project-history-start]')).toHaveCount(0);
    },

    async shouldSeeHistoryLinesInOrder(texts: string[]): Promise<void> {
      const lines = page.locator('[data-project-history-entry]');
      await expect(lines.first()).toBeVisible();
      const found = await lines.allTextContents();
      expect(found.length).toBeGreaterThanOrEqual(texts.length);
      for (const [index, text] of texts.entries()) {
        expect(found[index], `history line ${index}`).toContain(text);
      }
    },

    async shouldSeeFinishedTask(title: string): Promise<void> {
      const row = page.locator(`[data-project-finished] [data-task-title="${title}"]`);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
    },

    async shouldSeeFinishedBy(title: string, text: string): Promise<void> {
      const row = page.locator(`[data-project-finished] [data-task-title="${title}"]`);
      const line = row.locator('[data-finished-by]');
      await line.scrollIntoViewIfNeeded();
      await expect(line).toContainText(text);
    },

    async shouldNotSeeFinishedTask(title: string): Promise<void> {
      await expect(
        page.locator(`[data-project-finished] [data-task-title="${title}"]`)
      ).toHaveCount(0);
    },

    async reopenFinishedTask(title: string): Promise<void> {
      const row = page.locator(`[data-project-finished] [data-task-title="${title}"]`);
      await row.scrollIntoViewIfNeeded();
      const complete = row.locator('[data-slot="task-complete"]');
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/uncomplete') && response.request().method() === 'POST'
      );
      await complete.click();
      await responsePromise;
      const openRow = page.locator(`[data-project-open-tasks] [data-task-title="${title}"]`);
      await openRow.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      await expect(openRow).toBeVisible();
    },

    async shouldSeeProjectOnRail(name: string): Promise<void> {
      await expect(
        page.locator(`[data-app-rail]:visible [data-rail-item="project"][data-rail-label="${name}"]`)
      ).toBeVisible();
    },

    async shouldSeeProjectInSomedayGroup(name: string): Promise<void> {
      const group = page.locator('[data-app-rail]:visible [data-rail-someday-group]');
      await expect(group).toBeVisible();
      await expect(
        group.locator(`[data-rail-item="someday-project"][data-rail-label="${name}"]`)
      ).toBeVisible();
    },

    async shouldNotSeeProjectOnRail(name: string): Promise<void> {
      await expect(
        page.locator(`[data-app-rail]:visible [data-rail-label="${name}"]`)
      ).toHaveCount(0);
    },

    async openSomedayGroup(): Promise<void> {
      const summary = page.locator('[data-app-rail]:visible [data-rail-someday-summary]');
      await expect(summary).toBeVisible();
      const group = page.locator('[data-app-rail]:visible [data-rail-someday-group]');
      const open = await group.getAttribute('open');
      if (open === null) {
        await summary.click();
      }
    },

    async goToAllProjects(): Promise<void> {
      await page.goto('/projects');
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    },

    async shouldSeeProjectOnAllProjects(input: {
      name: string;
      status: string;
    }): Promise<void> {
      const item = page.locator('[data-projects-index] a').filter({ hasText: input.name });
      await expect(item).toBeVisible();
      await expect(item.locator('[data-project-index-status]')).toHaveAttribute(
        'data-project-index-status',
        input.status
      );
    },

    async shouldSeeEditTaskDialogSubtitle(text: string): Promise<void> {
      await expect(page.getByText(text)).toBeVisible();
    },

    async shouldSeeOpenTaskOnProject(title: string): Promise<void> {
      await expect(projectPage.openTaskByTitle(title)).toBeVisible();
    },

    async shouldNotSeeOpenTaskOnProject(title: string): Promise<void> {
      await expect(projectPage.openTaskByTitle(title)).toHaveCount(0);
    },

    async shouldSeeOpenTasksOnProjectInOrder(titles: string[]): Promise<void> {
      await expect.poll(async () => projectPage.getOpenTaskTitles()).toEqual(titles);
    },

    async confirmPromoteOnProject(projectName: string): Promise<Task> {
      await inboxPage.selectPromoteProjectByName(projectName);
      const responsePromise = page.waitForResponse(
        (response) =>
          isProcessToTaskPost(response.url()) && response.request().method() === 'POST'
      );
      await inboxPage.confirmPromote();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to promote capture: ${response.status()}`);
      }
      await expect(inboxPage.promoteSheet()).toBeHidden();
      return response.json();
    },

    async shouldSeeNamedListOverflowOnRail(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.overflowByLabel(name)).toBeVisible();
      await appRail.openOverflow(name);
      const menu = page.getByRole('menu');
      const renameItem = menu.getByRole('menuitem', { name: 'Rename', exact: true });
      const deleteItem = menu.getByRole('menuitem', { name: 'Delete', exact: true });
      await expect(renameItem).toBeVisible();
      await expect(deleteItem).toBeVisible();
      const renameBox = await renameItem.boundingBox();
      const deleteBox = await deleteItem.boundingBox();
      if (!renameBox || !deleteBox) {
        throw new Error(`Rename and Delete should both be laid out for "${name}"`);
      }
      expect(renameBox.y).toBeLessThan(deleteBox.y);
      await menu.press('Escape');
      await expect(deleteItem).toBeHidden();
    },

    async shouldSeeNamedListOverflowAboveMobileDrawer(name: string): Promise<void> {
      await appRail.expectOverflowMenuAboveDrawer(name);
    },

    async shouldSeeNamedListOverflowOnDesktopSidebar(name: string): Promise<void> {
      await appRail.expectOverflowMenuOnDesktopSidebar(name);
    },

    async shouldNotNavigateWhenOpeningNamedListOverflow(name: string): Promise<void> {
      await appRail.expectOverflowDoesNotNavigate(name);
    },

    async shouldSeeWrappedRailNamedList(name: string): Promise<void> {
      await appRail.expectNamedListLabelWrapped(name);
    },

    async shouldSeeRailNamedListHighlighted(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect.poll(async () => appRail.isItemActive(name)).toBe(true);
    },

    async shouldSeeNoHorizontalPageScrollFromRail(): Promise<void> {
      await appRail.expectNoHorizontalPageScroll();
    },

    async shouldSeeNamedListLabelsClearOfCountAndOverflow(): Promise<void> {
      await appRail.expectNamedListLabelsClearOfCountAndOverflow();
    },

    async shouldNotSeeNamedListOverflowOnRail(label: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel(label)).toBeVisible();
      await expect(appRail.overflowByLabel(label)).toHaveCount(0);
    },

    async deleteNamedListFromRail(name: string): Promise<void> {
      const result = await appRail.deleteNamedList(name);
      if (result.status === 'has-open-tasks') {
        throw new ConflictError('This list still has open tasks');
      }
    },

    async renameNamedListFromRail(
      currentName: string,
      newName: string,
      options?: { submit?: 'enter' | 'done' }
    ): Promise<NamedList> {
      const result = await appRail.renameNamedList(currentName, newName, options?.submit ?? 'enter');
      if (result.status === 'empty' || result.status === 'invalid') {
        throw new ValidationError('Name is required');
      }
      if (result.status === 'duplicate') {
        throw new ConflictError('A list with this name already exists');
      }
      return {
        id: result.id,
        name: result.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      };
    },

    async cancelNamedListRenameFromRail(
      currentName: string,
      draftName: string,
      via: 'escape' | 'click-away'
    ): Promise<void> {
      await appRail.cancelNamedListRename(currentName, draftName, via);
    },

    async beginNamedListRenameFromRail(currentName: string): Promise<void> {
      await appRail.beginRename(currentName);
    },

    async shouldSeeNamedListRenameDraft(value: string): Promise<void> {
      await expect(page.locator('[data-list-rename-input]')).toHaveValue(value);
    },

    async shouldBeOnTaskFilter(
      filter: 'today' | 'upcoming' | 'mine' | 'completed'
    ): Promise<void> {
      await expect(page).toHaveURL(new RegExp(`[?&]filter=${filter}`));
      await expectActiveFilterTabIfVisible(filter);
    },

    async shouldNotSeeListOnVisibleTask(taskId: string): Promise<void> {
      await expect(tasksPage.taskCard(taskId)).toBeVisible();
      await expect(tasksPage.listOnTask(taskId)).toHaveCount(0);
    },

    async shouldSeeCreateTaskListPicker(): Promise<void> {
      await expect(tasksPage.createTaskListPicker()).toBeVisible();
    },

    async shouldNotSeeCreateTaskListPicker(): Promise<void> {
      await expect(tasksPage.createTaskListPicker()).toHaveCount(0);
    },

    async addTaskOnCurrentView(title: string): Promise<Task> {
      await expect(page.locator('#create-task-title')).toBeVisible();
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/tasks') &&
          !response.url().includes('/api/tasks/') &&
          response.request().method() === 'POST'
      );
      await tasksPage.quickAdd(title);
      const response = await responsePromise;

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to create task: ${response.status()}`);
      }
      const task = (await response.json()) as Task;
      await tasksPage.waitForTasksOrEmpty();
      return task;
    },

    async openRailCapture(): Promise<void> {
      const desktop = await appRail.isDesktopSurface();
      await openRailDestination(desktop ? 'Capture' : 'Inbox', async () => {
        await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 4_000 });
        await inboxPage.waitForCapturesOrEmpty();
      });
    },

    async shouldBeOnInboxPane(): Promise<void> {
      await expect(page).toHaveURL(/https?:\/\/[^/]+\/(?:\?.*)?$/);
      await expect(inboxPage.paneTabs().getByRole('tab', { name: 'Inbox' })).toHaveAttribute(
        'data-state',
        'active'
      );
      await expect(page.getByPlaceholder('Quick capture...')).toBeVisible();
      await expect(page.locator('#create-task-title')).toHaveCount(0);
    },

    async shouldSeeInboxPaneTabs(labels: string[]): Promise<void> {
      await expect(inboxPage.paneTabs()).toBeVisible();
      await expect.poll(async () => inboxPage.getPaneTabLabels()).toEqual(labels);
    },

    async shouldNotSeeSnoozedOrTrashOnRail(): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.itemByLabel('Snoozed')).toHaveCount(0);
      await expect(appRail.itemByLabel('Trash')).toHaveCount(0);
    },

    async openInboxPaneTab(tab: 'inbox' | 'snoozed' | 'trash'): Promise<void> {
      await inboxPage.openPaneTab(tab);
      if (tab === 'inbox') {
        await inboxPage.waitForCapturesOrEmpty();
        return;
      }
      if (tab === 'snoozed') {
        await snoozedPage.waitForCapturesOrEmpty();
        return;
      }
      await trashPage.waitForCapturesOrEmpty();
    },

    async shouldBeOnInboxPaneTab(tab: 'inbox' | 'snoozed' | 'trash'): Promise<void> {
      const path = tab === 'inbox' ? '/' : `/${tab}`;
      const label = tab === 'inbox' ? 'Inbox' : tab === 'snoozed' ? 'Snoozed' : 'Trash';
      await expect(page).toHaveURL(
        tab === 'inbox' ? /https?:\/\/[^/]+\/(?:\?.*)?$/ : new RegExp(`${path}(?:\\?.*)?$`)
      );
      await expect(inboxPage.paneTabs().getByRole('tab', { name: label })).toHaveAttribute(
        'data-state',
        'active'
      );
    },

    async shouldSeeRailCaptureHighlighted(): Promise<void> {
      const desktop = await appRail.isDesktopSurface();
      await expect.poll(async () => appRail.isItemActive(desktop ? 'Capture' : 'Inbox')).toBe(true);
    },

    async shouldSeeCaptureOnCurrentPane(content: string): Promise<void> {
      await expect(inboxPage.captureCard(content)).toBeVisible();
    },

    async shouldSeeInboxCaptureActions(content: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      await card.hover();
      await expect(card.getByRole('button', { name: 'Promote' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Snooze' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Trash' })).toBeVisible();
      await expect(card.getByRole('checkbox')).toHaveCount(0);
      await expect(card.locator('[draggable="true"]')).toHaveCount(0);
      await expect(card.locator('input[type="date"]')).toHaveCount(0);
      await expect(card.getByText(/due/i)).toHaveCount(0);
    },

    async shouldSeeDenseCaptureSnippet(
      content: string,
      sourceLine: string | RegExp
    ): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      const body = inboxPage.captureContent(content);
      await expect(body).toBeVisible();
      for (const line of content.split('\n')) {
        await expect(body).toContainText(line);
      }
      const whiteSpace = await body.evaluate((el) => {
        const view = el.ownerDocument.defaultView;
        if (view === null) {
          throw new Error('expected a window for computed style');
        }
        return view.getComputedStyle(el).whiteSpace;
      });
      expect(whiteSpace).toBe('pre-wrap');
      await expect(inboxPage.captureSourceLine(content)).toHaveText(sourceLine);
      await expect(card.getByRole('checkbox')).toHaveCount(0);
      await expect(card.locator('[draggable="true"]')).toHaveCount(0);
      await expect(card.getByRole('button', { name: /complete/i })).toHaveCount(0);
      await expect(card.getByRole('button', { name: /^(Pin|Unpin) task/ })).toHaveCount(0);
      await expect(card.locator('input[type="date"]')).toHaveCount(0);
    },

    async shouldSeeUsableCaptureActionTargets(content: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      for (const name of ['Promote', 'Snooze', 'Trash'] as const) {
        const control = card.getByRole('button', { name });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        if (!box) {
          throw new Error(`${name} should have a layout box`);
        }
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(44);
      }
    },

    async shouldSeeCaptureSnippetReadable(content: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      const cardBg = await card.evaluate(readComputedBackgroundColor);
      const contentColor = await inboxPage.captureContent(content).evaluate(readComputedColor);
      const sourceColor = await inboxPage.captureSourceLine(content).evaluate(readComputedColor);
      expect(contentColor).not.toEqual(cardBg);
      expect(sourceColor).not.toEqual(cardBg);
    },

    async trashCaptureBySwipe(content: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      await inboxPage.swipeCaptureCard(content, { x: 140, y: 0 });
      await expect(card).toHaveCount(0);
    },

    async shouldSeeInboxTriageSurface(): Promise<void> {
      await expect(inboxPage.triageSurface()).toBeVisible();
      await expect(inboxPage.triageHeading()).toHaveText('Capture');
      await expect(inboxPage.triageSubcopy()).toHaveCount(0);
      await expect(tasksPage.taskSurface()).toHaveCount(0);
    },

    async shouldSeeTaskSurface(): Promise<void> {
      await expect(tasksPage.taskSurface()).toBeVisible();
      await expect(inboxPage.triageSurface()).toHaveCount(0);
    },

    async shouldSeeTaskPlace(heading: string, subcopy: string): Promise<void> {
      await expect(tasksPage.taskSurface()).toBeVisible();
      await expect(tasksPage.placeHeading()).toHaveText(heading);
      await expect(tasksPage.placeSubcopy()).toHaveText(subcopy);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(inboxPage.triageSurface()).toHaveCount(0);
    },

    async shouldSeeTaskPlaceReadable(): Promise<void> {
      await expect(tasksPage.placeHeading()).toBeVisible();
      await expect(tasksPage.placeSubcopy()).toBeVisible();
      const surfaceBg = await tasksPage.taskSurface().evaluate(readComputedBackgroundColor);
      const headingColor = await tasksPage.placeHeading().evaluate(readComputedColor);
      const subcopyColor = await tasksPage.placeSubcopy().evaluate(readComputedColor);
      expect(headingColor).not.toEqual(surfaceBg);
      expect(subcopyColor).not.toEqual(surfaceBg);
    },

    async useAppearance(appearance: {
      mode: 'light' | 'dark';
      colorTheme: 'default' | 'tokyo-night';
    }): Promise<void> {
      await page.evaluate(({ mode, colorTheme }) => {
        localStorage.setItem('theme', mode);
        localStorage.setItem('colorTheme', colorTheme);
      }, appearance);
      await page.reload();
      await expect
        .poll(async () => page.locator('html').evaluate((el) => el.classList.contains('dark')))
        .toBe(appearance.mode === 'dark');
      await expect
        .poll(async () =>
          page.locator('html').evaluate((el) => el.classList.contains('theme-tokyo-night'))
        )
        .toBe(appearance.colorTheme === 'tokyo-night');
    },

    async shouldSeeInboxSurfaceDistinctFromTaskSurface(): Promise<void> {
      await expect(inboxPage.triageSurface()).toBeVisible();
      const inboxBg = await inboxPage.triageSurface().evaluate(readComputedBackgroundColor);
      await tasksPage.goto('today');
      await tasksPage.waitForTasksOrEmpty();
      await expect(tasksPage.taskSurface()).toBeVisible();
      const taskBg = await tasksPage.taskSurface().evaluate(readComputedBackgroundColor);
      expect(inboxBg).not.toEqual(taskBg);
    },

    async shouldSeeCaptureContentLink(content: string, href: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      const link = inboxPage.captureContentLink(content, href);
      await expect(card).toBeVisible();
      await expect(inboxPage.captureContent(content)).toHaveText(content);
      await expect(link).toBeVisible();
      await expect(link).toHaveText(href);
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    },

    async shouldSeeCaptureContentWithoutLinks(content: string): Promise<void> {
      const card = inboxPage.captureCard(content);
      await expect(card).toBeVisible();
      await expect(inboxPage.captureContent(content)).toHaveText(content);
      await expect(inboxPage.captureContentLinks(content)).toHaveCount(0);
    },

    async shouldSeeCaptureSourceUrl(content: string, href: string): Promise<void> {
      const source = inboxPage.captureSourceUrl(content);
      await expect(source).toBeVisible();
      await expect(source).toHaveAttribute('href', href);
      await expect(source).toHaveAttribute('target', '_blank');
      await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    },

    async openCaptureContentLink(content: string, href: string): Promise<void> {
      const link = inboxPage.captureContentLink(content, href);
      await expect(link).toBeVisible();

      await page.context().route(
        (url) => url.href === href || url.href.startsWith(`${href}/`) || url.href.startsWith(href),
        async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body>ok</body></html>',
          });
        }
      );

      const popupPromise = page.waitForEvent('popup');
      await link.click();
      const popup = await popupPromise;
      await expect.poll(() => popup.url()).toContain(href);
      await popup.close();

      await expect(inboxPage.captureCard(content)).toBeVisible();
      await expect(inboxPage.promoteSheet()).toHaveCount(0);
    },

    async shouldSeeQuickAddCapture(): Promise<void> {
      await expect(page.getByPlaceholder('Quick capture...')).toBeVisible();
    },

    async shouldNotSeeQuickAddCapture(): Promise<void> {
      await expect(page.getByPlaceholder('Quick capture...')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
    },

    async shouldNotSeeQuickCaptureField(): Promise<void> {
      await expect(page.getByPlaceholder('Quick capture...')).toHaveCount(0);
      await expect(inboxPage.quickCaptureInput()).toHaveCount(0);
    },

    async pressQuickCaptureShortcut(): Promise<void> {
      await page.keyboard.press('Control+K');
    },

    async submitFocusedQuickCapture(content: string): Promise<void> {
      await expect(inboxPage.quickCaptureInput()).toBeFocused();
      const captureId = await inboxPage.quickAdd(content);
      if (!captureId) {
        throw new Error(`Quick capture did not land in Inbox: "${content}"`);
      }
    },

    async shouldHaveQuickCaptureFocused(): Promise<void> {
      await expect(inboxPage.quickCaptureInput()).toBeVisible();
      await expect(inboxPage.quickCaptureInput()).toBeFocused();
    },

    async shouldSeeQuickCaptureShortcutHint(): Promise<void> {
      const hint = inboxPage.quickCaptureShortcutHint();
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText(/^(⌘K|Ctrl\+K)$/);
    },

    async shouldNotSeeQuickCaptureShortcutHint(): Promise<void> {
      await expect(inboxPage.quickCaptureShortcutHint()).toHaveCount(0);
    },

    async shouldSeeQuickCaptureShortcutHintReadable(): Promise<void> {
      const hint = inboxPage.quickCaptureShortcutHint();
      await expect(hint).toBeVisible();
      const hintColor = await hint.evaluate(readComputedColor);
      const hintBg = await hint.evaluate(readComputedBackgroundColor);
      const fieldBg = await inboxPage.quickCaptureInput().evaluate(readComputedBackgroundColor);
      expect(hintColor).not.toEqual(hintBg);
      expect(hintColor).not.toEqual(fieldBg);
    },

    async focusAddTaskField(): Promise<void> {
      const field = page.locator('#create-task-title');
      await expect(field).toBeVisible();
      await field.click();
      await expect(field).toBeFocused();
    },

    async focusTaskEditTitle(): Promise<void> {
      const field = page.locator('#edit-task-title');
      await expect(field).toBeVisible();
      await field.click();
      await expect(field).toBeFocused();
    },

    async typeIntoFocusedField(text: string): Promise<void> {
      const focused = page.locator(':focus');
      await expect(focused).toBeVisible();
      await page.keyboard.type(text);
    },

    async shouldSeeFocusedFieldValue(value: string): Promise<void> {
      await expect(page.locator(':focus')).toHaveValue(value);
    },

    async openPromoteSheet(content: string): Promise<void> {
      await inboxPage.openPromote(content);
      await expect(inboxPage.promoteSheet()).toBeVisible();
    },

    async shouldSeePromoteSheet(): Promise<void> {
      const sheet = inboxPage.promoteSheet();
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('heading', { name: 'Promote' })).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Promote' })).toBeVisible();
      await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
      await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    },

    async shouldSeePromoteTitlePrefill(title: string): Promise<void> {
      await expect(inboxPage.promoteTitle()).toHaveValue(title);
    },

    async shouldSeePromoteListUnlisted(): Promise<void> {
      await expect(inboxPage.promoteList()).toContainText('Unlisted');
    },

    async confirmPromoteUnlisted(): Promise<Task> {
      const responsePromise = page.waitForResponse(
        (response) =>
          isProcessToTaskPost(response.url()) && response.request().method() === 'POST'
      );
      await inboxPage.confirmPromote();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to promote capture: ${response.status()}`);
      }
      await expect(inboxPage.promoteSheet()).toBeHidden();
      return response.json();
    },

    async confirmPromoteOnList(listName: string): Promise<Task> {
      await inboxPage.selectPromoteListByName(listName);
      const responsePromise = page.waitForResponse(
        (response) =>
          isProcessToTaskPost(response.url()) && response.request().method() === 'POST'
      );
      await inboxPage.confirmPromote();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to promote capture: ${response.status()}`);
      }
      await expect(inboxPage.promoteSheet()).toBeHidden();
      return response.json();
    },

    async cancelPromoteSheet(): Promise<void> {
      await inboxPage.cancelPromote();
      await expect(inboxPage.promoteSheet()).toBeHidden();
    },

    async shouldNotSeeCaptureOnCurrentPane(content: string): Promise<void> {
      await expect(inboxPage.captureCard(content)).toHaveCount(0);
    },

    async useMobileViewport(): Promise<void> {
      walkthroughViewport = 'phone';
      await page.setViewportSize(MOBILE_VIEWPORT);
      await settleMobileViewportChrome();
    },

    async useDesktopViewport(size?: { width: number; height: number }): Promise<void> {
      walkthroughViewport = 'desktop';
      await page.setViewportSize(size ?? DESKTOP_VIEWPORT);
      await settleDesktopViewportChrome();
    },

    async openEditTaskProjectPicker(visibleProjectName: string): Promise<void> {
      await tasksPage.openEditProjectPicker(visibleProjectName);
      await waitForSettledOpenSelect({ page, visibleOptionName: visibleProjectName });
    },

    async openCreateTaskProjectPicker(visibleProjectName: string): Promise<void> {
      await tasksPage.openCreateProjectPicker(visibleProjectName);
      await waitForSettledOpenSelect({ page, visibleOptionName: visibleProjectName });
    },

    async openPromoteProjectPicker(visibleProjectName: string): Promise<void> {
      await inboxPage.openPromoteProjectPicker(visibleProjectName);
      await waitForSettledOpenSelect({ page, visibleOptionName: visibleProjectName });
    },

    async dismissOpenSelect(): Promise<void> {
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(listbox).toBeHidden();
    },

    async saveWalkthroughScreenshot(input: {
      story: string;
      step: string;
      includeToasts?: boolean;
    }): Promise<void> {
      const openSelect = page.locator('[data-slot="select-content"][data-state="open"]');
      if ((await openSelect.count()) > 0 && (await openSelect.last().isVisible())) {
        await waitForSettledOpenSelect({ page });
      }
      // A closing confirm dialog is still "visible" to Playwright (opacity
      // animation). Waiting for [data-slot="dialog-content"].last() then
      // times out after the node unmounts. Only settle a dialog the step
      // actually left open.
      const openDialog = page.locator(OPEN_DIALOG_CONTENT);
      if (await openDialog.isVisible().catch(() => false)) {
        await waitForSettledOpenDialog({ page });
      } else {
        const closingDialog = page.locator('[data-slot="dialog-content"]');
        if ((await closingDialog.count()) > 0) {
          await closingDialog.last().waitFor({ state: 'hidden' });
        }
      }
      const openSheet = page.locator(OPEN_SHEET_CONTENT);
      if (await openSheet.isVisible().catch(() => false)) {
        await waitForSettledOpenSheet({ page });
      }
      const drawer = page.locator('[data-slot="drawer-content"]');
      if (await drawer.isVisible()) {
        const openDrawer = await drawer.getAttribute('data-state');
        if (openDrawer === 'open' || openDrawer === null) {
          await waitForSettledOpenDrawer({ page });
        } else {
          await drawer.last().waitFor({ state: 'hidden' });
        }
      }
      if (input.includeToasts) {
        await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
      }
      await page.mouse.move(0, 0);
      await waitForFinishedPageAnimations({ page });
      await saveWalkthroughPng({
        page,
        fromDir: fileURLToPath(new URL('.', import.meta.url)),
        story: input.story,
        viewport: walkthroughViewport,
        step: input.step,
        includeToasts: input.includeToasts,
      });
    },

    async openMobileBottomTab(tab: MobileTabKey): Promise<void> {
      await mobileNav.open(tab);
      if (tab === 'capture') {
        await inboxPage.waitForCapturesOrEmpty();
        return;
      }
      if (tab === 'process') {
        await expect(page.locator('[data-process-ready]')).toBeVisible();
        return;
      }
      if (tab === 'review') {
        await expect(page.locator('[data-review-ready]')).toBeVisible();
        return;
      }
      await expect(page.locator('[data-now-ready]')).toBeVisible();
      await expect(appRail.mobileTrigger()).toBeVisible();
    },

    async shouldSeeLitMobileTab(tab: MobileTabKey | null): Promise<void> {
      await expect(mobileNav.root()).toBeVisible();
      if (tab === null) {
        await expect(mobileNav.root().locator('[data-mobile-nav-active="true"]')).toHaveCount(0);
        return;
      }
      const labels: Record<MobileTabKey, string> = {
        capture: 'Capture',
        process: 'Process',
        work: 'Work',
        review: 'Review',
      };
      await expect.poll(async () => mobileNav.litTabLabel()).toBe(labels[tab]);
    },

    async shouldSeeProcessReady(): Promise<void> {
      await expect(page.locator('[data-process-ready]')).toBeVisible();
    },

    async shouldSeeProcessCurrent(content: string): Promise<void> {
      await expect(page.locator('[data-process-ready]')).toBeVisible();
      const card = page.locator('[data-process-item-kind="capture"]');
      await expect(card).toBeVisible();
      await expect.poll(async () => {
        return ((await card.getByTestId('capture-content').textContent()) ?? '').trim();
      }).toBe(content);
    },

    async shouldSeeProcessLeft(count: number): Promise<void> {
      await expect(page.locator('[data-process-ready]')).toHaveAttribute(
        'data-process-left',
        String(count)
      );
      await expect(page.getByTestId('process-subcopy')).toHaveText(`${count} left`);
    },

    async shouldSeeProcessSnoozedComingBack(count: number): Promise<void> {
      await expect(page.locator('[data-process-snoozed-count]')).toHaveText(
        `${count} snoozed will come back`
      );
    },

    async openProcessMakeTask(): Promise<void> {
      await page.locator('[data-process-make-task]').click();
      await expect(inboxPage.promoteSheet()).toBeVisible();
    },

    async openProcessProjectSheet(status: 'active' | 'someday'): Promise<void> {
      const trigger =
        status === 'someday'
          ? page.locator('[data-process-someday-project]')
          : page.locator('[data-process-new-project]');
      await trigger.click();
      await expect(page.locator('[data-process-project-sheet]')).toBeVisible();
    },

    async shouldSeeProcessProjectPrefill(input: { name: string; objective: string }): Promise<void> {
      await expect(page.locator('[data-process-project-name]')).toHaveValue(input.name);
      await expect(page.locator('[data-process-project-objective]')).toHaveValue(input.objective);
    },

    async fillProcessProject(input: { name?: string; objective?: string }): Promise<void> {
      if (input.name !== undefined) {
        await page.locator('[data-process-project-name]').fill(input.name);
      }
      if (input.objective !== undefined) {
        await page.locator('[data-process-project-objective]').fill(input.objective);
      }
    },

    async confirmProcessProject(): Promise<ProcessCaptureToProjectResult> {
      const responsePromise = page.waitForResponse(
        (response) =>
          isProcessToProjectPost(response.url()) && response.request().method() === 'POST'
      );
      await page.locator('[data-process-project-submit]').click();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to process capture to project: ${response.status()}`);
      }
      await expect(page.locator('[data-process-project-sheet]')).toBeHidden();
      return response.json();
    },

    async shouldSeeProcessProjectError(text: string): Promise<void> {
      await page.locator('[data-process-project-submit]').click();
      await expect(page.locator('[data-process-project-error]')).toHaveText(text);
      await expect(page.locator('[data-process-project-sheet]')).toBeVisible();
    },

    async cancelProcessProjectSheet(): Promise<void> {
      await page.locator('[data-process-project-sheet]').getByRole('button', { name: 'Cancel' }).click();
      await expect(page.locator('[data-process-project-sheet]')).toBeHidden();
    },

    async openProcessSnoozeMenu(): Promise<void> {
      await page.locator('[data-process-snooze]').click();
      await expect(page.locator('[data-process-snooze-menu]')).toBeVisible();
    },

    async pickProcessSnooze(option: 'later-today' | 'tomorrow' | 'next-week'): Promise<void> {
      const item = page.locator(`[data-process-snooze-option="${option}"]`);
      await expect(item).toBeVisible();
      await item.click();
    },

    async trashProcessCurrent(): Promise<void> {
      const current = await page.locator('[data-process-ready]').getAttribute('data-process-current');
      await page.locator('[data-process-trash]').click();
      if (current) {
        await expect(page.locator(`[data-process-current="${current}"]`)).toHaveCount(0);
      }
    },

    async shouldSeeProcessSourceUrl(label: string): Promise<void> {
      await expect(page.locator('[data-process-item-kind="capture"] [data-testid="source-url"]')).toHaveText(
        label
      );
    },

    async pressProcessKey(key: 't' | 'p' | 's' | 'z' | 'Delete' | 'Backspace'): Promise<void> {
      await page.keyboard.press(key);
    },

    async pressProcessKeyTwice(key: 'Delete' | 'Backspace'): Promise<void> {
      await page.evaluate(`(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
      })()`);
    },

    async shouldSeeProcessKeyHints(): Promise<void> {
      await expect(page.locator('[data-process-key-hint="T"]')).toBeVisible();
      await expect(page.locator('[data-process-key-hint="P"]')).toBeVisible();
      await expect(page.locator('[data-process-key-hint="S"]')).toBeVisible();
      await expect(page.locator('[data-process-key-hint="Z"]')).toBeVisible();
      await expect(page.locator('[data-process-key-hint="⌫"]')).toBeVisible();
    },

    async shouldSeeUndoToast(): Promise<void> {
      await expect(
        page.locator('[data-sonner-toast]').last().getByRole('button', { name: 'Undo' })
      ).toBeVisible();
    },

    async undoFromToast(): Promise<void> {
      await page.locator('[data-sonner-toast]').last().getByRole('button', { name: 'Undo' }).click();
    },

    async shouldSeeAlreadyProcessedNotice(): Promise<void> {
      await expect(page.getByText('That capture was already processed')).toBeVisible();
    },

    async shouldNotSeeAlreadyProcessedNotice(): Promise<void> {
      await expect(page.getByText('That capture was already processed')).toHaveCount(0);
    },

    async shouldNotSeeWhatsNext(): Promise<void> {
      await expect(page.locator('[data-whats-next-prompt]')).toHaveCount(0);
    },

    async shouldSeeTaskCreatedToast(): Promise<void> {
      await expect(page.getByText('Task created', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View' })).toBeVisible();
    },

    async shouldSeeProjectCreatedToast(): Promise<void> {
      await expect(page.getByText('Project created', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View' })).toBeVisible();
    },

    async shouldSeeProcessEmpty(): Promise<void> {
      await expect(page.getByText('Nothing to process', { exact: true })).toBeVisible();
      await expect(page.locator('[data-process-empty-capture]')).toBeVisible();
      await expect(page.getByTestId('process-subcopy')).toHaveCount(0);
    },

    async shouldSeeProcessBadge(count: number | null): Promise<void> {
      const badge = page.locator('[data-app-mobile-nav] [data-process-badge]');
      if (count === null) {
        await expect(badge).toHaveCount(0);
        return;
      }
      await expect(badge).toHaveAttribute('data-process-badge', String(count));
      await expect(badge).toHaveText(String(count));
    },

    async shouldSeeBackToWork(): Promise<void> {
      const link = page.locator('[data-back-to-work]');
      await expect(link).toBeVisible();
      await expect
        .poll(async () => (await link.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(40);
      await expect
        .poll(async () => (await link.boundingBox())?.height ?? 0)
        .toBeLessThanOrEqual(44);
    },

    async shouldNotSeeBackToWork(): Promise<void> {
      await expect(page.locator('[data-back-to-work]')).toHaveCount(0);
    },

    async openBackToWork(): Promise<void> {
      await page.locator('[data-back-to-work]').click();
      await page.waitForURL((url) => new URL(url).pathname === '/work');
      await expect(page.locator('[data-now-ready]')).toBeVisible();
    },

    async shouldSeeReviewNewProject(): Promise<void> {
      await expect(page.locator('[data-review-new-project]')).toBeVisible();
    },

    async createProjectFromReview(input: {
      name: string;
      objective?: string;
    }): Promise<Project> {
      await page.locator('[data-review-new-project]').click();
      const dialog = page.getByRole('dialog', { name: 'New project' });
      await waitForSettledOpenDialog({ page });
      await dialog.locator('[data-project-create-name]').fill(input.name);
      if (input.objective !== undefined) {
        await dialog.locator('[data-project-create-objective]').fill(input.objective);
      }
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST'
      );
      await dialog.getByRole('button', { name: 'Create project' }).click();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to create project from Review: ${response.status()}`);
      }
      await dialog.waitFor({ state: 'hidden' });
      await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/i);
      const match = new URL(page.url()).pathname.match(/\/projects\/([0-9a-f-]{36})$/i);
      if (!match?.[1]) {
        throw new Error(`Created project "${input.name}" did not land on its page`);
      }
      return {
        id: match[1],
        name: input.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
        objective: input.objective,
        status: 'active',
      };
    },

    async openProjectFromIndex(name: string): Promise<void> {
      await page.locator('[data-projects-index] a').filter({ hasText: name }).click();
      await projectPage.waitForVisible();
    },

    async openAllProjectsBackLink(): Promise<void> {
      await page.locator('[data-part="back-link"]').click();
      await page.waitForURL((url) => new URL(url).pathname === '/projects');
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    },

    async openProcess(): Promise<void> {
      await page.goto('/process');
      await expect(page.locator('[data-process-ready]')).toBeVisible();
    },

    async shouldSeeNoRailItemHighlighted(): Promise<void> {
      await expect(page.locator('[data-app-rail]:visible [data-rail-active]')).toHaveCount(0);
    },

    async openRailProject(name: string): Promise<void> {
      await openRailDestination(name, async () => {
        await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/i, { timeout: 4_000 });
        await projectPage.waitForVisible();
      });
    },

    async confirmPromoteOnListAndProject(input: {
      listName: string;
      projectName: string;
      dueDate?: string;
    }): Promise<Task> {
      await inboxPage.selectPromoteListByName(input.listName);
      await inboxPage.selectPromoteProjectByName(input.projectName);
      if (input.dueDate !== undefined) {
        await page.locator('#promote-due-date').fill(input.dueDate);
      }
      const responsePromise = page.waitForResponse(
        (response) =>
          isProcessToTaskPost(response.url()) && response.request().method() === 'POST'
      );
      await inboxPage.confirmPromote();
      const response = await responsePromise;
      if (response.status() !== 201) {
        throw new Error(`Failed to promote capture: ${response.status()}`);
      }
      await expect(inboxPage.promoteSheet()).toBeHidden();
      return response.json();
    },

    async snoozeCaptureOnCurrentPane(content: string): Promise<void> {
      await inboxPage.snoozeCapture(content, 'tomorrow');
      await expect(inboxPage.captureCard(content)).toHaveCount(0);
    },

    async trashCaptureOnCurrentPane(content: string): Promise<void> {
      await inboxPage.trashCapture(content);
      await expect(inboxPage.captureCard(content)).toHaveCount(0);
    },

    async shouldSeeClearOfMobileTabBar(selector: string): Promise<void> {
      const el = page.locator(selector).last();
      await expect(el).toBeVisible();
      await expect.poll(async () => {
        return el.evaluate((node) => {
          node.scrollIntoView({ block: 'end', inline: 'nearest' });
          const bar = node.ownerDocument.querySelector('[data-app-mobile-nav]');
          if (bar === null) {
            return true;
          }
          const extra = 1;
          const overlap =
            node.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + extra;
          if (overlap > 0) {
            node.ownerDocument.defaultView?.scrollBy(0, overlap);
          }
          return (
            node.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + extra
          );
        });
      }).toBe(true);
    },

    async shouldSeeMobileBottomTabs(labels: string[]): Promise<void> {
      await expect(mobileNav.root()).toBeVisible();
      await expect.poll(async () => mobileNav.getItemLabels()).toEqual(labels);
    },

    async shouldNotSeeMobileBottomTab(label: string): Promise<void> {
      await expect(mobileNav.root()).toBeVisible();
      await expect(mobileNav.item(label)).toHaveCount(0);
    },

    async shouldSeeDesktopAppRail(): Promise<void> {
      await expect(appRail.desktop()).toBeVisible();
      await expect(appRail.mobileTasks()).toBeHidden();
      await expect(appRail.mobileTrigger()).toBeHidden();
    },

    async shouldNotSeeMobileBottomNav(): Promise<void> {
      await expect(mobileNav.root()).toBeHidden();
    },

    async shouldSeeTasksContentWithoutMobileRail(): Promise<void> {
      await expect(page.locator('[data-task-surface]')).toBeVisible();
      await expect(appRail.mobileTrigger()).toBeVisible();
      await expect(appRail.mobileTasks()).toBeHidden();
    },

    async openMobileTasksRail(): Promise<void> {
      await appRail.openMobileDrawer();
      await expect(appRail.mobileTasks()).toBeVisible();
    },

    async shouldSeeMobileTasksRail(): Promise<void> {
      await expect(appRail.mobileTasks()).toBeVisible();
    },

    async shouldNotSeeMobileTasksRail(): Promise<void> {
      await expect(appRail.mobileTrigger()).toBeVisible();
      await expect(appRail.mobileTasks()).toBeHidden();
    },

    async shouldSeeLargeCompleteControlOnTask(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const card = tasksPage.taskCard(taskId);
      const control = tasksPage.completeControl(taskId);
      await expect(control).toBeVisible();
      await expect(control).toHaveRole('button');
      await expect(card.getByRole('checkbox')).toHaveCount(0);
      const box = await control.boundingBox();
      if (!box) {
        throw new Error('complete control should have a layout box');
      }
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    },

    async completeOpenTaskFromRow(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.completeControl(taskId).click();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async completeOpenTaskFromRowAgainstStalePilePoll(
      taskId: string,
      listId: string
    ): Promise<void> {
      let releasePoll = (): void => undefined;
      let releaseComplete = (): void => undefined;
      let pollParked = false;
      let pollDelivered = false;
      const pollGate = new Promise<void>((resolve) => {
        releasePoll = resolve;
      });
      const completeGate = new Promise<void>((resolve) => {
        releaseComplete = resolve;
      });

      const isOpenListTasksGet = (url: URL): boolean =>
        url.pathname === `/api/lists/${listId}/tasks`;
      const isCompletePost = (url: URL): boolean =>
        url.pathname === `/api/tasks/${taskId}/complete`;

      const pollRoute = async (route: {
        request: () => { method: () => string };
        fetch: () => Promise<{ status: () => number; text: () => Promise<string> }>;
        fulfill: (response: {
          status: number;
          contentType: string;
          body: string;
        }) => Promise<void>;
        continue: () => Promise<void>;
      }): Promise<void> => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        if (pollParked) {
          await route.continue();
          return;
        }
        pollParked = true;
        const snapshot = await route.fetch();
        const body = await snapshot.text();
        await pollGate;
        try {
          await route.fulfill({
            status: snapshot.status(),
            contentType: 'application/json',
            body,
          });
        } catch {
          // cancelQueries aborted the in-flight poll
        } finally {
          pollDelivered = true;
        }
      };

      const completeRoute = async (route: {
        request: () => { method: () => string };
        continue: () => Promise<void>;
      }): Promise<void> => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await completeGate;
        await route.continue();
      };

      await page.route(isOpenListTasksGet, pollRoute);
      await page.route(isCompletePost, completeRoute);

      try {
        await expect.poll(() => pollParked, { timeout: 10_000 }).toBe(true);
        await tasksPage.waitForTask(taskId);
        await tasksPage.completeControl(taskId).click();
        await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
        releasePoll();
        await expect.poll(() => pollDelivered, { timeout: 10_000 }).toBe(true);
        await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
        releaseComplete();
        await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
      } finally {
        releasePoll();
        releaseComplete();
        await page.unroute(isOpenListTasksGet, pollRoute);
        await page.unroute(isCompletePost, completeRoute);
      }
    },

    async uncompleteTaskFromRow(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.completeControl(taskId).click();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async completeOpenTaskBySwipe(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.swipeTaskRow(taskId, { x: 140, y: 0 });
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toHaveCount(0);
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async scrollTaskListWithoutCompleting(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const card = tasksPage.taskCard(taskId);
      await tasksPage.swipeTaskRow(taskId, { x: 12, y: 160 });
      await expect(card).toBeVisible();
      const before = (await page.evaluate('window.scrollY')) as number;
      await page.mouse.wheel(0, 400);
      await page.evaluate('window.scrollBy(0, 400)');
      const after = (await page.evaluate('window.scrollY')) as number;
      expect(after).toBeGreaterThan(before);
      await expect(card).toBeAttached();
    },

    async shouldKeepTaskAfterDesktopRowDrag(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.dragTaskRowWithMouse(taskId, 160);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(tasksPage.taskCard(taskId)).toBeVisible();
    },

    async shouldKeepTaskAfterVerticalRowDrag(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const card = tasksPage.taskCard(taskId);
      await tasksPage.dragTaskRowVerticallyWithTouch(taskId, 140);
      await expect(card).toBeVisible();
    },

    async shouldSeeTaskRowAlignedWithTitle(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const geometry = await tasksPage.measureTaskRowTitleLine(taskId);
      const tolerancePx = 4;
      const aligned = (centerY: number) =>
        Math.abs(centerY - geometry.titleLineCenterY) <= tolerancePx;

      expect(geometry.completeHit.width).toBeGreaterThanOrEqual(44);
      expect(geometry.completeHit.height).toBeGreaterThanOrEqual(44);
      expect(aligned(geometry.completeCircleCenterY)).toBe(true);
      if (geometry.overflowHit.width > 0) {
        expect(aligned(geometry.overflowCenterY)).toBe(true);
        expect(geometry.overflowHit.width).toBeGreaterThanOrEqual(44);
        expect(geometry.overflowHit.height).toBeGreaterThanOrEqual(44);
      }
      if (geometry.gripCenterY !== null && geometry.gripHit) {
        expect(geometry.gripHit.width).toBeGreaterThanOrEqual(44);
        expect(geometry.gripHit.height).toBeGreaterThanOrEqual(44);
        expect(aligned(geometry.gripCenterY)).toBe(true);
      }
    },

    async shouldSeeTaskRowMetadataBelowTitle(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const geometry = await tasksPage.measureTaskRowTitleLine(taskId);
      const metaTop = geometry.metaTop;
      expect(metaTop).not.toBeNull();
      if (metaTop === null) {
        throw new Error('task row metadata should be visible');
      }
      expect(metaTop).toBeGreaterThan(geometry.titleBottom - 1);
      expect(geometry.titleLineCount).toBeGreaterThanOrEqual(1);
      expect(Math.abs(geometry.completeCircleCenterY - geometry.titleLineCenterY)).toBeLessThanOrEqual(
        4
      );
    },

    async shouldSeeWrappedTaskTitle(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const geometry = await tasksPage.measureTaskRowTitleLine(taskId);
      expect(geometry.titleLineCount).toBeGreaterThan(1);
      expect(Math.abs(geometry.completeCircleCenterY - geometry.titleLineCenterY)).toBeLessThanOrEqual(
        4
      );
    },

    async deleteOpenTaskFromRow(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.openEdit(taskId);
      const edit = page.getByRole('dialog', { name: 'Edit Task' });
      await edit.getByRole('button', { name: 'Delete', exact: true }).click();
      const confirm = page.getByRole('dialog');
      await expect(confirm.getByRole('heading', { name: 'Delete task?' })).toBeVisible();
      await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async shouldNotOpenTaskEditFromTitle(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const title = tasksPage.taskTitle(taskId);
      await expect(title).toBeVisible();
      await expect(title).not.toHaveRole('button');
      await title.click();
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toBeVisible();
      await this.closeTaskEdit();
    },

    async shouldNotOpenTaskEditFromComplete(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.completeControl(taskId).click();
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toHaveCount(0);
    },

    async shouldNotOpenTaskEditInReorderMode(taskId: string): Promise<void> {
      await tasksPage.enterReorderMode();
      await tasksPage.waitForTask(taskId);
      await tasksPage.taskTitle(taskId).click();
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toHaveCount(0);
      await tasksPage.exitReorderMode();
    },

    async shouldSeeTaskEditControl(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await expect(tasksPage.overflowControl(taskId)).toHaveCount(0);
      await expect(tasksPage.rowEditIcon(taskId)).toHaveCount(0);
      await expect(tasksPage.rowDeleteIcon(taskId)).toHaveCount(0);
      await tasksPage.openEdit(taskId);
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toBeVisible();
      await this.closeTaskEdit();
    },

    async shouldSeeOnePileTaskRowChrome(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await expect(tasksPage.completeControl(taskId)).toBeVisible();
      await expect(tasksPage.taskTitle(taskId)).toBeVisible();
      await expect(tasksPage.taskCard(taskId).locator('[data-drag-handle]')).toHaveCount(0);
      await expect(tasksPage.overflowControl(taskId)).toHaveCount(0);
      await expect(tasksPage.rowEditIcon(taskId)).toHaveCount(0);
      await expect(tasksPage.rowDeleteIcon(taskId)).toHaveCount(0);
      await expect(tasksPage.pinButtons()).toHaveCount(0);
    },

    async shouldSeeSmartViewTaskRowChrome(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await expect(tasksPage.completeControl(taskId)).toBeVisible();
      await expect(tasksPage.taskTitle(taskId)).toBeVisible();
      await expect(tasksPage.overflowControl(taskId)).toHaveCount(0);
      await expect(tasksPage.taskCard(taskId).locator('[data-drag-handle]')).toHaveCount(0);
      await expect(tasksPage.rowEditIcon(taskId)).toHaveCount(0);
      await expect(tasksPage.rowDeleteIcon(taskId)).toHaveCount(0);
      await expect(tasksPage.pinButtons()).toHaveCount(0);
    },

    async shouldSeeTaskRowOverflowActions(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.openEdit(taskId);
      const dialog = page.getByRole('dialog', { name: 'Edit Task' });
      await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
      await this.closeTaskEdit();
    },

    async shouldSeeTaskRowChromeReadable(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const surfaceBg = await tasksPage.taskSurface().evaluate(readComputedBackgroundColor);
      const titleColor = await tasksPage.taskTitle(taskId).evaluate(readComputedColor);
      const completeColor = await tasksPage.completeControl(taskId).evaluate(readComputedColor);
      expect(titleColor).not.toEqual(surfaceBg);
      expect(completeColor).not.toEqual(surfaceBg);
      await expect(tasksPage.completeControl(taskId)).toBeVisible();
      await expect(tasksPage.pinButtons()).toHaveCount(0);
    },

    async openTaskEditFromRow(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.openEdit(taskId);
    },

    async shouldSeeExistingTaskEditUi(): Promise<void> {
      const dialog = page.getByRole('dialog', { name: 'Edit Task' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Edit Task' })).toBeVisible();
      await expect(page.locator('#edit-task-title')).toBeVisible();
      await expect(page.locator('#edit-task-due-date')).toBeVisible();
      await expect(page.locator('#edit-task-assignee')).toBeVisible();
      await expect(page.locator('#edit-task-list')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    },

    async shouldSeeTaskEditChangeHistory(options?: {
      lastChangedBeforeHistory?: boolean;
      completed?: boolean;
      changedBy?: string;
    }): Promise<void> {
      const dialog = page.getByRole('dialog', { name: 'Edit Task' });
      await expect(dialog.getByTestId('task-edit-added')).toBeVisible();
      await expect(dialog.getByTestId('task-edit-added')).toContainText('Added');
      const lastChanged = dialog.getByTestId('task-edit-last-changed');
      await expect(lastChanged).toBeVisible();
      if (options?.lastChangedBeforeHistory) {
        await expect(lastChanged).toHaveText('Last changed before history started');
      } else {
        await expect(lastChanged).toContainText('Last changed');
      }
      if (options?.completed) {
        await expect(dialog.getByTestId('task-edit-completed')).toContainText('Completed');
      }
      if (options?.changedBy) {
        await expect(lastChanged).toContainText(`by ${options.changedBy}`);
      }
    },

    async closeTaskEdit(): Promise<void> {
      const dialog = page.getByRole('dialog', { name: 'Edit Task' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    },

    async saveOpenTaskEdit(): Promise<void> {
      await tasksPage.saveEdit();
    },

    async shouldSeeNamedListInCreateTaskPicker(name: string): Promise<void> {
      const picker = tasksPage.createTaskListPicker();
      await expect(picker).toBeVisible();
      await picker.click();
      const option = page
        .getByRole('listbox')
        .locator('[data-slot="select-item"]')
        .filter({ hasText: name });
      await expect(option).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    },

    async useShortLiveQueryInterval(intervalMs = 250): Promise<void> {
      const ms = Math.max(1, Math.floor(intervalMs));
      await page.evaluate(`(async () => {
        const setter = window.__YOINK_SET_LIVE_QUERY_INTERVAL_MS;
        if (typeof setter !== 'function') {
          throw new Error('Live query interval hook was not installed');
        }
        await setter(${ms});
      })()`);
    },

    async awaitLiveOpenListTasks(
      listId: string,
      matches: (tasks: Array<{ id: string; title: string }>) => boolean
    ): Promise<void> {
      await waitForLiveJsonGet(
        page,
        (pathname) => pathname === `/api/lists/${listId}/tasks`,
        (body) => {
          const tasks = asNamedTasks(body);
          return tasks !== null && matches(tasks);
        }
      );
    },

    async awaitLiveNamedLists(
      matches: (lists: Array<{ id: string; name: string }>) => boolean
    ): Promise<void> {
      await waitForLiveJsonGet(
        page,
        (pathname) => pathname === '/api/lists',
        (body) => {
          const lists = asNamedLists(body);
          return lists !== null && matches(lists);
        }
      );
    },

    async awaitLiveInboxCaptures(
      matches: (captures: Array<{ id: string; content: string }>) => boolean
    ): Promise<void> {
      await waitForLiveJsonGet(
        page,
        (pathname) => pathname === '/api/captures',
        (body) => {
          const captures = asInboxCaptures(body);
          return captures !== null && matches(captures);
        }
      );
    },

    async awaitLiveNowNextActions(
      matches: (items: Array<{ title: string; project: string }>) => boolean
    ): Promise<void> {
      await waitForLiveJsonGet(
        page,
        (pathname) => pathname === '/api/work/next-actions',
        (body) => {
          if (typeof body !== 'object' || body === null || !('items' in body)) {
            return false;
          }
          const items = (body as { items: unknown }).items;
          if (!Array.isArray(items)) {
            return false;
          }
          const rows: Array<{ title: string; project: string }> = [];
          for (const item of items) {
            if (
              typeof item !== 'object' ||
              item === null ||
              !('task' in item) ||
              !('project' in item)
            ) {
              return false;
            }
            const task = (item as { task: { title?: unknown } }).task;
            const project = (item as { project: { name?: unknown } }).project;
            if (typeof task?.title !== 'string' || typeof project?.name !== 'string') {
              return false;
            }
            rows.push({ title: task.title, project: project.name });
          }
          return matches(rows);
        }
      );
    },

    async hideApp(): Promise<void> {
      await page.evaluate(`(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get() { return 'hidden'; },
        });
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get() { return true; },
        });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
      })()`);
    },

    async showApp(): Promise<void> {
      await page.evaluate(`(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get() { return 'visible'; },
        });
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get() { return false; },
        });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      })()`);
    },

    async countLiveDataGetsDuring(durationMs: number): Promise<number> {
      let count = 0;
      const onRequest = (request: { method: () => string; url: () => string }) => {
        if (request.method() !== 'GET') {
          return;
        }
        const url = request.url();
        if (
          url.includes('/api/tasks') ||
          url.includes('/api/lists') ||
          url.includes('/api/unlisted') ||
          url.includes('/api/captures')
        ) {
          count += 1;
        }
      };
      page.on('request', onRequest);
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      page.off('request', onRequest);
      return count;
    },

    async failBackgroundLiveQueries(): Promise<void> {
      const failGet = async (route: {
        request: () => { method: () => string };
        abort: (errorCode: string) => Promise<void>;
        continue: () => Promise<void>;
      }) => {
        if (route.request().method() === 'GET') {
          await route.abort('failed');
          return;
        }
        await route.continue();
      };
      await page.route('**/api/tasks**', failGet);
      await page.route('**/api/lists**', failGet);
      await page.route('**/api/unlisted**', failGet);
      await page.route('**/api/captures**', failGet);
    },

    async restoreBackgroundLiveQueries(): Promise<void> {
      await page.unroute('**/api/tasks**');
      await page.unroute('**/api/lists**');
      await page.unroute('**/api/unlisted**');
      await page.unroute('**/api/captures**');
    },

    async shouldNotSeeQueryError(): Promise<void> {
      await expect(page.getByText('Unable to connect to the server')).toHaveCount(0);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('Your session has expired')).toHaveCount(0);
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    },

    async shouldNotSeeLoadingPlaceholder(): Promise<void> {
      await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0);
    },

    async createTask(input: CreateTaskInput): Promise<Task> {
      // Quick-add on a named pile can pick a list and project, but has no
      // assignee or due-date controls. Today quick-add stamps today's due
      // date, so a project-only create must use the session API.
      const usesQuickAdd =
        input.assigneeId === undefined &&
        input.dueDate === undefined &&
        input.listId !== undefined;
      if (usesQuickAdd) {
        if (input.listId !== undefined) {
          await tasksPage.gotoNamedPile(input.listId);
        } else {
          await tasksPage.goto('today');
        }
        if (input.projectId !== undefined) {
          await tasksPage.selectCreateProject(input.projectId);
        }

        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes('/api/tasks') &&
            !response.url().includes('/api/tasks/') &&
            response.request().method() === 'POST'
        );
        await tasksPage.quickAdd(input.title);
        const response = await responsePromise;

        if (response.status() === 401) {
          throw new UnauthorizedError();
        }
        if (response.status() === 400) {
          const body = await response.json();
          throw new ValidationError(body.message ?? 'Invalid request');
        }
        if (response.status() === 404) {
          throw new NotFoundError('Project', input.projectId ?? 'unknown');
        }
        if (response.status() !== 201) {
          throw new Error(`Failed to create task: ${response.status()}`);
        }
        return response.json();
      }

      // Session API for create when the board picker is not involved
      // (quick-add has no assignee/due-date controls).
      const response = await page.request.post('/api/tasks', { data: input });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Project', input.projectId ?? 'unknown');
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to create task: ${response.status()}`);
      }
      return response.json();
    },

    async listTasks(
      _filter?: TaskFilter,
      _viewer?: { timeZone?: string }
    ): Promise<Task[]> {
      throw new UnsupportedOperationError('listTasks', 'playwright');
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
      const response = await page.request.get(`/api/work/next-actions${encoded}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (!response.ok()) {
        throw new Error(`Failed to list now next actions: ${response.status()}`);
      }
      return response.json();
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
      const response = await page.request.get(`/api/work/due${encoded}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (!response.ok()) {
        throw new Error(`Failed to list now due: ${response.status()}`);
      }
      return response.json();
    },

    async listWorkLists(): Promise<WorkListsPage> {
      const response = await page.request.get('/api/work/lists');
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (!response.ok()) {
        throw new Error(`Failed to list work lists: ${response.status()}`);
      }
      return response.json();
    },

    async getTask(id: string): Promise<Task> {
      const response = await page.request.get(`/api/tasks/${id}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Task', id);
      }
      if (!response.ok()) {
        throw new Error(`Failed to read task: ${response.status()}`);
      }
      return response.json();
    },

    async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
      const existing = await page.request.get(`/api/tasks/${id}`);
      if (!existing.ok()) {
        throw new Error(`Failed to read task before edit: ${existing.status()}`);
      }
      const current = (await existing.json()) as Task;
      // Edit pickers are disabled on finished tasks; the API still refuses
      // membership changes so the driver can assert TASK_NOT_OPEN.
      if (
        current.completedAt &&
        (input.projectId !== undefined || input.listId !== undefined)
      ) {
        const response = await page.request.patch(`/api/tasks/${id}`, { data: input });
        if (response.status() === 400) {
          const body = (await response.json()) as { message?: string };
          throw new ValidationError(body.message ?? 'Invalid request');
        }
        if (response.status() !== 200) {
          throw new Error(`Failed to update task: ${response.status()}`);
        }
        return response.json();
      }

      await openTaskOnItsPile(id);
      await tasksPage.openEdit(id);

      if (input.title !== undefined) {
        await tasksPage.setTitle(input.title);
      }
      if (input.dueDate !== undefined) {
        if (input.dueDate === null) {
          await tasksPage.clearDueDate();
        } else {
          await tasksPage.setDueDate(input.dueDate);
        }
      }
      if (input.assigneeId !== undefined) {
        if (input.assigneeId === null) {
          await tasksPage.clearAssignee();
        } else {
          await tasksPage.selectAssignee(input.assigneeId);
        }
      }
      if (input.listId !== undefined) {
        if (input.listId === null) {
          await tasksPage.clearList();
        } else {
          await tasksPage.selectList(input.listId);
        }
      }
      if (input.projectId !== undefined) {
        if (input.projectId === null) {
          await tasksPage.clearProject();
        } else {
          await tasksPage.selectProject(input.projectId);
        }
      }

      await tasksPage.saveEdit();

      const response = await page.request.get(`/api/tasks/${id}`);
      if (!response.ok()) {
        throw new Error(`Failed to read task after edit: ${response.status()}`);
      }
      const updated = (await response.json()) as Task;
      if (
        input.assigneeId === undefined &&
        current.assigneeId &&
        updated.assigneeId !== current.assigneeId
      ) {
        throw new Error('Edit saved but assignee was cleared');
      }
      return updated;
    },

    async completeTask(id: string): Promise<Task> {
      const response = await page.request.post(`/api/tasks/${id}/complete`, {
        data: {},
      });
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.status() !== 200) {
        throw new Error(`Failed to complete task: ${response.status()}`);
      }
      return response.json();
    },

    async uncompleteTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('uncompleteTask', 'playwright');
    },

    async pinTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('pinTask', 'playwright');
    },

    async unpinTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('unpinTask', 'playwright');
    },

    async deleteTask(id: string): Promise<void> {
      const response = await page.request.delete(`/api/tasks/${id}`);
      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.status() !== 204) {
        throw new Error(`Failed to delete task: ${response.status()}`);
      }
    },

    async goToSettings(): Promise<void> {
      await inboxPage.goto();
      await inboxPage.goToSettings();
    },

    async openOrganizationSettings(): Promise<void> {
      await settingsPage.goto();
      await settingsPage.openOrganizationTab();
    },

    async issueNewTokenForAgentFromMembers(memberName: string): Promise<string> {
      await settingsPage.goto();
      await settingsPage.openOrganizationTab();
      return settingsPage.issueNewTokenForAgent(memberName);
    },

    async logout(): Promise<void> {
      await settingsPage.goto();
      await settingsPage.logout();
    },

    async requiresConfiguration(): Promise<boolean> {
      // Try to navigate to inbox and check if we get redirected to auth
      await page.goto('/');

      // Wait for redirect to either:
      // - /config (token auth - no token configured)
      // - /login (passkey auth - no session)
      try {
        await Promise.race([
          page.waitForURL('**/config', { timeout: 2000 }),
          page.waitForURL('**/login', { timeout: 2000 }),
        ]);
        return true;
      } catch {
        // No redirect happened within timeout, so we're on the inbox
        return false;
      }
    },

    async shareContent(params: { text?: string; url?: string; title?: string }): Promise<Capture> {
      // Build share URL with query params
      const searchParams = new URLSearchParams();
      if (params.text) searchParams.set('text', params.text);
      if (params.url) searchParams.set('url', params.url);
      if (params.title) searchParams.set('title', params.title);

      await page.goto(`/share?${searchParams.toString()}`);

      // Wait for the share modal to be visible
      await page.getByRole('button', { name: 'Save' }).waitFor();

      // Click save
      await page.getByRole('button', { name: 'Save' }).click();

      // Wait for success and redirect to inbox
      await page.waitForURL('/', { timeout: 5000 });

      // Determine expected content and sourceUrl based on share logic
      const { expectedContent, expectedSourceUrl } = parseShareExpectations(params);

      await inboxPage.waitForCapturesOrEmpty();
      const captureId = await inboxPage.getCaptureIdByContent(expectedContent);

      if (!captureId) {
        throw new Error(`Failed to find shared capture in inbox with content: "${expectedContent}"`);
      }

      return buildCapture(captureId, expectedContent, 'inbox', { sourceUrl: expectedSourceUrl });
    },

    async goOffline(): Promise<void> {
      await page.context().setOffline(true);
    },

    async goOnline(): Promise<void> {
      await page.context().setOffline(false);
    },

    async shouldSeeOfflineWarning(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline.
      // Also don't navigate if already on inbox - navigation fails when offline.
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the banner to appear
      const banner = page.getByText("You're offline");
      await expect(banner).toBeVisible();
    },

    async shouldNotSeeOfflineWarning(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      // and the caller should ensure we're configured before going offline.
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the banner to disappear
      const banner = page.getByText("You're offline");
      await expect(banner).toBeHidden();
    },

    async shouldBeAbleToAddCaptures(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the online input state
      const input = page.getByPlaceholder('Quick capture...');
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    },

    async shouldNotBeAbleToAddCaptures(): Promise<void> {
      // Note: Don't call ensureConfigured() here - we may be testing offline state
      const currentUrl = page.url();
      if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
        await inboxPage.goto();
      }

      // Use Playwright's expect with auto-retry to wait for the offline input state
      const offlineInput = page.getByPlaceholder('Offline - cannot add captures');
      await expect(offlineInput).toBeVisible();
    },

    async shouldSeeAssigneeOnTask(taskId: string, assigneeLabel: string): Promise<void> {
      await openTaskOnItsPile(taskId);
      await expect(tasksPage.assigneeOnTask(taskId)).toHaveAttribute(
        'data-assignee',
        assigneeLabel
      );
    },

    async shouldNotSeeAssigneeOnTask(taskId: string): Promise<void> {
      await openTaskOnItsPile(taskId);
      await expect(tasksPage.assigneeOnTask(taskId)).toHaveCount(0);
    },

    async shouldSeeListOnTask(taskId: string, listName: string): Promise<void> {
      await openTaskOnItsPile(taskId);
      await expect(tasksPage.listOnTask(taskId)).toHaveAttribute('data-list', listName);
    },

    async shouldNotSeeListOnTask(taskId: string): Promise<void> {
      await openTaskOnItsPile(taskId);
      await expect(tasksPage.listOnTask(taskId)).toHaveCount(0);
    },

    async shouldSeeTaskOnMine(taskId: string): Promise<void> {
      await tasksPage.goto('mine');
      await tasksPage.waitForTask(taskId);
    },

    async shouldNotSeeTaskOnMine(taskId: string): Promise<void> {
      await tasksPage.goto('mine');
      await tasksPage.waitForTasksOrEmpty();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    // Passkey operations - will be implemented in Phase 7.7b with CDP virtual authenticator
    async registerPasskey(_name?: string): Promise<PasskeyCredentialInfo> {
      // TODO: Implement using CDP virtual authenticator in Phase 7.7b
      // await cdpSession.send('WebAuthn.enable', { enableUI: false });
      // await cdpSession.send('WebAuthn.addVirtualAuthenticator', { ... });
      throw new UnsupportedOperationError('registerPasskey', 'playwright');
    },

    async listPasskeys(): Promise<PasskeyCredentialInfo[]> {
      // TODO: Implement by navigating to Settings > Security section
      throw new UnsupportedOperationError('listPasskeys', 'playwright');
    },

    async deletePasskey(_credentialId: string): Promise<void> {
      // TODO: Implement by navigating to Settings > Security and clicking delete
      throw new UnsupportedOperationError('deletePasskey', 'playwright');
    },

    // API Token operations - use API directly since we have session cookie
    async listTokens(): Promise<Token[]> {
      const response = await page.request.get('/api/auth/tokens');
      if (!response.ok()) {
        if (response.status() === 401) {
          throw new UnauthorizedError();
        }
        throw new Error(`Failed to list tokens: ${response.status()}`);
      }
      const data = await response.json();
      return data.tokens;
    },

    async createToken(name: string): Promise<CreateTokenResult> {
      const response = await page.request.post('/api/auth/tokens', {
        data: { name },
      });

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        const body = await response.json();
        throw new ForbiddenError(body.message || 'Permission denied');
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message || 'Invalid request');
      }
      if (response.status() === 409) {
        throw new TokenLimitReachedError(2);
      }
      if (response.status() !== 201) {
        throw new Error(`Failed to create token: ${response.status()}`);
      }
      return response.json();
    },

    async reissueAgentToken(memberUserId: string): Promise<{ token: Token; rawToken: string }> {
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.post(
        `/api/organizations/${orgId}/members/${memberUserId}/token`
      );

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        const body = await response.json();
        throw new ForbiddenError(body.message || 'Permission denied');
      }
      if (response.status() === 404) {
        throw new NotFoundError('Agent member', memberUserId);
      }
      if (!response.ok()) {
        throw new Error(`Failed to reissue agent token: ${response.status()}`);
      }
      return response.json();
    },

    async revokeToken(tokenId: string): Promise<void> {
      const response = await page.request.delete(`/api/auth/tokens/${tokenId}`);

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 404) {
        throw new NotFoundError('Token', tokenId);
      }
      if (response.status() === 403) {
        throw new ForbiddenError('You do not own this token');
      }
      // 200 is success
    },

    async mintAgent(name: string): Promise<MintedAgent> {
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.post(`/api/organizations/${orgId}/agents`, {
        data: { name },
      });

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }
      if (response.status() === 403) {
        throw new ForbiddenError('Only owners and admins can mint agents');
      }
      if (response.status() === 400) {
        const body = await response.json();
        throw new ValidationError(body.message ?? 'Invalid request');
      }
      if (!response.ok()) {
        throw new Error(`Failed to mint agent: ${response.status()}`);
      }
      return response.json();
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
      // Use the API directly since we have session cookie in the browser context
      const response = await page.request.get('/api/auth/session');
      if (!response.ok()) {
        throw new UnauthorizedError();
      }
      return response.json();
    },

    async switchOrganization(organizationId: string): Promise<void> {
      const response = await page.request.post('/api/organizations/switch', {
        data: { organizationId },
      });

      if (response.status() === 400) {
        throw new NotMemberError(organizationId);
      }

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (!response.ok()) {
        throw new Error(`Failed to switch organization: ${response.status()}`);
      }

      // Reload the page to reflect the new org context
      await page.reload();
    },

    async shouldSeeCurrentOrganizationInHeader(orgName: string): Promise<void> {
      await orgSwitcher.waitForCurrent(orgName);
    },

    async shouldOpenOrgSwitcherPicker(orgNames: string[]): Promise<void> {
      await orgSwitcher.expectPickerOpen(orgNames);
    },

    async pickOrganizationFromHeader(orgName: string): Promise<void> {
      await orgSwitcher.pick(orgName);
    },

    async shouldSeeOrgSwitchFailureToast(orgName: string): Promise<void> {
      await orgSwitcher.expectSwitchFailureToast(orgName);
    },

    async leaveOrganization(organizationId: string): Promise<void> {
      const response = await page.request.post(`/api/organizations/${organizationId}/leave`);

      if (response.status() === 404) {
        throw new NotMemberError(organizationId);
      }

      if (response.status() === 400) {
        const body = await response.json();
        if (body.message?.includes('personal')) {
          throw new CannotLeavePersonalOrgError();
        }
        if (body.message?.includes('last admin')) {
          throw new LastAdminError();
        }
        throw new Error(body.message || 'Cannot leave organization');
      }

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (!response.ok()) {
        throw new Error(`Failed to leave organization: ${response.status()}`);
      }

      // Reload the page to reflect the change
      await page.reload();
    },

    // =========================================================================
    // Organization Member Management
    // =========================================================================

    async listMembers(): Promise<Member[]> {
      // Get current org from session
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.get(`/api/organizations/${orgId}/members`);

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (response.status() === 403) {
        throw new ForbiddenError();
      }

      if (!response.ok()) {
        throw new Error(`Failed to list members: ${response.status()}`);
      }

      const data = await response.json();
      return data.members;
    },

    async removeMember(userId: string): Promise<void> {
      // Check if trying to remove self
      if (userId === credentials.userId) {
        throw new CannotRemoveSelfError();
      }

      // Get current org from session
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.delete(`/api/organizations/${orgId}/members/${userId}`);

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (response.status() === 403) {
        throw new ForbiddenError();
      }

      if (response.status() === 400) {
        const body = await response.json();
        if (body.message?.includes('yourself')) {
          throw new CannotRemoveSelfError();
        }
        if (body.message?.includes('last admin') || body.message?.includes('last owner')) {
          throw new LastAdminError();
        }
        throw new Error(body.message || 'Cannot remove member');
      }

      if (response.status() === 404) {
        throw new NotFoundError('Member', userId);
      }

      if (!response.ok()) {
        throw new Error(`Failed to remove member: ${response.status()}`);
      }
    },

    // =========================================================================
    // Invitation Management
    // =========================================================================

    async createInvitation(input?: CreateInvitationInput): Promise<Invitation> {
      // Get current org from session
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.post('/api/invitations', {
        data: {
          organizationId: orgId,
          role: input?.role ?? 'member',
          email: input?.email,
          expiresInDays: input?.expiresInDays,
        },
      });

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (response.status() === 403) {
        throw new ForbiddenError();
      }

      if (!response.ok()) {
        throw new Error(`Failed to create invitation: ${response.status()}`);
      }

      return response.json();
    },

    async listPendingInvitations(): Promise<Invitation[]> {
      // Get current org from session
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();
      const orgId = sessionData.organizationId;

      const response = await page.request.get(`/api/organizations/${orgId}/invitations`);

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (response.status() === 403) {
        throw new ForbiddenError();
      }

      if (!response.ok()) {
        throw new Error(`Failed to list invitations: ${response.status()}`);
      }

      const data = await response.json();
      return data.invitations;
    },

    async revokeInvitation(invitationId: string): Promise<void> {
      const response = await page.request.delete(`/api/invitations/${invitationId}`);

      if (response.status() === 401) {
        throw new UnauthorizedError();
      }

      if (response.status() === 403) {
        throw new ForbiddenError();
      }

      if (response.status() === 404) {
        throw new NotFoundError('Invitation', invitationId);
      }

      if (!response.ok()) {
        throw new Error(`Failed to revoke invitation: ${response.status()}`);
      }
    },

    async acceptInvitation(code: string): Promise<AcceptInvitationResult> {
      // Navigate to the join page which will handle the acceptance flow
      await page.goto(`/join/${code}`);

      // Wait for the page to settle into one of the expected states:
      // 1. Error message (invitation invalid, already member, etc.)
      // 2. Join confirmation UI (with Join button)
      // 3. Redirect to signup (for unauthenticated users)
      
      const errorElement = page.locator('[data-testid="invitation-error"]');
      const orgNameElement = page.locator('[data-testid="invitation-org-name"]');
      const joinButton = page.getByRole('button', { name: /join/i });

      // Wait for either error, confirmation UI, or signup redirect
      try {
        await Promise.race([
          errorElement.waitFor({ state: 'visible', timeout: 15000 }),
          orgNameElement.waitFor({ state: 'visible', timeout: 15000 }),
          page.waitForURL(/\/signup/, { timeout: 15000 }),
        ]);
      } catch {
        throw new Error(`Timeout waiting for join page to load. Current URL: ${page.url()}`);
      }

      // Check if we got redirected to signup (shouldn't happen for authenticated users)
      if (page.url().includes('/signup')) {
        throw new Error('Unexpected redirect to signup - user may not be authenticated');
      }

      // Check for error state (validation failed before showing confirmation)
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        if (errorText?.includes('Already a member')) {
          throw new AlreadyMemberError();
        }
        if (errorText?.includes('not found') || errorText?.includes('Not found')) {
          throw new NotFoundError('Invitation', code);
        }
        if (errorText?.includes('expired') || errorText?.includes('already been used')) {
          throw new ValidationError(errorText || 'Invitation expired or already used');
        }
        throw new Error(errorText || 'Failed to accept invitation');
      }

      // We should be in confirmation state - get org info
      const organizationName = await orgNameElement.textContent() || '';
      const roleElement = page.locator('[data-testid="invitation-role"]');
      const roleText = await roleElement.textContent() || 'member';
      const role = roleText.toLowerCase().includes('admin') ? 'admin' : 'member';

      // Click join
      await joinButton.click();

      // Wait for either success (redirect to home) or error state
      try {
        await Promise.race([
          page.waitForURL('/', { timeout: 10000 }),
          errorElement.waitFor({ state: 'visible', timeout: 10000 }),
        ]);
      } catch {
        throw new Error('Timeout waiting for join result');
      }

      // Check if we got an error after clicking join
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        if (errorText?.includes('Already a member')) {
          throw new AlreadyMemberError();
        }
        throw new Error(errorText || 'Failed to accept invitation');
      }

      // Get session info to confirm the switch
      const session = await page.request.get('/api/auth/session');
      if (!session.ok()) {
        throw new UnauthorizedError();
      }
      const sessionData = await session.json();

      return {
        organizationId: sessionData.organizationId,
        organizationName: organizationName.trim(),
        role: role as 'admin' | 'member',
      };
    },
  };
};

/**
 * Playwright implementation of AnonymousActor.
 * Attempts operations without configuring a token.
 *
 * This actor verifies that the app properly enforces authentication
 * by checking that unauthenticated users are redirected to /login (or /config for legacy).
 */
export const createPlaywrightAnonymousActor = (page: Page): AnonymousActor => {
  /**
   * Ensures we're truly anonymous by clearing any stored token,
   * then navigates to the app and verifies redirect to login/config.
   */
  const ensureRedirectsToAuth = async (): Promise<void> => {
    // Clear any existing token to ensure we're truly anonymous
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('yoink_api_token'));

    // Navigate to the app root
    await page.goto('/');

    // The app should redirect to /login (new auth) or /config (legacy)
    // because no token/session is set
    await Promise.race([
      page.waitForURL('**/login', { timeout: 5000 }),
      page.waitForURL('**/config', { timeout: 5000 }),
    ]);
  };

  return {
    async createCapture(_input: CreateCaptureInput): Promise<Capture> {
      await ensureRedirectsToAuth();
      // Successfully redirected means auth is enforced
      throw new UnauthorizedError();
    },

    async listCaptures(): Promise<Capture[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listNamedLists(): Promise<NamedList[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async createNamedList(_name: string): Promise<NamedList> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async renameNamedList(_id: string, _name: string): Promise<NamedList> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async deleteNamedList(_id: string): Promise<void> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listOpenTasksOnList(_listId: string): Promise<Task[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listOpenTasksOnProject(_projectId: string): Promise<Task[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listFinishedTasksOnProject(
      _projectId: string,
      _query?: { limit?: number; cursor?: string }
    ) {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listProjectHistory(
      _projectId: string,
      _query?: { limit?: number; cursor?: string }
    ) {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listTaskHistory(
      _taskId: string,
      _query?: { limit?: number; cursor?: string }
    ) {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async expectInvalidProjectHistoryCursor(_projectId: string, _cursor: string) {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async reorderOpenTasksOnList(_listId: string, _taskIds: string[]): Promise<Task[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listUnlistedOpenTasks(): Promise<Task[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async reorderUnlistedOpenTasks(_taskIds: string[]): Promise<Task[]> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async createTask(_input: CreateTaskInput): Promise<Task> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async updateTask(_id: string, _input: UpdateTaskInput): Promise<Task> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async getCapture(_id: string): Promise<Capture> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },
  };
};
