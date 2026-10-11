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
  const entries: HistoryPage['entries'] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore === true) {
    const page = await actor.listProjectHistory(projectId, { limit: 1, cursor });
    expect(page.entries.length).toBeLessThanOrEqual(1);
    entries.push(...page.entries);
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;
    if (entries.length > 30) {
      throw new Error('history paging did not terminate');
    }
  }
  return entries;
};

const collectTaskHistory = async (
  actor: CoreActor,
  taskId: string
): Promise<HistoryPage['entries']> => {
  const entries: HistoryPage['entries'] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore === true) {
    const page = await actor.listTaskHistory(taskId, { limit: 1, cursor });
    entries.push(...page.entries);
    hasMore = page.hasMore;
    cursor = page.nextCursor ?? undefined;
    if (entries.length > 30) {
      throw new Error('task history paging did not terminate');
    }
  }
  return entries;
};

const inventedBatch = async (
  actor: CoreActor
): Promise<{
  paint: { id: string; title: string };
  hinges: { id: string; title: string };
  hook: { id: string; title: string };
  projects: ImportProject[];
}> => {
  const paint = await actor.createTask({
    title: 'Paint the door',
    assigneeId: actor.userId,
  });
  const hinges = await actor.createTask({ title: 'Order hinges', dueDate: '2026-11-01' });
  const hook = await actor.createTask({ title: 'Hang the hook' });
  return {
    paint,
    hinges,
    hook,
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

const NOT_A_MEMBER = '00000000-0000-4000-8000-000000000099';

const largeInventedSpecs = [
  { name: 'Cedar pantry', status: 'active' as const, existing: ['Measure the shelves', 'Buy jar lids'] },
  { name: 'Bike stand', status: 'active' as const, existing: ['Cut the uprights', 'Find the lag bolts'] },
  { name: 'Tomato starts', status: 'active' as const, existing: ['Fill the trays', 'Mix the potting soil'] },
  { name: 'Attic fan', status: 'active' as const, existing: ['Measure the vent', 'Order the thermostat'] },
  { name: 'Guest towels', status: 'active' as const, existing: ['Wash the extras', 'Label the shelf'] },
  { name: 'Maple syrup', status: 'active' as const, existing: ['Rinse the jugs', 'Mark the date'] },
  { name: 'Porch swing', status: 'active' as const, existing: ['Sand the seat', 'Oil the chains'] },
  { name: 'Rain barrel', status: 'active' as const, existing: ['Level the pad', 'Fit the diverter'] },
  { name: 'Spice rack', status: 'active' as const, existing: ['Sort the jars', 'Print the labels'] },
  { name: 'Compost bin', status: 'active' as const, existing: ['Drill the sides', 'Add the browns'] },
  { name: 'Window quilts', status: 'active' as const, existing: ['Cut the batting', 'Sew the tabs'] },
  { name: 'Seed packets', status: 'active' as const, existing: ['Sort by month', 'Clip the extras'] },
  { name: 'Tool wall', status: 'active' as const, existing: ['Outline the saw'] },
  { name: 'Bread box', status: 'active' as const, existing: ['Fit the lid'] },
  { name: 'Laundry chute', status: 'waiting' as const, waitingOn: 'Carpenter', existing: ['Measure the drop'] },
  {
    name: 'Bird feeder',
    status: 'someday' as const,
    existing: [] as string[],
    newTasks: [{ key: 'hang-feeder', title: 'Hang the feeder' }],
  },
  {
    name: 'Storm windows',
    status: 'someday' as const,
    existing: [] as string[],
    newTasks: [{ key: 'label-sashes', title: 'Label the sashes' }],
  },
  {
    name: 'Shoe rack',
    status: 'waiting' as const,
    waitingOn: 'Hardware shop',
    existing: [] as string[],
    newTasks: [{ key: 'order-dowels', title: 'Order the dowels', assigneeId: NOT_A_MEMBER }],
  },
  {
    name: 'Firewood crib',
    status: 'someday' as const,
    existing: [] as string[],
    newTasks: [{ key: 'stack-first-row', title: 'Stack the first row' }],
  },
];

const largeInventedBatch = async (
  actor: CoreActor
): Promise<{
  projects: ImportProject[];
  firstName: string;
  midName: string;
  warningName: string;
}> => {
  const projects: ImportProject[] = [];
  for (const spec of largeInventedSpecs) {
    const existing = [];
    for (const title of spec.existing) {
      existing.push(await actor.createTask({ title }));
    }
    projects.push({
      name: spec.name,
      status: spec.status,
      ...(spec.waitingOn !== undefined ? { waitingOn: spec.waitingOn, waitingSince: null } : {}),
      ...(existing.length > 0
        ? {
            existingTaskIds: existing.map((task) => task.id),
            nextAction: { existingTaskId: existing[0]!.id },
          }
        : {}),
      ...('newTasks' in spec && spec.newTasks
        ? {
            newTasks: spec.newTasks,
            nextAction: { newTaskKey: spec.newTasks[0]!.key },
          }
        : {}),
    });
  }
  return {
    projects,
    firstName: 'Cedar pantry',
    midName: 'Spice rack',
    warningName: 'Shoe rack',
  };
};

const harborNotebook = [
  {
    path: 'notes/Harbor shed (dock).md',
    url: 'obsidian://open?vault=jmhill-personal&file=notes%2FHarbor%20shed%20%28dock%29.md',
  },
  {
    path: 'notes/Harbor shed winter.md',
    url: 'obsidian://open?vault=jmhill-personal&file=notes%2FHarbor%20shed%20winter.md',
  },
];

usingDrivers(['http'] as const, (ctx) => {
  describe(`Project import [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-import-http@example.com');
    });

    it('stages, previews, applies with a person token, and writes one Moved in line per project', async () => {
      const runStart = new Date().toISOString();
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const { paint, hinges, hook, projects } = await inventedBatch(alice);
      const staged = await bot.stageProjectImport(projects);
      expect(staged.status).toBe('pending');
      expect(staged.createdByName).toBe('Lane');
      expect(staged.preview).toEqual({
        projects: [
          {
            name: 'Harbor shed',
            objective: 'Keep the dock usable',
            status: 'active',
            waitingOn: null,
            waitingSince: null,
            nextActionTitle: 'Paint the door',
            tasks: [
              { title: 'Paint the door', source: 'existing', assigneeName: 'Alice' },
              { title: 'Order hinges', source: 'existing', dueDate: '2026-11-01' },
              { title: 'Hang the hook', source: 'existing' },
            ],
            notebookPages: harborNotebook,
            warnings: [],
          },
          {
            name: 'Permit desk',
            objective: 'Get the slip approved',
            status: 'waiting',
            waitingOn: 'City hall',
            waitingSince: null,
            nextActionTitle: 'Call the clerk',
            tasks: [{ title: 'Call the clerk', source: 'new' }],
            notebookPages: [],
            warnings: [
              {
                field: 'newTasks.0.assigneeId',
                code: 'ASSIGNEE_NOT_IN_ORGANIZATION',
                message: 'Assignee is not a member; this task will import unassigned',
              },
            ],
          },
          {
            name: 'Winter boat cover',
            status: 'someday',
            waitingOn: null,
            waitingSince: null,
            nextActionTitle: null,
            tasks: [{ title: 'Measure the cockpit', source: 'new' }],
            notebookPages: [],
            warnings: [],
          },
        ],
        totals: {
          projectCount: 3,
          existingTaskCount: 3,
          newTaskCount: 2,
          projectsWithNoNextAction: 1,
        },
      });

      await expect(bot.applyProjectImport(staged.id)).rejects.toBeInstanceOf(ForbiddenError);

      const applied = await alice.applyProjectImport(staged.id);
      expect(applied.projects.map((project) => project.name)).toEqual([
        'Harbor shed',
        'Permit desk',
        'Winter boat cover',
      ]);

      const harbor = applied.projects[0];
      const permit = applied.projects[1];
      const cover = applied.projects[2];
      expect(harbor && permit && cover).toBeTruthy();
      if (!harbor || !permit || !cover) {
        return;
      }

      const loadedHarbor = await alice.getProject(harbor.id);
      expect(loadedHarbor.notebookPages).toEqual(harborNotebook);
      expect(loadedHarbor.waitingOn).toBeNull();
      expect(loadedHarbor.waitingSince).toBeNull();
      expect(loadedHarbor.createdAt >= runStart).toBe(true);

      const loadedPermit = await alice.getProject(permit.id);
      expect(loadedPermit.notebookPages).toEqual([]);
      expect(loadedPermit.waitingOn).toBe('City hall');
      expect(loadedPermit.waitingSince).toBeNull();
      expect(loadedPermit.createdAt >= runStart).toBe(true);

      const loadedCover = await alice.getProject(cover.id);
      expect(loadedCover.notebookPages).toEqual([]);
      expect(loadedCover.waitingOn).toBeNull();
      expect(loadedCover.waitingSince).toBeNull();
      expect(loadedCover.nextActionTaskId).toBeNull();
      expect(loadedCover.createdAt >= runStart).toBe(true);

      expect(snapshot(await collectHistory(alice, harbor.id))).toEqual([
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
      expect(snapshot(await collectHistory(alice, permit.id))).toEqual([
        {
          kind: 'ProjectImported',
          subjectType: 'project',
          subjectTitle: 'Permit desk',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectImported', taskCount: 1 },
        },
      ]);
      expect(snapshot(await collectHistory(alice, cover.id))).toEqual([
        {
          kind: 'ProjectImported',
          subjectType: 'project',
          subjectTitle: 'Winter boat cover',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: { kind: 'ProjectImported', taskCount: 1 },
        },
      ]);

      expect(snapshot(await collectTaskHistory(alice, paint.id))[0]).toEqual({
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
      expect(snapshot(await collectTaskHistory(alice, hinges.id))[0]).toEqual({
        kind: 'TaskAddedToProject',
        subjectType: 'task',
        subjectTitle: 'Order hinges',
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
      expect(snapshot(await collectTaskHistory(alice, hook.id))[0]).toEqual({
        kind: 'TaskAddedToProject',
        subjectType: 'task',
        subjectTitle: 'Hang the hook',
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

      const clerkId = permit.nextActionTaskId;
      expect(clerkId).toBeTruthy();
      if (!clerkId) {
        return;
      }
      expect(snapshot(await collectTaskHistory(alice, clerkId))).toEqual([
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Call the clerk',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'TaskCreated',
            via: 'import',
            projectName: 'Permit desk',
          },
        },
      ]);

      const coverTasks = await alice.listOpenTasksOnProject(cover.id);
      expect(coverTasks.map((task) => task.title)).toEqual(['Measure the cockpit']);
      const measure = coverTasks[0];
      expect(measure).toBeDefined();
      if (!measure) {
        return;
      }
      expect(snapshot(await collectTaskHistory(alice, measure.id))).toEqual([
        {
          kind: 'TaskCreated',
          subjectType: 'task',
          subjectTitle: 'Measure the cockpit',
          subjectDeleted: false,
          actorName: 'Alice',
          actorKind: 'user',
          details: {
            kind: 'TaskCreated',
            via: 'import',
            projectName: 'Winter boat cover',
          },
        },
      ]);

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

        await alice.goToAllProjects();
        await alice.shouldSeePendingImportBanner('Lane staged an import of 3 projects');
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'banner',
        });

        await alice.reviewPendingImport();
        await alice.shouldSeeImportPreviewSummary(
          '3 projects · 3 existing tasks · 2 new · 1 warning'
        );
        await alice.shouldSeeImportPreviewCollapsed('Harbor shed');
        await alice.shouldSeeImportPreviewProject('Paint the door');
        await alice.shouldSeeImportPreviewExpanded('Permit desk');
        await alice.shouldSeeImportPreviewCollapsed('Winter boat cover');
        await alice.shouldSeeImportPreviewProject('No next action');
        await alice.shouldSeeImportWarning('Assignee is not a member');
        await alice.scrollImportPreviewProject('Harbor shed');
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'preview',
        });
        await alice.expandImportPreviewProject('Harbor shed');
        await alice.shouldSeeImportPreviewExpanded('Harbor shed');
        await alice.shouldSeeImportPreviewProject('Keep the dock usable');
        await alice.shouldSeeImportPreviewProject('Paint the door (existing) · Alice');
        await alice.shouldSeeImportPreviewProject('Order hinges (existing) · Nov 1');
        await alice.shouldSeeImportPreviewProject('Permit desk');
        await alice.shouldSeeImportPreviewProject('Winter boat cover');
        await alice.shouldSeeImportFooterWhilePreviewScrolledTo('Winter boat cover');
        await alice.scrollImportActionsIntoView();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'preview_footer',
        });

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
        await alice.shouldSeeNotebookHref(
          'notes/Harbor shed (dock).md',
          harborNotebook[0]!.url
        );
        await alice.openProjectEditDialog();
        await alice.shouldSeeNotebookPageInputs([
          'notes/Harbor shed (dock).md',
          'notes/Harbor shed winter.md',
        ]);
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'edit_notebook',
        });
        await alice.dismissProjectEditDialog();
        await alice.expandProjectHistory();
        await alice.shouldSeeHistoryEntry({
          kind: 'ProjectImported',
          actor: 'Alice',
          text: 'Moved in · 3 tasks',
          highlight: false,
        });
        await alice.shouldNotSeeHistoryStart();
        if (viewport.name === 'phone') {
          await alice.scrollProjectHistoryIntoView();
        } else {
          await alice.scrollProjectHeadingIntoView();
        }
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'imported_project_history',
        });
        await viewport.apply(alice);

        const permit = (await alice.listProjects()).find((project) => project.name === 'Permit desk');
        expect(permit).toBeDefined();
        if (!permit) {
          return;
        }
        await alice.goToProject(permit.id);
        await alice.shouldSeeWaitingSummary('since unknown');
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'waiting_unknown',
        });

        const cover = (await alice.listProjects()).find(
          (project) => project.name === 'Winter boat cover'
        );
        expect(cover).toBeDefined();
        if (!cover) {
          return;
        }
        await alice.goToProject(cover.id);
        await alice.shouldSeeSomedaySetNextActionLink();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'someday_no_warning',
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
        await alice.goToAllProjects();
        await alice.reviewPendingImport();
        await alice.pressImportDiscardAndHold();
        await alice.saveWalkthroughScreenshot({
          story: '139-project-import',
          step: 'discard_preview',
        });
        await alice.releaseHeldImportDiscard();
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
      await alice.shouldSeeImportError('Harbor shed: a project with this name already exists');
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_errors',
      });
    }, 120_000);

    it('scans a large invented batch on the phone', async () => {
      await alice.useMobileViewport();
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const { projects, firstName, midName, warningName } = await largeInventedBatch(alice);
      expect(projects).toHaveLength(19);
      const staged = await bot.stageProjectImport(projects);
      expect(staged.preview?.totals).toEqual({
        projectCount: 19,
        existingTaskCount: 27,
        newTaskCount: 4,
        projectsWithNoNextAction: 0,
      });

      await alice.goToAllProjects();
      await alice.reviewPendingImport();
      await alice.shouldSeeImportPreviewSummary(
        '19 projects · 27 existing tasks · 4 new · 1 warning'
      );
      await alice.shouldSeeImportPreviewCollapsed(firstName);
      await alice.shouldSeeImportPreviewExpanded(warningName);
      await alice.shouldSeeImportWarning('Assignee is not a member');
      await alice.shouldSeeImportFooter();
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_large',
      });

      await alice.expandImportPreviewProject(firstName);
      await alice.shouldSeeImportPreviewExpanded(firstName);
      await alice.scrollImportPreviewProject(firstName);
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_large_open',
      });

      await alice.scrollImportPreviewProject(warningName);
      await alice.shouldSeeImportPreviewExpanded(warningName);
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_large_warning',
      });

      await alice.shouldSeeImportFooterWhilePreviewScrolledTo(midName);
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_large_mid',
      });
    }, 180_000);

    it('keeps notebook-page focus and adds a page on Enter', async () => {
      await alice.useDesktopViewport();
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const { projects } = await inventedBatch(alice);
      const staged = await bot.stageProjectImport(projects);
      const applied = await alice.applyProjectImport(staged.id);
      const harbor = applied.projects.find((project) => project.name === 'Harbor shed');
      expect(harbor).toBeDefined();
      if (!harbor) {
        return;
      }
      await alice.goToProject(harbor.id);
      await alice.openProjectEditDialog();
      await alice.typeNotebookPageAndKeepFocus(0, 'x');
      await alice.addNotebookPageWithEnter('notes/Harbor shed extra.md');
      await alice.shouldSeeNotebookPageInputs([
        'notes/Harbor shed (dock).mdx',
        'notes/Harbor shed winter.md',
        'notes/Harbor shed extra.md',
      ]);
    }, 120_000);

    it('shows N imports waiting and Review opens the newest', async () => {
      await alice.useMobileViewport();
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const first = await inventedBatch(alice);
      await bot.stageProjectImport(first.projects);
      const laterTask = await alice.createTask({ title: 'Rake the leaves' });
      await bot.stageProjectImport([
        {
          name: 'Cedar pantry',
          status: 'active',
          existingTaskIds: [laterTask.id],
          nextAction: { existingTaskId: laterTask.id },
        },
      ]);
      await alice.goToAllProjects();
      await alice.shouldSeePendingImportBanner('2 imports waiting');
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'banner_two',
      });
      await alice.reviewPendingImport();
      await alice.shouldSeeImportPreviewProject('Cedar pantry');
      await alice.shouldSeeImportPreviewCollapsed('Cedar pantry');
    }, 120_000);

    it('shows preview errors on the phone and a multi-error batch', async () => {
      await alice.useMobileViewport();
      const { paint, projects } = await inventedBatch(alice);
      const staged = await alice.stageProjectImport(projects);
      await alice.createProject({ name: 'Harbor shed' });
      await alice.goToImportPreview(staged.id);
      await alice.shouldSeeImportError('Harbor shed: a project with this name already exists');
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_errors',
      });

      const other = await alice.createProject({ name: 'Other dock' });
      await alice.updateTask(paint.id, { projectId: other.id });
      await alice.goToImportPreview(staged.id);
      await alice.shouldSeeImportError('Harbor shed: a project with this name already exists');
      await alice.shouldSeeImportError("Harbor shed: 'Paint the door' is already in another project");
      await alice.saveWalkthroughScreenshot({
        story: '139-project-import',
        step: 'preview_errors_multi',
      });
    }, 120_000);
  });
});
