import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 2 of 6: Create a named list from All.
 *
 * All is retired (story 7). Create lives on + New list. Same unique-in-org
 * rules. After create, lands on that pile screen.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Creating a named list from All [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-list-from-all@example.com');
    });

    it('creates from the rail New list control and lands on that empty pile', async () => {
      const list = await alice.createNamedListFromRail('Weekend');

      expect(list.name).toBe('Weekend');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldNotSeeAllDestination();
    });

    it('shows the new list on the rail so you can switch to it', async () => {
      await alice.createNamedListFromRail('Weekend');

      await alice.openToday();
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.openAllNamedPile('Weekend');
      await alice.shouldSeeEmptyNamedPile();
    });

    it('refuses a duplicate name the same as Lists page create', async () => {
      await alice.createNamedListFromRail('Groceries');

      await expect(alice.createNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await expect(alice.createNamedListFromRail('groceries')).rejects.toThrow(ConflictError);
    });

    it('refuses an empty name the same as Lists page create', async () => {
      await expect(alice.createNamedListFromRail('')).rejects.toThrow(ValidationError);
      await expect(alice.createNamedListFromRail('   ')).rejects.toThrow(ValidationError);
    });

    it('leaves Today, Upcoming, and Mine as they are, with no Lists nav and no All destination', async () => {
      await alice.createNamedListFromRail('Weekend');

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldNotSeeListsNav();
      await alice.shouldSeeNamedList('Weekend');
      await alice.shouldNotSeeAllDestination();
    });
  });
});
