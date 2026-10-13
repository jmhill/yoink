import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { NotFoundError, StaleNoteError, ValidationError } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '147-project-notes';

usingDrivers(['http'] as const, (ctx) => {
  describe(`Project notes [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-notes-http@example.com');
    });

    it('creates, lists without bodies, reads createdAt and updatedAt, and edits most-recent first', async () => {
      const garden = await alice.createProject({ name: 'Garden' });

      const first = await alice.createNote(garden.id, {
        title: 'Kickoff',
        body: 'First line\n\nMore detail',
      });
      expect(first.title).toBe('Kickoff');
      expect(first.body).toBe('First line\n\nMore detail');
      expect(first.version).toBe('1');
      expect(first.createdAt).toBeTruthy();
      expect(first.updatedAt).toBe(first.createdAt);
      expect(first.createdById).toBe(alice.userId);
      expect(first.updatedById).toBe(alice.userId);
      expect(first.createdByName).toBe('Alice');
      expect(first.updatedByName).toBe('Alice');

      const second = await alice.createNote(garden.id, {
        title: 'Kitchen/plans',
        body: '',
      });
      expect(second.title).toBe('Kitchen/plans');
      expect(second.body).toBe('');

      const listed = await alice.listNotes(garden.id);
      expect(listed.total).toBe(2);
      expect(listed.hasMore).toBe(false);
      expect(listed.nextCursor).toBeNull();
      expect(listed.notes.map((note) => note.title)).toEqual(['Kitchen/plans', 'Kickoff']);
      expect(listed.notes[0]).not.toHaveProperty('body');
      expect(listed.notes[1]?.excerpt).toBe('First line');

      const renamed = await alice.updateNote(garden.id, first.id, {
        title: 'Kickoff notes',
        expectedVersion: first.version,
      });
      expect(renamed.version).toBe('2');
      expect(renamed.createdAt).toBe(first.createdAt);
      expect(renamed.updatedAt > first.updatedAt).toBe(true);

      const afterEdit = await alice.listNotes(garden.id);
      expect(afterEdit.notes.map((note) => note.title)).toEqual(['Kickoff notes', 'Kitchen/plans']);
      expect(afterEdit.notes[0]?.id).toBe(first.id);
    });

    it('soft-deletes: keeps the id, hides the row, and 404s a direct read', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const note = await alice.createNote(garden.id, { title: 'Scratch', body: 'Gone soon' });

      await alice.deleteNote(garden.id, note.id);

      const listed = await alice.listNotes(garden.id);
      expect(listed.total).toBe(0);
      expect(listed.notes).toEqual([]);

      await expect(alice.getNote(garden.id, note.id)).rejects.toThrow(NotFoundError);
      await expect(alice.updateNote(garden.id, note.id, {
        body: 'Nope',
        expectedVersion: note.version,
      })).rejects.toThrow(NotFoundError);
    });

    it('refuses a stale save and lets the caller save a copy', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const note = await alice.createNote(garden.id, { title: 'Meeting', body: 'Draft' });

      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const botWrite = await bot.updateNote(garden.id, note.id, {
        body: 'Lane saved first',
        expectedVersion: note.version,
      });
      expect(botWrite.body).toBe('Lane saved first');
      expect(botWrite.updatedByName).toBe('Lane');

      await expect(
        alice.updateNote(garden.id, note.id, {
          body: 'Old copy',
          expectedVersion: note.version,
        })
      ).rejects.toThrow(StaleNoteError);

      const copy = await alice.createNote(garden.id, {
        title: 'Meeting (copy)',
        body: 'Old copy',
      });
      expect(copy.id).not.toBe(note.id);
      expect(copy.title).toBe('Meeting (copy)');
      expect(copy.body).toBe('Old copy');

      const current = await alice.getNote(garden.id, note.id);
      expect(current.body).toBe('Lane saved first');
    });

    it('writes note changes to the timeline and combines same-person saves within 10 minutes', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const note = await alice.createNote(garden.id, { title: 'Meeting', body: 'One' });
      await alice.updateNote(garden.id, note.id, {
        body: 'Two',
        expectedVersion: note.version,
      });

      const history = await alice.listProjectHistory(garden.id);
      const noteKinds = history.entries
        .filter((entry) => entry.subject.id === note.id)
        .map((entry) => entry.kind);
      expect(noteKinds).toEqual(['NoteUpdated']);
      expect(noteKinds).not.toContain('NoteCreated');

      const updated = history.entries.find((entry) => entry.kind === 'NoteUpdated');
      expect(updated?.actor.name).toBe('Alice');
      expect(updated?.details).toMatchObject({
        kind: 'NoteUpdated',
        title: 'Meeting',
        bodyChanged: true,
      });

      await alice.deleteNote(garden.id, note.id);
      const afterDelete = await alice.listProjectHistory(garden.id);
      const deleted = afterDelete.entries.find((entry) => entry.kind === 'NoteDeleted');
      expect(deleted?.subject.deleted).toBe(true);
      expect(deleted?.details).toMatchObject({ kind: 'NoteDeleted', title: 'Meeting' });
    });

    it('refuses a blank title and accepts an empty body', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await expect(alice.createNote(garden.id, { title: '  ' })).rejects.toThrow(ValidationError);

      const empty = await alice.createNote(garden.id, { title: 'Blank body' });
      expect(empty.body).toBe('');
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Project notes [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-notes-ui@example.com');
    });

    it('adds, reads, edits, and shows notes under next action', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.updateProject(garden.id, { notebookPages: ['Garden/notes.md'] });
      const next = await alice.createTask({ title: 'Water the beds', projectId: garden.id });
      await alice.setNextAction(garden.id, { taskId: next.id });

      await alice.goToProject(garden.id);
      await alice.shouldSeeNotesReady();
      await alice.shouldSeeNotesEmpty();
      await alice.shouldSeeNotesBetweenNextActionAndNotebook();

      await alice.addNoteOnProject({
        title: 'Kickoff',
        body: 'First line\n\nMore detail',
      });
      await alice.shouldSeeOpenNote({ title: 'Kickoff', bodyText: 'First line' });
      await alice.cancelOpenNote();

      await alice.shouldSeeNoteOnProject({
        title: 'Kickoff',
        excerpt: 'First line',
        stamp: 'Alice',
      });

      await alice.openNoteOnProject('Kickoff');
      await alice.startEditingOpenNote();
      await alice.editOpenNote({ title: 'Kickoff notes', body: 'Updated body' });
      await alice.saveOpenNote();
      await alice.shouldSeeOpenNote({ title: 'Kickoff notes', bodyText: 'Updated body' });
    }, 60_000);

    it('refuses a stale save, then saves a copy and can see the newer version', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const note = await alice.createNote(garden.id, { title: 'Meeting', body: 'Draft' });

      await alice.goToProject(garden.id);
      await alice.openNoteOnProject('Meeting');
      await alice.startEditingOpenNote();
      await alice.editOpenNote({ body: 'My local draft' });

      await alice.updateNote(garden.id, note.id, {
        body: 'Lane saved first',
        expectedVersion: note.version,
      });

      await alice.saveOpenNote();
      await alice.shouldSeeNoteStale();
      await alice.shouldSeeNoteEditor();
      await alice.shouldSeeOpenNote({ title: 'Meeting', bodyText: 'My local draft' });

      await alice.seeNewerNoteVersion();
      await alice.shouldSeeOpenNote({ title: 'Meeting', bodyText: 'Lane saved first' });

      await alice.editOpenNote({ body: 'My local draft' });
      const newer = await alice.getNote(garden.id, note.id);
      await alice.updateNote(garden.id, note.id, {
        body: 'Lane saved again',
        expectedVersion: newer.version,
      });
      await alice.saveOpenNote();
      await alice.shouldSeeNoteStale();
      await alice.saveOpenNoteAsCopy();
      await alice.shouldSeeNoteOnProject({ title: 'Meeting (copy)', excerpt: 'My local draft' });
      await alice.shouldSeeNoteOnProject({ title: 'Meeting', excerpt: 'Lane saved again' });
    }, 60_000);

    it('deletes with confirmation and hides the note everywhere', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createNote(garden.id, { title: 'Scratch', body: 'Gone soon' });

      await alice.goToProject(garden.id);
      await alice.openNoteOnProject('Scratch');
      await alice.deleteOpenNote();
      await alice.shouldNotSeeNoteOnProject('Scratch');
      await alice.shouldSeeNotesEmpty();

      const listed = await alice.listNotes(garden.id);
      expect(listed.total).toBe(0);
    }, 60_000);

    it('previews markdown, blocks raw HTML, and prompts to discard edits', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      await alice.createNote(garden.id, {
        title: 'Spec',
        body: '# Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n',
      });

      await alice.goToProject(garden.id);
      await alice.openNoteOnProject('Spec');
      await alice.shouldSeeOpenNote({ title: 'Spec', bodyText: 'Hello' });
      await alice.shouldNotSeeRawHtmlInNote('alert(1)');

      await alice.startEditingOpenNote();
      await alice.toggleNotePreview();
      await alice.shouldSeeNotePreview();
      await alice.shouldNotSeeRawHtmlInNote('alert(1)');
      await alice.toggleNotePreview();

      await alice.editOpenNote({ title: 'Spec draft' });
      await alice.cancelOpenNote();
      await alice.shouldSeeDiscardChangesPrompt();
      await alice.keepEditingNote();
      await alice.shouldSeeNoteEditor();
      await alice.cancelOpenNote();
      await alice.shouldSeeDiscardChangesPrompt();
      await alice.discardNoteChanges();
      await alice.shouldSeeNoteOnProject({ title: 'Spec' });
    }, 60_000);

    it('shows combined note history after two quick saves', async () => {
      const garden = await alice.createProject({ name: 'Garden' });
      const note = await alice.createNote(garden.id, { title: 'Meeting', body: 'One' });
      await alice.updateNote(garden.id, note.id, {
        body: 'Two',
        expectedVersion: note.version,
      });

      await alice.goToProject(garden.id);
      await alice.expandProjectHistory();
      await alice.shouldSeeHistoryEntry({
        kind: 'NoteUpdated',
        actor: 'Alice',
        text: "changed the body on 'Meeting'",
      });
    }, 60_000);

    for (const viewport of [
      { name: 'desktop' as const, apply: (actor: BrowserActor) => actor.useDesktopViewport() },
      { name: 'phone' as const, apply: (actor: BrowserActor) => actor.useMobileViewport() },
    ]) {
      it(`walks notes on ${viewport.name}`, async () => {
        await viewport.apply(alice);
        const garden = await alice.createProject({ name: 'Garden' });
        await alice.updateProject(garden.id, { notebookPages: ['Garden/notes.md'] });
        const next = await alice.createTask({ title: 'Water the beds', projectId: garden.id });
        await alice.setNextAction(garden.id, { taskId: next.id });
        await alice.createNote(garden.id, {
          title: 'Kickoff',
          body: 'First line\n\n# Hello\n\n<script>alert(1)</script>',
        });

        await alice.goToProject(garden.id);
        await alice.shouldSeeNotesReady();
        await alice.shouldSeeNoteOnProject({
          title: 'Kickoff',
          excerpt: 'First line',
          stamp: 'Alice',
        });
        await alice.shouldSeeNotesBetweenNextActionAndNotebook();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'notes_list',
        });

        await alice.openNoteOnProject('Kickoff');
        await alice.shouldSeeOpenNote({ title: 'Kickoff', bodyText: 'Hello' });
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'note_read',
        });

        await alice.startEditingOpenNote();
        await alice.editOpenNote({ body: 'My local draft' });
        const current = (await alice.listNotes(garden.id)).notes[0];
        if (!current) {
          throw new Error('expected the kickoff note');
        }
        await alice.updateNote(garden.id, current.id, {
          body: 'Lane saved first',
          expectedVersion: current.version,
        });
        await alice.saveOpenNote();
        await alice.shouldSeeNoteStale();
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'note_stale',
        });

        await alice.saveOpenNoteAsCopy();
        await alice.cancelOpenNote();
        await alice.shouldSeeNoteOnProject({ title: 'Kickoff (copy)' });
        await alice.openNoteOnProject('Kickoff (copy)');
        await alice.deleteOpenNote();
        await alice.shouldNotSeeNoteOnProject('Kickoff (copy)');
        await alice.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'notes_after_delete',
        });
      }, 90_000);
    }
  });
});
