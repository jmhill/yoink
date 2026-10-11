import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type {
  BrowserActor,
  CoreActor,
  HistoryPage,
  ImportProject,
  TimelineEntry,
} from '@yoink/acceptance-testing';
import { ConflictError, ForbiddenError, ImportInvalidError } from '@yoink/acceptance-testing';

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

const collectHistory = async (
  actor: CoreActor,
  projectId: string
): Promise<HistoryPage['entries']> => {
  const page = await actor.listProjectHistory(projectId, { limit: 50 });
  expect(page.hasMore).toBe(false);
  expect(page.nextCursor).toBeNull();
  return page.entries;
};

const inventedBatch = async (
  actor: CoreActor
): Promise<{ paint: { id: string }; projects: ImportProject[] }> => {
  const paint = await actor.createTask({ title: 'Paint the door' });
  const hinges = await actor.createTask({ title: 'Order hinges', dueDate: '2026-11-01' });
  const hook = await actor.createTask({ title: 'Hang the hook' });
  return {
    paint,
    projects: [
      {
        name: 'Harbor shed',
        objective: 'Keep the dock usable',
        status: 'active',
        notebookPages: ['notes/Harbor shed (dock).md', 'notes/Harbor shed winter.md'],
        existingTaskIds: [paint.id, hinges.id, hook.id],
        nextAction: { existingTaskId: paint.id },
      },
      {
        name: 'Permit desk',
        objective: 'Get the slip approved',
        status: 'waiting',
        waitingOn: 'City hall',
        waitingSince: null,
        newTasks: [
          {
            key: 'call-clerk',
            title: 'Call the clerk',
            assigneeId: '00000000-0000-4000-8000-000000000099',
          },
        ],
        nextAction: { newTaskKey: 'call-clerk' },
      },
      {
        name: 'Winter boat cover',
        status: 'someday',
        newTasks: [{ key: 'measure', title: 'Measure the cockpit' }],
      },
    ],
  };
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Project import [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-import-http@example.com');
    });

    it('stages, previews, applies, and writes one Moved in line per project', async () => {
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const { paint, projects } = await inventedBatch(alice);
      const staged = await bot.stageProjectImport(projects);
      expect(staged.status).toBe('pending');
      expect(staged.createdByName).toBe('Lane');
      expect(staged.preview?.projects.map((entry) => entry.name)).toEqual([
        'Harbor shed',
        'Permit desk',
        'Winter boat cover',
      ]);
      expect(staged.preview?.projects[1]?.warnings).toEqual([
        {
          field: 'newTasks.0.assigneeId',
          code: 'ASSIGNEE_NOT_IN_ORGANIZATION',
          message: 'Assignee is not a member; this task will import unassigned',
        },
      ]);

      await expect(bot.applyProjectImport(staged.id)).rejects.toBeInstanceOf(ForbiddenError);

      const applied = await alice.applyProjectImport(staged.id);
      expect(applied.projects.map((project) => project.name)).toEqual([
        'Harbor shed',
        'Permit desk',
        'Winter boat cover',
      ]);

      const harbor = applied.projects[0];
      expect(harbor).toBeDefined();
      if (!harbor) {
        return;
      }
      const history = await collectHistory(alice, harbor.id);
      expect(history).toHaveLength(1);
      expect(snapshot(history)).toEqual([
        {
          kind: 'ProjectImported',
          subjectType: 'project',
          subjectTitle: 'Harbor shed',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectImported', taskCount: 3 },
        },
      ]);

      const paintHistory = await alice.listTaskHistory(paint.id);
      expect(snapshot(paintHistory.entries)[0]).toEqual({
        kind: 'TaskAddedToProject',
        subjectType: 'task',
        subjectTitle: 'Paint the door',
        subjectDeleted: false,
        actorName: 'Alice',
        actorKind: 'user',
        details: {
          kind: 'TaskAddedToProject',
          projectId: harbor.id,
          projectName: 'Harbor shed',
          via: 'import',
        },
      });

      await expect(alice.applyProjectImport(staged.id)).rejects.toBeInstanceOf(ConflictError);
    });

    it('returns every staging error and stores nothing', async () => {
      try {
        await alice.stageProjectImport([
          { name: '   ', status: 'active' },
          { name: 'Harbor shed', status: 'done' },
        ]);
        throw new Error('expected IMPORT_INVALID');
      } catch (error) {
        expect(error).toBeInstanceOf(ImportInvalidError);
        if (error instanceof ImportInvalidError) {
          expect(error.errors).toEqual([
            {
              index: 0,
              name: '   ',
              field: 'name',
              code: 'PROJECT_NAME_BLANK',
              message: "Name can't be blank",
            },
            {
              index: 1,
              name: 'Harbor shed',
              field: 'status',
              code: 'INVALID_PROJECT_STATUS',
              message: 'Imported projects cannot be done or proposed',
            },
          ]);
        }
      }
      expect(await alice.listPendingProjectImports()).toEqual([]);
      expect(await alice.listProjects()).toEqual([]);
    });

    it('refuses apply after drift', async () => {
      const { projects } = await inventedBatch(alice);
      const staged = await alice.stageProjectImport(projects);
      await alice.createProject({ name: 'Harbor shed' });
      try {
        await alice.applyProjectImport(staged.id);
        throw new Error('expected IMPORT_INVALID');
      } catch (error) {
        expect(error).toBeInstanceOf(ImportInvalidError);
        if (error instanceof ImportInvalidError) {
          expect(error.errors).toEqual([
            {
              index: 0,
              name: 'Harbor shed',
              field: 'name',
              code: 'DUPLICATE_PROJECT_NAME',
              message: 'A project with this name already exists',
            },
          ]);
        }
      }
      const preview = await alice.getProjectImport(staged.id);
      expect(preview.status).toBe('pending');
      expect(preview.preview).toBeNull();
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Project import walkthrough [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-import-ui@example.com');
    });

    for (const viewport of [
      { name: 'desktop' as const, apply: (actor: BrowserActor) => actor.useDesktopViewport() },
      { name: 'phone' as const, apply: (actor: BrowserActor) => actor.useMobileViewport() },
    ]) {
      it(`walks the staged import on ${viewport.name}`, async () => {
        await viewport.apply(alice);
        const minted = await alice.mintAgent('Lane');
        const bot = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: alice.organizationId,
          token: minted.rawToken,
        });
        const { projects } = await inventedBatch(alice);
        const staged = await bot.stageProjectImport(projects);

        await alice.goToProject((await alice.createProject({ name: 'Scratch pad' })).id);
        await alice.shouldSeePendingImportBanner('Lane staged an import of 3 projects');
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'banner',
        });

        await alice.reviewPendingImport();
        await alice.shouldSeeImportPreviewProject('Harbor shed');
        await alice.shouldSeeImportPreviewProject('Permit desk');
        await alice.shouldSeeImportWarning('Assignee is not a member');
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'preview',
        });

        const invalid = await alice.stageProjectImport([
          { name: '   ', status: 'active' },
          { name: 'Broken dock', status: 'done' },
        ]).catch((error) => error);
        expect(invalid).toBeInstanceOf(ImportInvalidError);
        const pending = await alice.listPendingProjectImports();
        const broken = pending.find((item) => item.id !== staged.id);
        if (broken) {
          await alice.discardProjectImport(broken.id);
        }

        await alice.goToImportPreview(staged.id);
        await alice.applyImportOnPreview();
        await alice.shouldNotSeePendingImportBanner();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'all_projects',
        });

        const imported = (await alice.listProjects()).find((project) => project.name === 'Harbor shed');
        expect(imported).toBeDefined();
        if (!imported) {
          return;
        }
        await alice.goToProject(imported.id);
        await alice.shouldSeeNotebookPage('notes/Harbor shed (dock).md');
        await alice.expandProjectHistory();
        await alice.shouldSeeHistoryEntry({
          kind: 'ProjectImported',
          actor: 'Alice',
          text: 'Moved in · 3 tasks',
        });
        await alice.shouldNotSeeHistoryStart();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'imported_project_history',
        });
      }, 120_000);

      it(`discards a staged import on ${viewport.name}`, async () => {
        await viewport.apply(alice);
        const minted = await alice.mintAgent('Lane');
        const bot = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: alice.organizationId,
          token: minted.rawToken,
        });
        const { projects } = await inventedBatch(alice);
        await bot.stageProjectImport(projects);
        await alice.goToProject((await alice.createProject({ name: 'Scratch pad' })).id);
        await alice.reviewPendingImport();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'discard_preview',
        });
        await alice.discardImportOnPreview();
        await alice.shouldNotSeePendingImportBanner();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'discarded',
        });
      }, 120_000);
    }

    it('shows the preview errors state', async () => {
      await alice.useDesktopViewport();
      const { projects } = await inventedBatch(alice);
      const staged = await alice.stageProjectImport(projects);
      await alice.createProject({ name: 'Harbor shed' });
      await alice.goToImportPreview(staged.id);
      await alice.shouldSeeImportError("A project with this name already exists");
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_errors',
      });
    }, 120_000);
  });
});
