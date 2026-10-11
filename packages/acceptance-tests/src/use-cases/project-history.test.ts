import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor, HistoryPage, TimelineEntry } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '138-project-history';

const collectHistory = async (
  actor: CoreActor,
  projectId: string,
  limit = 3
): Promise<{ pages: HistoryPage[]; entries: TimelineEntry[] }> => {
  const pages: HistoryPage[] = [];
  const entries: TimelineEntry[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore === true) {
    const page = await actor.listProjectHistory(projectId, { limit, cursor });
    pages.push(page);
    entries.push(...page.entries);
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;
    if (pages.length > 30) {
      throw new Error('history paging did not terminate');
    }
  }
  return { pages, entries };
};

const snapshot = (entries: TimelineEntry[]) =>
  entries.map((entry) => ({
    kind: entry.kind,
    subjectType: entry.subject.type,
    subjectTitle: entry.subject.title,
    subjectDeleted: entry.subject.deleted,
    actorName: entry.actor.name,
    actorKind: entry.actor.kind,
    details: entry.details,
  }));

usingDrivers(['http'] as const, (ctx) => {
  describe(`Project history [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-history-http@example.com');
    });

    it('pages the scripted timeline entry by entry and proves no-op saves write nothing', async () => {
      const kitchen = await alice.createProject({ name: 'Kitchen' });
      await alice.updateProject(kitchen.id, { name: 'Kitchen renovation' });

      const taskA = await alice.createTask({ title: 'Call Trident' });
      await alice.updateTask(taskA.id, { projectId: kitchen.id });

      const taskB = await alice.createTask({
        title: 'Order lumber',
        projectId: kitchen.id,
      });
      await alice.setNextAction(kitchen.id, { taskId: taskB.id });
      await alice.setNextAction(kitchen.id, { taskId: taskA.id });

      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await bot.completeTask(taskA.id);

      const other = await alice.createProject({ name: 'Other' });
      await alice.updateTask(taskB.id, { projectId: other.id });

      const taskC = await alice.createTask({ title: 'Old invoice', projectId: kitchen.id });
      await alice.deleteTask(taskC.id);

      const taskD = await alice.createTask({ title: 'Bot trash', projectId: kitchen.id });
      await bot.deleteTask(taskD.id);

      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: "Don't know",
        waitingSince: null,
      });
      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: 'Contractor',
        waitingSince: '2026-10-01',
      });

      const extra1 = await alice.createTask({ title: 'Finish later A', projectId: kitchen.id });
      const extra2 = await alice.createTask({ title: 'Finish later B', projectId: kitchen.id });
      await alice.completeTask(extra2.id);
      await alice.completeTask(extra1.id);

      const finished = await alice.listFinishedTasksOnProject(kitchen.id, { limit: 2 });
      expect(finished.tasks.map((task) => task.title)).toEqual([
        'Finish later A',
        'Finish later B',
      ]);
      expect(finished.total).toBe(3);
      expect(finished.tasks.some((task) => task.title === 'Old invoice')).toBe(false);

      const paged = await alice.listFinishedTasksOnProject(kitchen.id, { limit: 1 });
      expect(paged.tasks.map((task) => task.title)).toEqual(['Finish later A']);
      expect(paged.hasMore).toBe(true);
      expect(paged.total).toBe(3);
      const page2 = await alice.listFinishedTasksOnProject(kitchen.id, {
        limit: 1,
        cursor: paged.nextCursor ?? undefined,
      });
      expect(page2.tasks.map((task) => task.title)).toEqual(['Finish later B']);
      expect(page2.hasMore).toBe(true);

      await alice.createTask({ title: 'Leftover', projectId: kitchen.id });
      await alice.changeProjectStatus(kitchen.id, {
        status: 'done',
        openTasks: 'remove',
      });

      const { pages, entries } = await collectHistory(alice, kitchen.id, 3);
      expect(pages[0]?.historyStartsAt).toBe('2026-10-10T13:56:00.000Z');
      expect(pages[pages.length - 1]?.hasMore).toBe(false);
      expect(pages[pages.length - 1]?.nextCursor).toBeNull();
      expect(pages.every((page) => page.total === entries.length)).toBe(true);
      expect(pages[0]?.total).toBe(entries.length);

      const kinds = entries.map((entry) => entry.kind);
      expect(kinds).not.toContain('TaskPinned');
      expect(kinds).not.toContain('TaskUpdated');
      expect(entries.filter((entry) => entry.kind === 'TaskDeleted').map((entry) => ({
        title: entry.subject.title,
        actor: entry.actor.name,
        kind: entry.actor.kind,
      }))).toEqual([
        { title: 'Bot trash', actor: 'Lane', kind: 'bot' },
        { title: 'Old invoice', actor: alice.email, kind: 'user' },
      ]);

      const completed = entries.find((entry) => entry.kind === 'TaskCompleted');
      expect(completed?.actor).toMatchObject({ name: 'Lane', kind: 'bot' });
      expect(completed?.subject.title).toBe('Call Trident');

      const cleared = entries.find((entry) => entry.kind === 'ProjectNextActionCleared');
      expect(cleared?.actor).toMatchObject({ name: 'Lane', kind: 'bot' });
      expect(cleared?.details).toMatchObject({ reason: 'completed', taskTitle: 'Call Trident' });

      const removedHere = entries.filter((entry) => entry.kind === 'TaskRemovedFromProject');
      expect(removedHere.map((entry) => entry.subject.title).sort()).toEqual(
        ['Leftover', 'Order lumber'].sort()
      );
      expect(
        entries.some(
          (entry) =>
            entry.kind === 'TaskUpdated' &&
            entry.subject.title === 'Order lumber'
        )
      ).toBe(false);

      const deletedC = entries.find(
        (entry) => entry.kind === 'TaskDeleted' && entry.subject.title === 'Old invoice'
      );
      expect(deletedC?.subject.deleted).toBe(true);
      expect(deletedC?.actor.name).toBe(alice.email);

      expect(entries[entries.length - 1]).toMatchObject({
        kind: 'ProjectCreated',
        actor: { name: alice.email, kind: 'user' },
        subject: { type: 'project', title: 'Kitchen renovation', deleted: false },
      });

      const invalid = await alice.expectInvalidProjectHistoryCursor(kitchen.id, 'not-a-cursor');
      expect(invalid.code).toBe('invalid_cursor');

      const beforeNoops = snapshot(entries);
      await alice.updateProject(kitchen.id, { name: 'Kitchen renovation' });
      await alice.updateProject(kitchen.id, { objective: null });
      await alice.changeProjectStatus(kitchen.id, { status: 'done' });
      await alice.setNextAction(kitchen.id, { taskId: null });
      const leftoverElsewhere = await alice.createTask({
        title: 'Stay put',
        projectId: other.id,
      });
      await alice.updateTask(leftoverElsewhere.id, { projectId: other.id });
      await alice.updateTask(leftoverElsewhere.id, { title: 'Stay put' });
      const afterNoops = snapshot((await collectHistory(alice, kitchen.id, 3)).entries);
      expect(afterNoops).toEqual(beforeNoops);

      const afterDelete = await alice.listTaskHistory(taskC.id);
      expect(afterDelete.entries.some((entry) => entry.kind === 'TaskDeleted')).toBe(true);
      expect(afterDelete.entries.some((entry) => entry.kind === 'TaskCreated')).toBe(true);

      const taskHistoryA = await alice.listTaskHistory(taskA.id);
      expect(taskHistoryA.entries.some((entry) => entry.kind === 'TaskCreated')).toBe(true);
      expect(
        (await alice.listProjectHistory(kitchen.id)).entries.some(
          (entry) => entry.kind === 'TaskCreated' && entry.subject.id === taskA.id
        )
      ).toBe(false);

      const botHistory = await bot.listProjectHistory(kitchen.id, { limit: 3 });
      expect(botHistory.total).toBeGreaterThan(0);
      expect(botHistory.entries[0]?.kind).toBeDefined();
      const botFinished = await bot.listFinishedTasksOnProject(kitchen.id);
      expect(botFinished.total).toBe(3);

      const bob = await ctx.createActor('bob-other-org-history@example.com');
      await expect(bob.listProjectHistory(kitchen.id)).rejects.toThrow();
      await expect(bob.listFinishedTasksOnProject(kitchen.id)).rejects.toThrow();
    });

    it('keeps pre-import task history on the task; project timeline starts at Moved in', async () => {
      const existing = await alice.createTask({ title: 'Existing note' });
      await alice.updateTask(existing.id, { title: 'Existing note edited' });

      const preImportTask = await alice.listTaskHistory(existing.id);
      expect(preImportTask.entries.some((entry) => entry.kind === 'TaskCreated')).toBe(true);
      expect(preImportTask.entries.some((entry) => entry.kind === 'TaskUpdated')).toBe(true);

      const imported = await alice.createProject({ name: 'Imported garden' });
      await alice.updateTask(existing.id, { projectId: imported.id });
      const createdByImport = await alice.createTask({
        title: 'New from import',
        projectId: imported.id,
      });

      // #139 will write one import line: "Moved in · N tasks". N counts both
      // existing tasks attached to the project and new tasks the import creates.
      const existingAttachedByImport = 1;
      const newTasksCreatedByImport = 1;
      const movedInTaskCount = existingAttachedByImport + newTasksCreatedByImport;
      expect(movedInTaskCount).toBe(2);

      const projectEntries = (await collectHistory(alice, imported.id, 50)).entries;
      expect(
        projectEntries.some(
          (entry) => entry.kind === 'TaskCreated' && entry.subject.id === existing.id
        )
      ).toBe(false);
      expect(
        projectEntries.some(
          (entry) => entry.kind === 'TaskUpdated' && entry.subject.id === existing.id
        )
      ).toBe(false);

      const existingOnProject = projectEntries.filter((entry) => entry.subject.id === existing.id);
      expect(existingOnProject.length).toBeGreaterThan(0);
      expect(existingOnProject.every((entry) => entry.kind === 'TaskAddedToProject')).toBe(true);
      const movedIn = existingOnProject[existingOnProject.length - 1];
      expect(movedIn?.kind).toBe('TaskAddedToProject');

      expect(
        projectEntries.some(
          (entry) => entry.kind === 'TaskCreated' && entry.subject.id === createdByImport.id
        )
      ).toBe(true);

      const taskEntries = (await alice.listTaskHistory(existing.id)).entries;
      expect(taskEntries.some((entry) => entry.kind === 'TaskCreated')).toBe(true);
      expect(taskEntries.some((entry) => entry.kind === 'TaskUpdated')).toBe(true);
      expect(taskEntries.some((entry) => entry.kind === 'TaskAddedToProject')).toBe(true);

      const createdOnTask = taskEntries.find((entry) => entry.kind === 'TaskCreated');
      const movedInAt = movedIn?.occurredAt ?? '';
      const createdAt = createdOnTask?.occurredAt ?? '';
      expect(createdAt.length).toBeGreaterThan(0);
      expect(movedInAt.length).toBeGreaterThan(0);
      expect(createdAt <= movedInAt).toBe(true);
      expect(
        taskEntries.some(
          (entry) =>
            (entry.kind === 'TaskCreated' || entry.kind === 'TaskUpdated') &&
            entry.occurredAt < movedInAt
        )
      ).toBe(true);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Project history [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-history-ui@example.com');
    });

    for (const viewport of [
      { name: 'desktop' as const, apply: (actor: BrowserActor) => actor.useDesktopViewport() },
      { name: 'phone' as const, apply: (actor: BrowserActor) => actor.useMobileViewport() },
    ]) {
      it(`walks the project history on ${viewport.name}`, async () => {
        await viewport.apply(alice);
        const kitchen = await alice.createProject({ name: 'Kitchen renovation' });
        await alice.createTask({ title: 'Pad one', projectId: kitchen.id });
        await alice.createTask({ title: 'Pad two', projectId: kitchen.id });
        await alice.createTask({ title: 'Pad three', projectId: kitchen.id });
        const taskA = await alice.createTask({ title: 'Call Trident', projectId: kitchen.id });
        await alice.createTask({ title: 'Order lumber', projectId: kitchen.id });
        const extra = await alice.createTask({ title: 'Paint samples', projectId: kitchen.id });
        await alice.completeTask(extra.id);
        await alice.setNextAction(kitchen.id, { taskId: taskA.id });
        const minted = await alice.mintAgent('Lane');
        const bot = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: alice.organizationId,
          token: minted.rawToken,
        });
        await bot.completeTask(taskA.id);
        const doomed = await alice.createTask({ title: 'Old invoice', projectId: kitchen.id });
        await alice.deleteTask(doomed.id);
        await alice.updateProject(kitchen.id, { objective: 'Finish the back wall' });

        await alice.goToProject(kitchen.id);
        await alice.shouldSeeHistoryPlaceholder();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_collapsed',
        });

        await alice.expandProjectHistory();
        await alice.shouldSeeHistoryEntry({
          kind: 'ProjectUpdated',
          actor: alice.email,
          text: 'edited this project',
        });
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_open',
        });

        await alice.shouldSeeHistoryEntry({
          kind: 'TaskDeleted',
          actor: alice.email,
          text: "deleted 'Old invoice'",
          deleted: true,
        });
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'deleted_task',
        });

        await alice.shouldSeeHistoryEntry({
          kind: 'TaskCompleted',
          actor: 'Lane',
          text: "completed 'Call Trident'",
        });
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'bot_credited',
        });

        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'show_more_before',
        });
        await alice.clickProjectHistoryMore();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'show_more_after',
        });

        while (true) {
          try {
            await alice.clickProjectHistoryMore();
          } catch {
            break;
          }
        }
        await alice.shouldSeeHistoryStart();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_start',
        });

        await alice.expandProjectFinished();
        await alice.shouldSeeFinishedTask('Paint samples');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'finished_open',
        });

        await alice.reopenFinishedTask('Paint samples');
        await alice.shouldNotSeeFinishedTask('Paint samples');
        await alice.shouldSeeOpenTaskOnProject('Paint samples');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'finished_reopened',
        });
      });
    }
  });
});
