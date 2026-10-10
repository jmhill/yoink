import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { NotFoundError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 4 (#135): Put tasks in a project.
 *
 * A task is in 0 or 1 projects and 0 or 1 lists, independently. Only open
 * tasks move in or out. Bots can set or clear a project. The project page
 * lists open tasks newest-created first.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Putting tasks in a project [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-project@example.com');
    });

    it('puts an existing open task in a project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Buy soil' });
      expect(task.projectId).toBeUndefined();

      const updated = await alice.updateTask(task.id, { projectId: garden.id });

      expect(updated.projectId).toBe(garden.id);
      expect(updated.listId).toBeUndefined();
    });

    it('moves a task from one project to another', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const cabin = await alice.createProject({ name: 'Cabin' });
      const task = await alice.createTask({ title: 'Buy soil' });

      await alice.updateTask(task.id, { projectId: garden.id });
      const moved = await alice.updateTask(task.id, { projectId: cabin.id });

      expect(moved.projectId).toBe(cabin.id);
    });

    it('takes a task out of a project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Buy soil', projectId: garden.id });

      const cleared = await alice.updateTask(task.id, { projectId: null });

      expect(cleared.projectId).toBeUndefined();
    });

    it('lets a task be in both a list and a project', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({
        title: 'Buy soil',
        listId: groceries.id,
        projectId: garden.id,
      });

      expect(task.listId).toBe(groceries.id);
      expect(task.projectId).toBe(garden.id);

      const moved = await alice.updateTask(task.id, { projectId: null });
      expect(moved.listId).toBe(groceries.id);
      expect(moved.projectId).toBeUndefined();
    });

    it('creates a task already in a project', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Plant herbs', projectId: garden.id });

      expect(task.projectId).toBe(garden.id);
      expect(task.completedAt).toBeUndefined();
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Putting tasks in a project — API [${ctx.driverName}]`, () => {
    it('lets an agent token set and clear a task project', async () => {
      const alice = await ctx.createActor('alice-task-project-bot@example.com');
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Bot chore' });

      const minted = await alice.mintAgent('Project setter');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const set = await bot.updateTask(task.id, { projectId: garden.id });
      expect(set.projectId).toBe(garden.id);

      const cleared = await bot.updateTask(task.id, { projectId: null });
      expect(cleared.projectId).toBeUndefined();
    });

    it('lists open project tasks newest-created first and omits finished ones', async () => {
      const alice = await ctx.createActor('alice-task-project-list@example.com');
      const garden = await alice.createProject({ name: 'Garden' });
      const older = await alice.createTask({ title: 'Older', projectId: garden.id });
      const newer = await alice.createTask({ title: 'Newer', projectId: garden.id });
      const done = await alice.createTask({ title: 'Done', projectId: garden.id });
      await alice.completeTask(done.id);

      const listed = await alice.listOpenTasksOnProject(garden.id);
      expect(listed.map((task) => task.id)).toEqual([newer.id, older.id]);
    });

    it("cannot put a task in another organization's project", async () => {
      const alice = await ctx.createActor('alice-task-project-iso@example.com');
      const bob = await ctx.createActor('bob-task-project-iso@example.com');
      const aliceGarden = await alice.createProject({ name: 'Alice garden' });
      const bobTask = await bob.createTask({ title: 'Bob chore' });

      await expect(bob.updateTask(bobTask.id, { projectId: aliceGarden.id })).rejects.toThrow(
        NotFoundError
      );
      await expect(
        bob.createTask({ title: 'Nope', projectId: aliceGarden.id })
      ).rejects.toThrow(NotFoundError);
      await expect(bob.listOpenTasksOnProject(aliceGarden.id)).rejects.toThrow(NotFoundError);

      const still = await bob.getTask(bobTask.id);
      expect(still.projectId).toBeUndefined();
    });

    it('rejects adding a completed task to a project', async () => {
      const alice = await ctx.createActor('alice-task-project-done@example.com');
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Buy soil' });
      await alice.completeTask(task.id);

      await expect(alice.updateTask(task.id, { projectId: garden.id })).rejects.toThrow(
        ValidationError
      );

      const done = await alice.getTask(task.id);
      expect(done.projectId).toBeUndefined();
      expect(done.completedAt).toBeDefined();
    });

    it('processes a capture into a task in a project', async () => {
      const alice = await ctx.createActor('alice-task-project-process@example.com');
      const garden = await alice.createProject({ name: 'Garden' });
      const capture = await alice.createCapture({ content: 'Buy soil' });

      const task = await alice.processCaptureToTask(capture.id, { projectId: garden.id });

      expect(task.projectId).toBe(garden.id);
      const onProject = await alice.listOpenTasksOnProject(garden.id);
      expect(onProject.map((item) => item.id)).toContain(task.id);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Putting tasks in a project on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-project-board@example.com');
    });

    it('puts a task in a project from edit and shows it on the project page', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({ title: 'Buy soil' });

      await alice.updateTask(task.id, { projectId: garden.id });
      await alice.goToProject(garden.id);
      await alice.shouldSeeOpenTaskOnProject('Buy soil');
    });

    it('moves a task to another project and takes it out', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const cabin = await alice.createProject({ name: 'Cabin' });
      const task = await alice.createTask({ title: 'Buy soil', projectId: garden.id });

      await alice.updateTask(task.id, { projectId: cabin.id });
      await alice.goToProject(cabin.id);
      await alice.shouldSeeOpenTaskOnProject('Buy soil');
      await alice.goToProject(garden.id);
      await alice.shouldNotSeeOpenTaskOnProject('Buy soil');

      await alice.updateTask(task.id, { projectId: null });
      await alice.goToProject(cabin.id);
      await alice.shouldNotSeeOpenTaskOnProject('Buy soil');
    });

    it('keeps a task on a list while it is also in a project', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const garden = await alice.createProject({ name: 'Garden' });
      const task = await alice.createTask({
        title: 'Buy soil',
        listId: groceries.id,
        projectId: garden.id,
      });

      await alice.shouldSeeListOnTask(task.id, 'Groceries');
      await alice.goToProject(garden.id);
      await alice.shouldSeeOpenTaskOnProject('Buy soil');
    });

    it('creates a task directly in a project from quick-add', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createTask({ title: 'Plant herbs', projectId: garden.id });

      await alice.goToProject(garden.id);
      await alice.shouldSeeOpenTaskOnProject('Plant herbs');
    });

    it('promotes a capture into a project', async () => {
      const garden = await alice.createProjectFromRail({ name: 'Garden' });
      await alice.createCapture({ content: 'Buy soil' });
      await alice.openRailInbox();
      await alice.openPromoteSheet('Buy soil');

      const task = await alice.confirmPromoteOnProject('Garden');
      expect(task.projectId).toBe(garden.id);

      await alice.goToProject(garden.id);
      await alice.shouldSeeOpenTaskOnProject('Buy soil');
    });
  });
});
