import { usingDrivers, describe, it, expect, beforeEach } from './harness.js';
import type { CoreActor } from '../dsl/index.js';
import { NotFoundError, ValidationError } from '../dsl/index.js';

/**
 * Snooze functionality acceptance tests.
 * 
 * Snooze allows temporarily hiding captures from the inbox.
 * When the snooze time expires, the capture reappears in the inbox.
 */

// Core snooze behavior
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Snoozing captures [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    // Helper to create a future timestamp
    const futureTime = (hours: number): string => {
      const date = new Date();
      date.setHours(date.getHours() + hours);
      return date.toISOString();
    };

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('can snooze a capture until a future time', async () => {
      const capture = await alice.createCapture({ content: 'Snooze me' });
      const until = futureTime(2);

      const snoozed = await alice.snoozeCapture(capture.id, until);

      expect(snoozed.snoozedUntil).toBeDefined();
    });

    it('snoozed capture appears in snoozed list', async () => {
      const content = `snoozed-list-${Date.now()}`;
      const capture = await alice.createCapture({ content });
      await alice.snoozeCapture(capture.id, futureTime(2));

      const snoozedCaptures = await alice.listSnoozedCaptures();

      expect(snoozedCaptures.some((c) => c.content === content)).toBe(true);
    });

    it('snoozed capture is hidden from inbox list', async () => {
      const content = `snoozed-hidden-${Date.now()}`;
      const capture = await alice.createCapture({ content });
      await alice.snoozeCapture(capture.id, futureTime(2));

      const inboxCaptures = await alice.listCaptures();

      expect(inboxCaptures.some((c) => c.content === content)).toBe(false);
    });

    it('can unsnooze a capture', async () => {
      const capture = await alice.createCapture({ content: 'Unsnooze me' });
      await alice.snoozeCapture(capture.id, futureTime(2));

      const unsnoozed = await alice.unsnoozeCapture(capture.id);

      expect(unsnoozed.snoozedUntil).toBeUndefined();
    });

    it('unsnoozed capture returns to inbox', async () => {
      const content = `unsnoozed-inbox-${Date.now()}`;
      const capture = await alice.createCapture({ content });
      await alice.snoozeCapture(capture.id, futureTime(2));
      await alice.unsnoozeCapture(capture.id);

      const inboxCaptures = await alice.listCaptures();
      const snoozedCaptures = await alice.listSnoozedCaptures();

      expect(inboxCaptures.some((c) => c.content === content)).toBe(true);
      expect(snoozedCaptures.some((c) => c.content === content)).toBe(false);
    });
  });
});

// API-specific validation and edge cases
usingDrivers(['http'] as const, (ctx) => {
  describe(`Snoozing captures - API validation [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    // Helper to create a future timestamp
    const futureTime = (hours: number): string => {
      const date = new Date();
      date.setHours(date.getHours() + hours);
      return date.toISOString();
    };

    // Helper to create a past timestamp
    const pastTime = (hours: number): string => {
      const date = new Date();
      date.setHours(date.getHours() - hours);
      return date.toISOString();
    };

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('returns exact snoozedUntil timestamp', async () => {
      const capture = await alice.createCapture({ content: 'Snooze exact' });
      const until = futureTime(2);

      const snoozed = await alice.snoozeCapture(capture.id, until);

      expect(snoozed.snoozedUntil).toBe(until);
    });

    it('archiving a snoozed capture clears the snooze', async () => {
      const capture = await alice.createCapture({ content: 'Archive snoozed' });
      await alice.snoozeCapture(capture.id, futureTime(2));

      const archived = await alice.archiveCapture(capture.id);

      expect(archived.snoozedUntil).toBeUndefined();
      expect(archived.status).toBe('archived');
    });

    it('can snooze and pin the same capture', async () => {
      const capture = await alice.createCapture({ content: 'Pin and snooze' });
      const until = futureTime(2);

      await alice.pinCapture(capture.id);
      const snoozed = await alice.snoozeCapture(capture.id, until);

      expect(snoozed.pinnedAt).toBeDefined();
      expect(snoozed.snoozedUntil).toBe(until);
    });

    it('returns not found when snoozing non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.snoozeCapture(nonExistentId, futureTime(2))).rejects.toThrow(
        NotFoundError
      );
    });

    it('returns not found when unsnoozing non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.unsnoozeCapture(nonExistentId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('rejects snoozing with a past time', async () => {
      const capture = await alice.createCapture({ content: 'Past snooze' });
      const until = pastTime(1);

      await expect(alice.snoozeCapture(capture.id, until)).rejects.toThrow(
        ValidationError
      );
    });

    it('rejects snoozing an archived capture', async () => {
      const capture = await alice.createCapture({ content: 'Archived snooze' });
      await alice.archiveCapture(capture.id);

      await expect(alice.snoozeCapture(capture.id, futureTime(2))).rejects.toThrow(
        ValidationError
      );
    });
  });
});
