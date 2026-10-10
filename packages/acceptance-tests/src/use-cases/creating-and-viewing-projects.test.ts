import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 3 (#134): Create and view a project.
 *
 * Justin creates a project from the rail, opens its page, and edits
 * the name and objective. Creating needs a person; that rule is covered
 * by API tests.
 */
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
