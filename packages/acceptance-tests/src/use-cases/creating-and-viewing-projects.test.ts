import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { ForbiddenError } from '@yoink/acceptance-testing';

/**
 * Story 3 (#134): Create and view a project.
 *
 * Justin creates a project from the rail, opens its page, and edits
 * the name and objective. Creating needs a person; agents may list,
 * read, and edit.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Creating and viewing projects [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-project-http@example.com');
    });

    it("person's own token can create a project", async () => {
      const created = await alice.createProject({
        name: 'Garden',
        objective: 'Grow tomatoes',
      });

      expect(created.name).toBe('Garden');
      expect(created.objective).toBe('Grow tomatoes');
      expect(created.status).toBe('active');
      expect(created.createdById).toBe(alice.userId);
    });

    it('agent token is refused on create and allowed to list, read, and edit', async () => {
      const garden = await alice.createProject({ name: 'Garden', objective: 'Grow tomatoes' });
      const minted = await alice.mintAgent('Project bot');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await expect(bot.createProject({ name: 'Bot garden' })).rejects.toThrow(ForbiddenError);

      const listed = await bot.listProjects();
      expect(listed.some((project) => project.id === garden.id)).toBe(true);

      const fetched = await bot.getProject(garden.id);
      expect(fetched.name).toBe('Garden');
      expect(fetched.objective).toBe('Grow tomatoes');

      const updated = await bot.updateProject(garden.id, {
        name: 'Lane garden',
        objective: 'Brief Justin',
      });
      expect(updated.name).toBe('Lane garden');
      expect(updated.objective).toBe('Brief Justin');
      expect(updated.lastChangedBy).toBe(minted.agent.userId);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Creating and viewing projects [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-project@example.com');
    });

    it('creates a project from the rail, opens the page, and edits name and objective', async () => {
      const project = await alice.createProjectFromRail({
        name: 'Garden',
        objective: 'Grow tomatoes',
      });

      expect(project.name).toBe('Garden');
      expect(project.id).toBeDefined();

      await alice.shouldSeeProjectPage({
        name: 'Garden',
        objective: 'Grow tomatoes',
        status: 'active',
      });

      await alice.editProjectName('Backyard');
      await alice.shouldSeeProjectPage({
        name: 'Backyard',
        objective: 'Grow tomatoes',
        status: 'active',
      });

      await alice.editProjectObjective('Plant herbs');
      await alice.shouldSeeProjectPage({
        name: 'Backyard',
        objective: 'Plant herbs',
        status: 'active',
      });
    });
  });
});
