import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { ForbiddenError, NoteSyncConflictError } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '149-obsidian-notes';

usingDrivers(['http'] as const, (ctx) => {
  describe(`Obsidian notes mirror [${ctx.driverName}]`, () => {
    let justin: CoreActor;

    beforeEach(async () => {
      justin = await ctx.createActor('justin-obsidian-http@example.com');
    });

    it('pages the changed-since feed with tombstones and org scope', async () => {
      const garden = await justin.createProject({ name: 'Garden' });
      const older = await justin.createNote(garden.id, { title: 'Older', body: 'One' });
      await justin.createNote(garden.id, { title: 'Newer', body: 'Two' });
      await justin.deleteNote(garden.id, older.id);

      const first = await justin.listNotesChanged({
        since: '2020-01-01T00:00:00.000Z',
        limit: 1,
      });
      expect(first.total).toBe(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeTruthy();

      const second = await justin.listNotesChanged({
        since: '2020-01-01T00:00:00.000Z',
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.hasMore).toBe(false);
      const kinds = [first.changes[0]?.kind, second.changes[0]?.kind];
      expect(kinds).toContain('deleted');
      expect(kinds).toContain('upserted');
      const tombstone = [first.changes[0], second.changes[0]].find((change) => change?.kind === 'deleted');
      expect(tombstone).toMatchObject({
        kind: 'deleted',
        id: older.id,
        projectId: garden.id,
      });
    });

    it('imports an Obsidian edit as Justin and refuses a stale base version', async () => {
      const garden = await justin.createProject({ name: 'Garden' });
      const note = await justin.createNote(garden.id, { title: 'Meeting', body: 'Draft' });
      const minted = await justin.mintAgent('Libby notes-mirror');
      const libby = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: justin.organizationId,
        token: minted.rawToken,
      });

      const imported = await libby.importNoteFromObsidian({
        projectId: garden.id,
        noteId: note.id,
        title: 'Meeting',
        body: 'From Obsidian',
        baseVersion: note.version,
      });
      expect(imported.body).toBe('From Obsidian');
      expect(imported.updatedById).toBe(justin.userId);
      expect(imported.updatedByName).toBe('Justin');

      const history = await justin.listProjectHistory(garden.id);
      const obsidian = history.entries.find(
        (entry) => entry.kind === 'NoteUpdated' && entry.details.origin === 'obsidian'
      );
      expect(obsidian?.actor.name).toBe('Justin');

      await expect(
        libby.importNoteFromObsidian({
          projectId: garden.id,
          noteId: note.id,
          title: 'Meeting',
          body: 'Stale vault copy',
          baseVersion: note.version,
        })
      ).rejects.toThrow(NoteSyncConflictError);

      await expect(
        justin.importNoteFromObsidian({
          projectId: garden.id,
          noteId: note.id,
          title: 'Meeting',
          body: 'Person should not impersonate',
          baseVersion: imported.version,
        })
      ).rejects.toThrow(ForbiddenError);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Obsidian notes mirror [${ctx.driverName}]`, () => {
    let justin: BrowserActor;

    beforeEach(async () => {
      justin = await ctx.createActor('justin-obsidian-ui@example.com');
    });

    for (const viewport of [
      { name: 'desktop' as const, apply: (actor: BrowserActor) => actor.useDesktopViewport() },
      { name: 'phone' as const, apply: (actor: BrowserActor) => actor.useMobileViewport() },
    ]) {
      it(`shows an Obsidian-origin edit on ${viewport.name}`, async () => {
        await viewport.apply(justin);
        const garden = await justin.createProject({ name: 'Garden' });
        const note = await justin.createNote(garden.id, {
          title: 'Meeting notes',
          body: 'Draft from Yoink',
        });
        const minted = await justin.mintAgent('Libby notes-mirror');
        const libby = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: justin.organizationId,
          token: minted.rawToken,
        });

        await libby.importNoteFromObsidian({
          projectId: garden.id,
          noteId: note.id,
          title: 'Meeting notes',
          body: 'Justin edited this in Obsidian',
          baseVersion: note.version,
        });

        await justin.goToProject(garden.id);
        await justin.shouldSeeNotesReady();
        await justin.shouldSeeNoteOnProject({
          title: 'Meeting notes',
          excerpt: 'Justin edited this in Obsidian',
        });
        await justin.openNoteOnProject('Meeting notes');
        await justin.shouldSeeOpenNote({
          title: 'Meeting notes',
          bodyText: 'Justin edited this in Obsidian',
        });
        await justin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'note_after_import',
        });

        await justin.goToProject(garden.id);
        await justin.shouldSeeNotesReady();
        await justin.expandProjectHistory();
        await justin.shouldSeeHistoryEntry({
          kind: 'NoteUpdated',
          actor: 'Justin',
          text: 'edited this note in Obsidian',
        });
        await justin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'note_timeline_obsidian_edit',
        });
      }, 90_000);
    }
  });
});
