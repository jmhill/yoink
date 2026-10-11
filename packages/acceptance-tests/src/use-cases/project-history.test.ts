import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor, HistoryPage, TimelineEntry } from '@yoink/acceptance-testing';

const walkthroughArtifactDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../docs/pr-artifacts/138-project-history'
);

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

const DETAIL_ID_KEYS = new Set(['taskId', 'previousTaskId', 'projectId', 'assigneeId', 'listId']);

const publicDetails = (details: TimelineEntry['details']): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!DETAIL_ID_KEYS.has(key)) {
      next[key] = value;
    }
  }
  return next;
};

const snapshot = (entries: TimelineEntry[]) =>
  entries.map((entry) => ({
    kind: entry.kind,
    subjectType: entry.subject.type,
    subjectTitle: entry.subject.title,
    subjectDeleted: entry.subject.deleted,
    actorName: entry.actor.name,
    actorKind: entry.actor.kind,
    details: publicDetails(entry.details),
  }));

const expectPagesOf = (pages: HistoryPage[], sizes: number[]) => {
  expect(pages).toHaveLength(sizes.length);
  for (const [index, size] of sizes.entries()) {
    const page = pages[index];
    const last = index === sizes.length - 1;
    expect(page?.entries, `page ${index} size`).toHaveLength(size);
    expect(page?.hasMore, `page ${index} hasMore`).toBe(!last);
    if (last) {
      expect(page?.nextCursor).toBeNull();
    } else {
      expect(typeof page?.nextCursor).toBe('string');
      expect(page?.nextCursor).not.toBe('');
    }
  }
};

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

      const doomed = await alice.createTask({ title: 'Doomed next', projectId: kitchen.id });
      await alice.setNextAction(kitchen.id, { taskId: doomed.id });
      await alice.deleteTask(doomed.id);

      const taskD = await alice.createTask({ title: 'Bot trash', projectId: kitchen.id });
      await bot.deleteTask(taskD.id);

      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: 'Mike',
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
      expect(finished.tasks.map((task) => ({
        title: task.title,
        completedByName: task.completedByName,
      }))).toEqual([
        { title: 'Finish later A', completedByName: 'Alice' },
        { title: 'Finish later B', completedByName: 'Alice' },
      ]);
      expect(finished.total).toBe(3);
      expect(finished.tasks.map((task) => task.title)).not.toContain('Old invoice');

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

      const leftover = await alice.createTask({ title: 'Leftover', projectId: kitchen.id });
      await alice.setNextAction(kitchen.id, { taskId: leftover.id });

      const expectHistoryUnchanged = async (label: string, previous: ReturnType<typeof snapshot>) => {
        const collected = await collectHistory(alice, kitchen.id, 3);
        expect(snapshot(collected.entries), label).toEqual(previous);
        expect(collected.pages[0]?.total, `${label} total`).toBe(previous.length);
      };

      const beforeNoops = snapshot((await collectHistory(alice, kitchen.id, 3)).entries);
      await alice.updateProject(kitchen.id, { name: 'Kitchen renovation' });
      await expectHistoryUnchanged('same project name', beforeNoops);
      await alice.updateProject(kitchen.id, { objective: null });
      await expectHistoryUnchanged('same empty objective', beforeNoops);
      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: 'Contractor',
        waitingSince: '2026-10-01',
      });
      await expectHistoryUnchanged('same waiting status', beforeNoops);
      await alice.setNextAction(kitchen.id, { taskId: leftover.id });
      await expectHistoryUnchanged('same next action', beforeNoops);
      await alice.updateTask(leftover.id, { projectId: kitchen.id });
      await expectHistoryUnchanged('same leftover project', beforeNoops);
      await alice.updateTask(leftover.id, { title: leftover.title });
      await expectHistoryUnchanged('same title on Kitchen leftover', beforeNoops);

      await alice.changeProjectStatus(kitchen.id, {
        status: 'done',
        openTasks: 'remove',
      });

      const { pages, entries } = await collectHistory(alice, kitchen.id, 3);
      await mkdir(walkthroughArtifactDir, { recursive: true });
      await writeFile(
        path.join(walkthroughArtifactDir, 'api-history-pages.json'),
        `${JSON.stringify(pages, null, 2)}\n`
      );
      await writeFile(
        path.join(walkthroughArtifactDir, 'api-finished-pages.json'),
        `${JSON.stringify({ firstPageLimit2: finished, page1Limit1: paged, page2Limit1: page2 }, null, 2)}\n`
      );
      expect(pages[0]?.historyStartsAt).toBe('2026-10-10T13:56:00.000Z');
      expectPagesOf(pages, [3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
      expect(pages.every((page) => page.total === entries.length)).toBe(true);
      expect(pages[0]?.total).toBe(entries.length);
      expect(entries).toHaveLength(28);

      const kinds = entries.map((entry) => entry.kind);
      expect(kinds).not.toContain('TaskPinned');
      expect(kinds).not.toContain('TaskUpdated');
      const personName = entries.find((entry) => entry.kind === 'ProjectCreated')?.actor.name;
      expect(personName).toBe('Alice');
      expect(entries.filter((entry) => entry.kind === 'TaskDeleted').map((entry) => ({
        title: entry.subject.title,
        actor: entry.actor.name,
        kind: entry.actor.kind,
      }))).toEqual([
        { title: 'Bot trash', actor: 'Lane', kind: 'bot' },
        { title: 'Doomed next', actor: 'Alice', kind: 'user' },
        { title: 'Old invoice', actor: 'Alice', kind: 'user' },
      ]);

      const completed = entries.find(
        (entry) => entry.kind === 'TaskCompleted' && entry.subject.title === 'Call Trident'
      );
      expect(completed?.actor).toMatchObject({ name: 'Lane', kind: 'bot' });
      expect(completed?.subject.title).toBe('Call Trident');

      expect(
        entries
          .filter((entry) => entry.kind === 'ProjectNextActionCleared')
          .map((entry) => ({
            actor: entry.actor.name,
            kind: entry.actor.kind,
            reason: 'reason' in entry.details ? entry.details.reason : null,
            taskTitle: 'taskTitle' in entry.details ? entry.details.taskTitle : null,
          }))
      ).toEqual([
        { actor: 'Alice', kind: 'user', reason: 'projectDone', taskTitle: 'Leftover' },
        { actor: 'Alice', kind: 'user', reason: 'deleted', taskTitle: 'Doomed next' },
        { actor: 'Lane', kind: 'bot', reason: 'completed', taskTitle: 'Call Trident' },
      ]);

      expect(snapshot(entries)).toEqual([
        {
          kind: 'ProjectNextActionCleared',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectNextActionCleared', taskTitle: 'Leftover', reason: 'projectDone' },
        },
        {
          kind: 'ProjectStatusChanged',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'ProjectStatusChanged',
            from: 'waiting',
            to: 'done',
            waitingOn: null,
            waitingSince: null,
          },
        },
        {
          kind: 'TaskRemovedFromProject',
          subjectType: 'task',
          subjectTitle: 'Leftover',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskRemovedFromProject' },
        },
        {
          kind: 'ProjectNextActionSet',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectNextActionSet', taskTitle: 'Leftover', previousTaskTitle: null },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Leftover',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskCompleted',
          subjectType: 'task',
          subjectTitle: 'Finish later A',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCompleted' },
        },
        {
          kind: 'TaskCompleted',
          subjectType: 'task',
          subjectTitle: 'Finish later B',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCompleted' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Finish later B',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Finish later A',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'ProjectWaitingChanged',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectWaitingChanged', waitingOn: 'Contractor', waitingSince: '2026-10-01' },
        },
        {
          kind: 'ProjectStatusChanged',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'ProjectStatusChanged',
            from: 'active',
            to: 'waiting',
            waitingOn: 'Mike',
            waitingSince: null,
          },
        },
        {
          kind: 'TaskDeleted',
          subjectType: 'task',
          subjectTitle: 'Bot trash',
          subjectDeleted: true,
          actorName: 'Lane',
          actorKind: 'bot',
          details: { kind: 'TaskDeleted' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Bot trash',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'ProjectNextActionCleared',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectNextActionCleared', taskTitle: 'Doomed next', reason: 'deleted' },
        },
        {
          kind: 'TaskDeleted',
          subjectType: 'task',
          subjectTitle: 'Doomed next',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskDeleted' },
        },
        {
          kind: 'ProjectNextActionSet',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectNextActionSet', taskTitle: 'Doomed next', previousTaskTitle: null },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Doomed next',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskDeleted',
          subjectType: 'task',
          subjectTitle: 'Old invoice',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskDeleted' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Old invoice',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskRemovedFromProject',
          subjectType: 'task',
          subjectTitle: 'Order lumber',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskRemovedFromProject', toProjectName: 'Other' },
        },
        {
          kind: 'ProjectNextActionCleared',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Lane',
          actorKind: 'bot',
          details: { kind: 'ProjectNextActionCleared', taskTitle: 'Call Trident', reason: 'completed' },
        },
        {
          kind: 'TaskCompleted',
          subjectType: 'task',
          subjectTitle: 'Call Trident',
          subjectDeleted: false,
          actorName: 'Lane',
          actorKind: 'bot',
          details: { kind: 'TaskCompleted' },
        },
        {
          kind: 'ProjectNextActionSet',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'ProjectNextActionSet',
            taskTitle: 'Call Trident',
            previousTaskTitle: 'Order lumber',
          },
        },
        {
          kind: 'ProjectNextActionSet',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectNextActionSet', taskTitle: 'Order lumber', previousTaskTitle: null },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Order lumber',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskAddedToProject',
          subjectType: 'task',
          subjectTitle: 'Call Trident',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskAddedToProject' },
        },
        {
          kind: 'ProjectUpdated',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectUpdated', name: 'Kitchen renovation' },
        },
        {
          kind: 'ProjectCreated',
          subjectType: 'project',
          subjectTitle: 'Kitchen renovation',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectCreated', name: 'Kitchen' },
        },
      ]);

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

      const elsewhere = await alice.createProject({ name: 'Elsewhere' });
      await alice.updateTask(taskB.id, { projectId: elsewhere.id });
      const afterSecondMove = (await collectHistory(alice, kitchen.id, 3)).entries;
      const lumberLeft = afterSecondMove.find(
        (item) => item.kind === 'TaskRemovedFromProject' && item.subject.title === 'Order lumber'
      );
      expect(lumberLeft?.details).toMatchObject({
        kind: 'TaskRemovedFromProject',
        toProjectName: 'Other',
      });

      const deletedC = entries.find(
        (entry) => entry.kind === 'TaskDeleted' && entry.subject.title === 'Old invoice'
      );
      expect(deletedC?.subject.deleted).toBe(true);
      expect(deletedC?.actor.name).toBe(personName);

      expect(entries[entries.length - 1]).toMatchObject({
        kind: 'ProjectCreated',
        actor: { name: personName, kind: 'user' },
        subject: { type: 'project', title: 'Kitchen renovation', deleted: false },
      });

      const invalid = await alice.expectInvalidProjectHistoryCursor(kitchen.id, 'not-a-cursor');
      expect(invalid.code).toBe('invalid_cursor');

      const beforeDoneNoops = snapshot(entries);
      await alice.updateProject(kitchen.id, { name: 'Kitchen renovation' });
      await expectHistoryUnchanged('same project name after done', beforeDoneNoops);
      await alice.updateProject(kitchen.id, { objective: null });
      await expectHistoryUnchanged('same empty objective after done', beforeDoneNoops);
      await alice.changeProjectStatus(kitchen.id, { status: 'done' });
      await expectHistoryUnchanged('same done status', beforeDoneNoops);
      await alice.setNextAction(kitchen.id, { taskId: null });
      await expectHistoryUnchanged('clear next action when none', beforeDoneNoops);
      const leftoverElsewhere = await alice.createTask({
        title: 'Stay put',
        projectId: other.id,
      });
      await alice.updateTask(leftoverElsewhere.id, { projectId: other.id });
      await expectHistoryUnchanged('same project on Other task', beforeDoneNoops);
      await alice.updateTask(leftoverElsewhere.id, { title: leftoverElsewhere.title });
      await expectHistoryUnchanged('same title on Other task', beforeDoneNoops);
      await alice.updateTask(extra1.id, { title: extra1.title });
      await expectHistoryUnchanged('same title on Kitchen finished task', beforeDoneNoops);

      const afterDelete = await alice.listTaskHistory(taskC.id);
      expect(snapshot(afterDelete.entries)).toEqual([
        {
          kind: 'TaskDeleted',
          subjectType: 'task',
          subjectTitle: 'Old invoice',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskDeleted' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Old invoice',
          subjectDeleted: true,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
      ]);

      const taskHistoryA = await alice.listTaskHistory(taskA.id);
      expect(snapshot(taskHistoryA.entries)).toEqual([
        {
          kind: 'TaskCompleted',
          subjectType: 'task',
          subjectTitle: 'Call Trident',
          subjectDeleted: false,
          actorName: 'Lane',
          actorKind: 'bot',
          details: { kind: 'TaskCompleted' },
        },
        {
          kind: 'TaskAddedToProject',
          subjectType: 'task',
          subjectTitle: 'Call Trident',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskAddedToProject' },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Call Trident',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
      ]);
      expect(
        snapshot((await alice.listProjectHistory(kitchen.id)).entries).filter(
          (entry) => entry.kind === 'TaskCreated' && entry.subjectTitle === 'Call Trident'
        )
      ).toEqual([]);

      const botHistory = await bot.listProjectHistory(kitchen.id, { limit: 3 });
      expect(botHistory.total).toBeGreaterThan(0);
      expect(botHistory.entries[0]?.kind).toBeDefined();
      const botFinished = await bot.listFinishedTasksOnProject(kitchen.id);
      expect(botFinished.total).toBe(3);

      const bob = await ctx.createActor('bob-other-org-history@example.com');
      await expect(bob.listProjectHistory(kitchen.id)).rejects.toThrow();
      await expect(bob.listFinishedTasksOnProject(kitchen.id)).rejects.toThrow();
    });

    it('keeps earlier task history on the task after a later add-to-project (not the #139 import write path)', async () => {
      const existing = await alice.createTask({ title: 'Existing note' });
      await alice.updateTask(existing.id, { title: 'Existing note edited' });

      const preImportTask = await alice.listTaskHistory(existing.id);
      expect(snapshot(preImportTask.entries)).toEqual([
        {
          kind: 'TaskUpdated',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'TaskUpdated',
            title: 'Existing note edited',
            previousTitle: 'Existing note',
          },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
      ]);

      const imported = await alice.createProject({ name: 'Imported garden' });
      await alice.updateTask(existing.id, { projectId: imported.id });
      const createdByImport = await alice.createTask({
        title: 'New from import',
        projectId: imported.id,
      });

      const projectEntries = (await collectHistory(alice, imported.id, 50)).entries;
      expect(snapshot(projectEntries)).toEqual([
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'New from import',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
        {
          kind: 'TaskAddedToProject',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskAddedToProject' },
        },
        {
          kind: 'ProjectCreated',
          subjectType: 'project',
          subjectTitle: 'Imported garden',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectCreated', name: 'Imported garden' },
        },
      ]);
      expect(createdByImport.title).toBe('New from import');

      const existingOnProject = projectEntries.filter(
        (entry) => entry.subject.title === 'Existing note edited'
      );
      expect(existingOnProject.every((entry) => entry.kind === 'TaskAddedToProject')).toBe(true);
      const movedIn = existingOnProject[existingOnProject.length - 1];

      const taskEntries = (await alice.listTaskHistory(existing.id)).entries;
      expect(snapshot(taskEntries)).toEqual([
        {
          kind: 'TaskAddedToProject',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskAddedToProject' },
        },
        {
          kind: 'TaskUpdated',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'TaskUpdated',
            title: 'Existing note edited',
            previousTitle: 'Existing note',
          },
        },
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Existing note edited',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'TaskCreated' },
        },
      ]);

      const createdOnTask = taskEntries.find((entry) => entry.kind === 'TaskCreated');
      const movedInAt = movedIn?.occurredAt ?? '';
      const createdAt = createdOnTask?.occurredAt ?? '';
      expect(createdAt.length).toBeGreaterThan(0);
      expect(movedInAt.length).toBeGreaterThan(0);
      expect(createdAt <= movedInAt).toBe(true);
      expect(
        taskEntries
          .filter((entry) => entry.kind === 'TaskCreated' || entry.kind === 'TaskUpdated')
          .every((entry) => entry.occurredAt < movedInAt)
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
        for (const title of [
          'Pad one',
          'Pad two',
          'Pad three',
          'Pad four',
          'Pad five',
          'Pad six',
          'Pad seven',
          'Pad eight',
        ]) {
          await alice.createTask({ title, projectId: kitchen.id });
        }
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
        await alice.shouldSeeHistorySection();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_collapsed',
        });

        await alice.expandProjectHistory();
        await alice.shouldSeeHistoryEntryCount(9);
        await alice.shouldSeeHistoryMore();
        await alice.shouldSeeHistoryEntry({
          kind: 'ProjectUpdated',
          actor: 'Alice',
          text: 'changed the objective',
        });
        await alice.shouldSeeHistoryLinesInOrder([
          'changed the objective',
          "deleted 'Old invoice'",
          "added 'Old invoice'",
          "completed 'Call Trident'",
        ]);
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_open',
        });

        await alice.shouldSeeHistoryEntry({
          kind: 'TaskDeleted',
          actor: 'Alice',
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

        await alice.shouldSeeHistoryMore();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'show_more_before',
        });
        await alice.clickProjectHistoryMore();
        await alice.shouldSeeHistoryEntry({
          kind: 'ProjectCreated',
          actor: 'Alice',
          text: 'created this project',
        });
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'show_more_after',
        });

        await alice.loadAllProjectHistory();
        await alice.shouldNotSeeHistoryStart();

        await alice.expandProjectFinished();
        await alice.shouldSeeFinishedTask('Paint samples');
        await alice.shouldSeeFinishedBy('Paint samples', 'Paint samples · Finished by Alice');
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

        const vintage = await alice.createProject({ name: 'Old garden' });
        await ctx.admin.updateProjectCreatedAt(vintage.id, '2026-10-09T12:00:00.000Z');
        await alice.goToProject(vintage.id);
        await alice.expandProjectHistory();
        await alice.shouldSeeHistoryStart();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'history_start',
        });
      }, 120_000);
    }

    it('uses Polly wording for take-out, move, moved in, and waiting', async () => {
      await alice.useDesktopViewport();
      const kitchen = await alice.createProject({ name: 'Kitchen' });
      const other = await alice.createProject({ name: 'Other' });
      const call = await alice.createTask({ title: 'Call Trident' });
      await alice.updateTask(call.id, { projectId: kitchen.id });
      const lumber = await alice.createTask({ title: 'Order lumber', projectId: kitchen.id });
      await alice.updateTask(lumber.id, { projectId: other.id });
      const leftover = await alice.createTask({ title: 'Leftover', projectId: kitchen.id });
      await alice.updateTask(leftover.id, { projectId: null });
      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: null,
      });
      await alice.changeProjectStatus(kitchen.id, {
        status: 'waiting',
        waitingOn: 'Contractor',
        waitingSince: '2026-10-01',
      });

      await alice.goToProject(kitchen.id);
      await alice.expandProjectHistory();
      await alice.shouldSeeHistoryLinesInOrder([
        'Alice set waiting on Contractor since Oct 1',
        'marked this project waiting',
        "Alice took 'Leftover' out of the project",
      ]);
      await alice.shouldSeeHistoryEntry({
        kind: 'ProjectStatusChanged',
        actor: 'Alice',
        text: 'marked this project waiting',
      });
      await alice.shouldSeeHistoryEntry({
        kind: 'TaskRemovedFromProject',
        actor: 'Alice',
        text: "moved 'Order lumber' to Other",
      });
      await alice.shouldSeeHistoryEntry({
        kind: 'TaskAddedToProject',
        actor: 'Alice',
        text: "moved 'Call Trident' into the project",
      });
    }, 120_000);
  });
});
