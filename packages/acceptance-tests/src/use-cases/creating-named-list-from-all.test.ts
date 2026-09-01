import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 2 of 6: Create a named list from All.
 *
 * On Tasks All, a member can create a named list from the pile dropdown.
 * Same create rules as Lists page create. After create, All lands on that
 * list’s one-pile view (empty is fine — overview hides empty groups).
 *
 * This is not delete-from-All, grouping Today/Upcoming, Mine picker, or
 * removing the Lists nav.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Creating a named list from All [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-list-from-all@example.com');
    });

    it('creates from the All pile dropdown and lands on that empty pile', async () => {
      const list = await alice.createNamedListFromAll('Weekend');

      expect(list.name).toBe('Weekend');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.shouldSeeEmptyNamedPile();
    });

    it('shows the new list in the All dropdown so you can switch to it', async () => {
      await alice.createNamedListFromAll('Weekend');

      await alice.openAllOverview();
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.openAllNamedPile('Weekend');
      await alice.shouldSeeEmptyNamedPile();
    });

    it('refuses a duplicate name the same as Lists page create', async () => {
      await alice.createNamedListFromAll('Groceries');

      await expect(alice.createNamedListFromAll('Groceries')).rejects.toThrow(ConflictError);
      await expect(alice.createNamedListFromAll('groceries')).rejects.toThrow(ConflictError);
    });

    it('refuses an empty name the same as Lists page create', async () => {
      await expect(alice.createNamedListFromAll('')).rejects.toThrow(ValidationError);
      await expect(alice.createNamedListFromAll('   ')).rejects.toThrow(ValidationError);
    });

    it('leaves Today, Upcoming, Mine, and the Lists nav as they are, with no delete on All', async () => {
      await alice.createNamedListFromAll('Weekend');

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldSeeListsNav();
      await alice.shouldSeeNamedList('Weekend');

      await alice.openAllOverview();
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.shouldNotSeeDeleteListOnAll('Weekend');
    });
  });
});
