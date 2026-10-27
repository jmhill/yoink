import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #204: show proposed projects on Review, All projects, and the sidebar.
 *
 * Screen only. Seeded bot proposals, modeled on Lane's four:
 * gun storage, roles and ownership cleanup, shared language and refactor,
 * projects and notes redesign. Never Justin's real board.
 */

const WALKTHROUGH_STORY = 'proposed-projects';
const DESKTOP = { width: 1440, height: 900 } as const;

const PROPOSALS = [
  {
    name: 'gun storage',
    reason: 'No home for the guns',
    suggestedNextAction: 'Measure the closet',
  },
  {
    name: 'roles and ownership cleanup',
    reason: 'Owner and admin rules are scattered',
    suggestedNextAction: 'List the role checks',
  },
  {
    name: 'shared language and refactor',
    reason: 'The same words mean different things',
    suggestedNextAction: 'Write the shared glossary',
  },
  {
    name: 'projects and notes redesign',
    reason: 'Projects and notes do not match the new screens',
    suggestedNextAction: 'Sketch the project page',
  },
] as const;

const BY_NAME = PROPOSALS.toSorted((left, right) => left.name.localeCompare(right.name));
const NAMES = BY_NAME.map((proposal) => proposal.name);

const withoutName = (name: string): string[] => NAMES.filter((item) => item !== name);

const laneFrom = async (
  person: CoreActor,
  ctx: {
    createActorWithCredentials: (credentials: {
      email: string;
      userId: string;
      organizationId: string;
      token: string;
    }) => CoreActor;
  }
): Promise<CoreActor> => {
  const minted = await person.mintAgent('Lane');
  return ctx.createActorWithCredentials({
    email: 'lane-204@example.com',
    userId: minted.agent.userId,
    organizationId: person.organizationId,
    token: minted.rawToken,
  });
};

const seedProposals = async (lane: CoreActor): Promise<void> => {
  for (const proposal of PROPOSALS) {
    await lane.createProject({
      name: proposal.name,
      status: 'proposed',
      reason: proposal.reason,
      suggestedNextAction: proposal.suggestedNextAction,
    });
  }
};

