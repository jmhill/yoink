import { type Page, expect } from '@playwright/test';
import type {
  Actor,
  AnonymousActor,
  Capture,
  NamedList,
  Task,
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
  CreateInvitationInput,
  MintedAgent,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
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
  TrashPage,
  SettingsPage,
  SnoozedPage,
  TasksPage,
} from './page-objects.js';

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
  const mobileNav = new MobileNav(page);
  const orgSwitcher = new OrganizationSwitcherChrome(page);

  const expectActiveFilterTabIfVisible = async (
    filter: 'today' | 'upcoming' | 'mine' | 'completed'
  ): Promise<void> => {
    const tabName = {
      today: 'Today',
      upcoming: /Upcoming|Soon/,
      mine: 'Mine',
      completed: 'Done',
    }[filter];
    const tab = page.getByRole('tab', { name: tabName });
    // Filter tabs stay on desktop. Mobile picks smart views from the Tasks rail.
    if ((await tab.count()) > 0) {
      await expect(tab).toHaveAttribute('data-state', 'active');
    }
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
      await tasksPage.waitForTasksOrEmpty();
      // Desktop sidebar stays visible. Mobile drawer stays closed so content
      // owns the screen; createNamedListFromRail proves the rail row.
      if (await appRail.desktop().isVisible().catch(() => false)) {
        await expect(appRail.itemByLabel(created.name)).toBeVisible();
      }
      return created;
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
      await appRail.openItem(name);
      await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldSeeOpenTasksInOrder(titles: string[]): Promise<void> {
      await tasksPage.waitForTasksOrEmpty();
      await expect.poll(async () => tasksPage.getOpenTaskTitles()).toEqual(titles);
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
      await appRail.openItem(name);
      await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openAllUnlistedPile(): Promise<void> {
      await appRail.openItem('Unlisted');
      await page.waitForURL(/[?&]pile=unlisted/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await expect(page.locator('[data-pile-group]')).toHaveCount(0);
      await tasksPage.waitForTasksOrEmpty();
    },

    async shouldSeeAllPileGroups(names: string[]): Promise<void> {
      await expect.poll(async () => tasksPage.getAllPileGroupNames()).toEqual(names);
    },

    async shouldSeeTasksInAllPileGroup(groupName: string, titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getTitlesInPileGroup(groupName))
        .toEqual(titles);
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
      await expect.poll(async () => appRail.isItemActive('Mine')).toBe(true);
    },

    async shouldSeeReorderControls(): Promise<void> {
      await expect(tasksPage.dragHandles().first()).toBeVisible();
    },

    async shouldSeeTaskTitles(titles: string[]): Promise<void> {
      await expect
        .poll(async () => tasksPage.getBoardTaskTitles(), { timeout: 10_000 })
        .toEqual(titles);
    },

    async shouldNotSeeTask(taskId: string): Promise<void> {
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
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
        mine: 'Mine',
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
      await tasksPage.waitForTasksOrEmpty();
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
      await expect.poll(async () => appRail.getItemLabels()).toEqual(labels);
    },

    async shouldSeeInboxCountOnRail(count: number): Promise<void> {
      await expect.poll(async () => appRail.getInboxCount()).toBe(count);
    },

    async shouldNotSeeInboxCountOnRail(): Promise<void> {
      await expect.poll(async () => appRail.getInboxCount()).toBeNull();
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
          today: order.indexOf('Today'),
          done: order.indexOf('Done'),
          lists: order.indexOf('Lists'),
        };
      }).toEqual({
        inbox: 0,
        family: 1,
        today: 2,
        done: 5,
        lists: 6,
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
      await appRail.openItem(name);
      await page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openRailUnlisted(): Promise<void> {
      await appRail.openItem('Unlisted');
      await page.waitForURL(/[?&]pile=unlisted/);
      await expect(page).not.toHaveURL(/[?&]filter=all/);
      await tasksPage.waitForTasksOrEmpty();
    },

    async openRailSmartView(view: 'today' | 'upcoming' | 'mine' | 'done'): Promise<void> {
      const label = {
        today: 'Today',
        upcoming: 'Upcoming',
        mine: 'Mine',
        done: 'Done',
      }[view];
      const filter = view === 'done' ? 'completed' : view;
      await appRail.openItem(label);
      await page.waitForURL(new RegExp(`[?&]filter=${filter}`));
      await expectActiveFilterTabIfVisible(filter);
      await tasksPage.waitForTasksOrEmpty();
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
      await tasksPage.waitForTasksOrEmpty();
      return {
        id: created.id,
        name: created.name,
        organizationId: credentials.organizationId,
        createdById: credentials.userId,
        createdAt: new Date().toISOString(),
      };
    },

    async shouldSeeNamedListOverflowOnRail(name: string): Promise<void> {
      await appRail.waitForVisible();
      await expect(appRail.overflowByLabel(name)).toBeVisible();
      await appRail.openOverflow(name);
      const deleteItem = page.getByRole('menuitem', { name: 'Delete', exact: true });
      await expect(deleteItem).toBeVisible();
      await page.getByRole('menu').press('Escape');
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

    async openRailInbox(): Promise<void> {
      await appRail.openItem('Inbox');
      await page.waitForURL((url) => new URL(url).pathname === '/');
      await inboxPage.waitForCapturesOrEmpty();
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

    async shouldSeeRailInboxHighlighted(): Promise<void> {
      await expect.poll(async () => appRail.isItemActive('Inbox')).toBe(true);
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

    async shouldSeeInboxTriageSurface(toProcessCount: number): Promise<void> {
      await expect(inboxPage.triageSurface()).toBeVisible();
      await expect(inboxPage.triageHeading()).toBeVisible();
      await expect(inboxPage.triageSubcopy()).toHaveText(
        `${toProcessCount} to process · references & triage`
      );
      await expect(tasksPage.taskSurface()).toHaveCount(0);
    },

    async shouldSeeTaskSurface(): Promise<void> {
      await expect(tasksPage.taskSurface()).toBeVisible();
      await expect(inboxPage.triageSurface()).toHaveCount(0);
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
          response.url().includes('/api/captures/') &&
          response.url().includes('/process') &&
          response.request().method() === 'POST'
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
          response.url().includes('/api/captures/') &&
          response.url().includes('/process') &&
          response.request().method() === 'POST'
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
      await page.setViewportSize(MOBILE_VIEWPORT);
    },

    async useDesktopViewport(): Promise<void> {
      await page.setViewportSize(DESKTOP_VIEWPORT);
    },

    async openMobileBottomTab(tab: 'inbox' | 'tasks'): Promise<void> {
      const label = tab === 'inbox' ? 'Inbox' : 'Tasks';
      await mobileNav.open(label);
      if (tab === 'inbox') {
        await inboxPage.waitForCapturesOrEmpty();
        return;
      }
      await tasksPage.waitForTasksOrEmpty();
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
      await expect(page.locator('#create-task-title')).toBeVisible();
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

    async uncompleteTaskFromRow(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.completeControl(taskId).click();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async completeOpenTaskBySwipe(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      await tasksPage.swipeTaskRow(taskId, { x: 140, y: 0 });
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
      expect(aligned(geometry.editCenterY)).toBe(true);
      expect(aligned(geometry.deleteCenterY)).toBe(true);
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
      await tasksPage.deleteControl(taskId).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Delete task?' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(tasksPage.taskCard(taskId)).toHaveCount(0);
    },

    async shouldNotOpenTaskEditFromTitle(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const title = tasksPage.taskTitle(taskId);
      await expect(title).toBeVisible();
      await expect(title).not.toHaveRole('button');
      const card = tasksPage.taskCard(taskId);
      const titleText = (await title.innerText()).trim();
      await expect(card.getByRole('button', { name: titleText, exact: true })).toHaveCount(0);
      await title.click();
      await expect(page.getByRole('dialog', { name: 'Edit Task' })).toHaveCount(0);
    },

    async shouldSeeTaskEditControl(taskId: string): Promise<void> {
      await tasksPage.waitForTask(taskId);
      const edit = tasksPage.editControl(taskId);
      await expect(edit).toBeVisible();
      await expect(edit).toHaveRole('button');
      const box = await edit.boundingBox();
      if (!box) {
        throw new Error('edit control should have a layout box');
      }
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
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
    },

    async closeTaskEdit(): Promise<void> {
      const dialog = page.getByRole('dialog', { name: 'Edit Task' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    },

    async createTask(input: CreateTaskInput): Promise<Task> {
      // Quick-add can pick a list, but has no assignee or due-date controls.
      // Use the session API when those fields are present so setup is exact.
      if (input.listId !== undefined && input.assigneeId === undefined && input.dueDate === undefined) {
        await tasksPage.gotoNamedPile(input.listId);

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
      if (response.status() !== 201) {
        throw new Error(`Failed to create task: ${response.status()}`);
      }
      return response.json();
    },

    async listTasks(_filter?: TaskFilter): Promise<Task[]> {
      throw new UnsupportedOperationError('listTasks', 'playwright');
    },

    async getTask(_id: string): Promise<Task> {
      throw new UnsupportedOperationError('getTask', 'playwright');
    },

    async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
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

      await tasksPage.saveEdit();

      const response = await page.request.get(`/api/tasks/${id}`);
      if (!response.ok()) {
        throw new Error(`Failed to read task after edit: ${response.status()}`);
      }
      return response.json();
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

    async deleteTask(_id: string): Promise<void> {
      throw new UnsupportedOperationError('deleteTask', 'playwright');
    },

    async goToSettings(): Promise<void> {
      await inboxPage.goto();
      await inboxPage.goToSettings();
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

    async deleteNamedList(_id: string): Promise<void> {
      await ensureRedirectsToAuth();
      throw new UnauthorizedError();
    },

    async listOpenTasksOnList(_listId: string): Promise<Task[]> {
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