const seeProposalCards = async (actor: BrowserActor): Promise<void> => {
  await actor.shouldSeeReviewProposalNames(NAMES);
  for (const proposal of BY_NAME) {
    await actor.shouldSeeReviewProposal({
      name: proposal.name,
      proposedBy: 'Lane',
      reason: proposal.reason,
      suggestedNextAction: proposal.suggestedNextAction,
    });
  }
};

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Proposed projects on Review [${ctx.driverName}]`, () => {
    let justin: BrowserActor;
    let lane: CoreActor;

    beforeEach(async () => {
      justin = await ctx.createActor('justin-204-proposed@example.com');
      lane = await laneFrom(justin, ctx);
    });

    it('lists all four proposals on Review on phone and desktop', async () => {
      await seedProposals(lane);
      const working = await justin.listProjects();
      expect(working).toEqual([]);

      await justin.useMobileViewport();
      await justin.openReview();
      await seeProposalCards(justin);
      await justin.shouldSeeReviewSubcopy('4 need attention');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_proposed',
      });
      await justin.openReviewProposal('gun storage');
      await justin.shouldSeeProposalBanner({
        proposedBy: 'Lane',
        reason: 'No home for the guns',
      });
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_page',
      });

      // Back from the project page through the rail. A document reload here
      // never commits while the service worker is controlling the page.
      await justin.useDesktopViewport(DESKTOP);
      await justin.openRailReview();
      await seeProposalCards(justin);
      await justin.shouldSeeReviewSubcopy('4 need attention');
      await justin.shouldSeeProposedGroupNames(NAMES);
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'review_proposed',
      });
      await justin.openReviewProposal('gun storage');
      await justin.shouldSeeProposalBanner({
        proposedBy: 'Lane',
        reason: 'No home for the guns',
      });
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_page',
      });
    }, 180_000);

    it('shows them under Proposed on All projects and the sidebar on phone and desktop', async () => {
      await seedProposals(lane);
      await justin.createProject({ name: 'Garden' });

      await justin.useMobileViewport();
      await justin.goToAllProjects();
      for (const name of NAMES) {
        await justin.shouldSeeProjectInAllProjectsProposed(name);
      }
      await justin.shouldSeeProjectOnAllProjects({ name: 'Garden', status: 'active' });
      await justin.shouldSeeReviewSubcopy('5 need attention');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'all_projects_proposed',
      });
      await justin.openToday();
      await justin.openCreateTaskProjectPicker('Garden');
      await justin.shouldNotSeeOpenProjectOption('gun storage');
      await justin.dismissOpenSelect();
      await justin.openMobileBottomTab('work');
      await justin.openMobileTasksRail();
      await justin.shouldSeeProposedGroupNames(NAMES);
      await justin.openProposedGroup();
      for (const name of NAMES) {
        await justin.shouldSeeProjectInProposedGroup(name);
      }
      await justin.shouldSeeProjectOnRail('Garden');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'sidebar_proposed',
      });

      await justin.useDesktopViewport(DESKTOP);
      await justin.goToAllProjects();
      for (const name of NAMES) {
        await justin.shouldSeeProjectInAllProjectsProposed(name);
      }
      await justin.shouldSeeReviewSubcopy('5 need attention');
      await justin.shouldSeeProposedGroupNames(NAMES);
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'all_projects_proposed',
      });
      await justin.openToday();
      await justin.openCreateTaskProjectPicker('Garden');
      await justin.shouldNotSeeOpenProjectOption('gun storage');
      await justin.dismissOpenSelect();
      await justin.openRailReview();
      await justin.shouldSeeProposedGroupNames(NAMES);
      await justin.openProposedGroup();
      for (const name of NAMES) {
        await justin.shouldSeeProjectInProposedGroup(name);
      }
      await justin.shouldSeeProjectOnRail('Garden');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'sidebar_proposed',
      });
    }, 180_000);

    it('confirming a proposal removes it from Proposed and shows it as active on phone and desktop', async () => {
      await seedProposals(lane);
      await justin.createProject({ name: 'Garden' });

      await justin.useMobileViewport();
      await justin.openReview();
      await justin.openReviewProposalConfirm('gun storage');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'confirm_sheet',
      });
      const confirmed = await justin.confirmProcessProposal();
      expect(confirmed.project.name).toBe('gun storage');
      expect(confirmed.project.status).toBe('active');
      await justin.shouldNotSeeReviewProposal('gun storage');
      await justin.shouldSeeReviewProposalNames(withoutName('gun storage'));
      await justin.goToAllProjects();
      await justin.shouldSeeProjectOnAllProjects({ name: 'gun storage', status: 'active' });
      await justin.shouldNotSeeProjectInAllProjectsProposed('gun storage');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'after_confirm',
      });
      await justin.openMobileBottomTab('work');
      await justin.openMobileTasksRail();
      await justin.shouldSeeProjectOnRail('gun storage');
      await justin.shouldSeeProposedGroupNames(withoutName('gun storage'));

      await justin.useDesktopViewport(DESKTOP);
      await justin.openReview();
      await justin.openReviewProposalConfirm('projects and notes redesign');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'confirm_sheet',
      });
      const second = await justin.confirmProcessProposal();
      expect(second.project.status).toBe('active');
      await justin.shouldNotSeeReviewProposal('projects and notes redesign');
      await justin.shouldSeeReviewProposalNames([
        'roles and ownership cleanup',
        'shared language and refactor',
      ]);
      await justin.goToAllProjects();
      await justin.shouldSeeProjectOnAllProjects({
        name: 'projects and notes redesign',
        status: 'active',
      });
      await justin.shouldNotSeeProjectInAllProjectsProposed('projects and notes redesign');
      await justin.shouldSeeProjectOnRail('gun storage');
      await justin.shouldSeeProjectOnRail('projects and notes redesign');
      await justin.shouldSeeProposedGroupNames([
        'roles and ownership cleanup',
        'shared language and refactor',
      ]);
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'after_confirm',
      });
    }, 180_000);

    it('turning a proposal down removes it from Proposed on phone and desktop', async () => {
      await seedProposals(lane);

      await justin.useMobileViewport();
      await justin.openReview();
      await justin.turnDownReviewProposal('roles and ownership cleanup');
      await justin.shouldNotSeeReviewProposal('roles and ownership cleanup');
      await justin.shouldSeeReviewProposalNames(withoutName('roles and ownership cleanup'));
      await justin.goToAllProjects();
      await justin.shouldNotSeeProjectInAllProjectsProposed('roles and ownership cleanup');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'after_turn_down',
      });
      await justin.openMobileBottomTab('work');
      await justin.openMobileTasksRail();
      await justin.shouldSeeProposedGroupNames(withoutName('roles and ownership cleanup'));

      await justin.useDesktopViewport(DESKTOP);
      await justin.openReview();
      await justin.turnDownReviewProposal('shared language and refactor');
      await justin.shouldNotSeeReviewProposal('shared language and refactor');
      await justin.shouldSeeReviewProposalNames(['gun storage', 'projects and notes redesign']);
      await justin.goToAllProjects();
      await justin.shouldNotSeeProjectInAllProjectsProposed('shared language and refactor');
      await justin.shouldSeeProposedGroupNames(['gun storage', 'projects and notes redesign']);
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'after_turn_down',
      });
    }, 180_000);

    it('hides the Proposed section when there are no proposals on phone and desktop', async () => {
      await justin.createProject({ name: 'Garden' });

      await justin.useMobileViewport();
      await justin.openReview();
      await justin.shouldNotSeeReviewProposedSection();
      await justin.shouldNotSeeAllProjectsProposedGroup();
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'no_proposals',
      });
      await justin.openMobileBottomTab('work');
      await justin.openMobileTasksRail();
      await justin.shouldNotSeeProposedGroupOnRail();
      await justin.shouldSeeProjectOnRail('Garden');

      await justin.useDesktopViewport(DESKTOP);
      await justin.openReview();
      await justin.shouldNotSeeReviewProposedSection();
      await justin.shouldNotSeeAllProjectsProposedGroup();
      await justin.shouldNotSeeProposedGroupOnRail();
      await justin.shouldSeeProjectOnRail('Garden');
      await justin.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'no_proposals',
      });
    }, 180_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Proposed projects on Review — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs the Review proposal screen as browser-only', async () => {
      const justin = await ctx.createActor('justin-204-proposed-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: justin.email,
        userId: justin.userId,
        organizationId: justin.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeReviewProposal({ name: 'gun storage', proposedBy: 'Lane' })).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeReviewProposedSection()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openProposedGroup()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeProjectInAllProjectsProposed('gun storage')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeOpenProjectOption('gun storage')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
