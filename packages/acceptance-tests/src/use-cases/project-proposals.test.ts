import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { ForbiddenError } from '@yoink/acceptance-testing';

/**
 * Projects plan story 16 (#148): Bots propose projects.
 *
 * Bots POST proposed. Process mixes them with captures. People confirm
 * or turn down. Default list / rail / Review hide proposed and declined.
 * Bots list their own pending and declined proposals in one GET.
 */

const WALKTHROUGH_STORY = '148-bot-proposals';
const DESKTOP = { width: 1440, height: 900 } as const;

const laneFrom = async (
  alice: CoreActor,
  ctx: {
    createActorWithCredentials: (credentials: {
      email: string;
      userId: string;
      organizationId: string;
      token: string;
    }) => CoreActor;
  }
): Promise<CoreActor> => {
  const minted = await alice.mintAgent('Lane');
  return ctx.createActorWithCredentials({
    email: 'lane-bot@example.com',
    userId: minted.agent.userId,
    organizationId: alice.organizationId,
    token: minted.rawToken,
  });
};

usingDrivers(['http'] as const, (ctx) => {
  describe(`Bots propose projects API [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let lane: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-148-http@example.com');
      lane = await laneFrom(alice, ctx);
    });

    it('lets a bot propose and list pending plus declined in one call', async () => {
      const harbor = await lane.createProject({
        name: 'Harbor shed',
        status: 'proposed',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      });
      expect(harbor.status).toBe('proposed');
      expect(harbor.reason).toBe('Dock needs work');
      expect(harbor.suggestedNextAction).toBe('Call the mill');

      const dock = await lane.createProject({ name: 'Dock', status: 'proposed' });
      await alice.declineProjectProposal(dock.id);

      const patMinted = await alice.mintAgent('Pat');
      const pat = ctx.createActorWithCredentials({
        email: 'pat-bot@example.com',
        userId: patMinted.agent.userId,
        organizationId: alice.organizationId,
        token: patMinted.rawToken,
      });
      await pat.createProject({ name: 'Pat proposal', status: 'proposed' });
      await alice.createProject({ name: 'Garden' });

      const working = await lane.listProjects();
      expect(working.map((project) => project.name)).toEqual(['Garden']);

      const own = await lane.listProjects({ status: 'proposed,declined' });
      expect(own.map((project) => project.name).sort()).toEqual(['Dock', 'Harbor shed']);
      expect(own.every((project) => project.createdById === lane.userId)).toBe(true);

      const allProposed = await alice.listProjects({ status: 'proposed,declined' });
      expect(allProposed.map((project) => project.name).sort()).toEqual([
        'Dock',
        'Harbor shed',
        'Pat proposal',
      ]);

      const laneOnly = await alice.listProjects({
        status: 'proposed,declined',
        createdById: lane.userId,
      });
      expect(laneOnly.map((project) => project.name).sort()).toEqual(['Dock', 'Harbor shed']);
    });

    it('lets a person confirm the suggested next action and refuses bot confirm', async () => {
      const proposed = await lane.createProject({
        name: 'Harbor shed',
        status: 'proposed',
        suggestedNextAction: 'Call the mill',
      });
      const confirmed = await alice.confirmProjectProposal(proposed.id, { status: 'active' });
      expect(confirmed.project.status).toBe('active');
      expect(confirmed.task?.title).toBe('Call the mill');
      expect(confirmed.project.nextActionTaskId).toBe(confirmed.task?.id);

      const other = await lane.createProject({ name: 'Other shed', status: 'proposed' });
      await expect(lane.confirmProjectProposal(other.id)).rejects.toThrow(ForbiddenError);
      await expect(alice.createProject({ name: 'Nope', status: 'proposed' })).rejects.toThrow(
        ForbiddenError
      );
      await expect(lane.createProject({ name: 'Bot garden' })).rejects.toThrow(ForbiddenError);
    });

    it('frees a declined name and refuses restore when it is taken', async () => {
      const proposed = await lane.createProject({ name: 'Harbor shed', status: 'proposed' });
      const declined = await alice.declineProjectProposal(proposed.id);
      expect(declined.status).toBe('declined');

      const reuse = await alice.createProject({ name: 'Harbor shed' });
      expect(reuse.status).toBe('active');

      await expect(alice.restoreProjectProposal(proposed.id)).rejects.toThrow(
        /already exists|DUPLICATE|duplicate/i
      );
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Bots propose projects [${ctx.driverName}]`, () => {
    let alice: BrowserActor;
    let lane: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-148-process@example.com');
      lane = await laneFrom(alice, ctx);
    });

    it('shows a proposal on Process, mixed with captures, and confirms it', async () => {
      const proposed = await lane.createProject({
        name: 'Harbor shed',
        objective: 'Keep the dock usable',
        status: 'proposed',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      });
      await alice.createCapture({ content: 'Paint the door' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessReady();
      await alice.shouldSeeProcessProposal({
        name: 'Harbor shed',
        proposedBy: 'Lane',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      });
      await alice.shouldSeeProcessLeft(2);
      await alice.shouldSeeProcessBadge(2);

      await alice.openProcessProposalConfirm();
      const confirmed = await alice.confirmProcessProposal();
      expect(confirmed.project.id).toBe(proposed.id);
      expect(confirmed.project.status).toBe('active');
      expect(confirmed.task?.title).toBe('Call the mill');

      await alice.shouldSeeProcessCurrent('Paint the door');
      await alice.shouldSeeProcessLeft(1);

      await alice.goToProject(proposed.id);
      await alice.expandProjectHistory();
      await alice.shouldSeeHistoryEntry({
        kind: 'ProjectCreated',
        actor: 'Lane',
        text: 'proposed this project',
      });
      await alice.shouldSeeHistoryEntry({
        kind: 'ProjectStatusChanged',
        actor: 'Alice',
        text: 'confirmed it as Active',
      });

      await alice.goToAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Harbor shed', status: 'active' });
    }, 90_000);

    it('turns a proposal down and Undo restores it', async () => {
      await lane.createProject({
        name: 'Harbor shed',
        status: 'proposed',
        reason: 'Dock needs work',
      });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessProposal({
        name: 'Harbor shed',
        proposedBy: 'Lane',
        reason: 'Dock needs work',
      });
      await alice.turnDownProcessProposal();
      await alice.shouldSeeProcessEmpty();
      await alice.shouldSeeUndoToast('Turned down');
      await alice.undoFromToast('Turned down');
      await alice.shouldSeeToast('Alice restored it');
      await alice.shouldSeeProcessProposal({
        name: 'Harbor shed',
        proposedBy: 'Lane',
      });
    }, 60_000);

    it('hides proposals from the default list and rail', async () => {
      await lane.createProject({ name: 'Harbor shed', status: 'proposed' });
      const garden = await alice.createProject({ name: 'Garden' });

      const working = await alice.listProjects();
      expect(working.map((project) => project.name)).toEqual(['Garden']);

      await alice.useDesktopViewport(DESKTOP);
      await alice.goToAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Garden', status: 'active' });
      await alice.shouldSeeProjectOnRail(garden.name);
    }, 60_000);

    it('saves phone walkthrough shots', async () => {
      const proposed = await lane.createProject({
        name: 'Harbor shed',
        objective: 'Keep the dock usable',
        status: 'proposed',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      });
      await alice.createCapture({ content: 'Paint the door' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessProposal({
        name: 'Harbor shed',
        proposedBy: 'Lane',
        reason: 'Dock needs work',
      });
      await alice.shouldSeeProcessLeft(2);
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_proposal_card',
      });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_mixed_count',
      });

      await alice.openProcessProposalConfirm();
      await alice.confirmProcessProposal();
      await alice.goToAllProjects();
      await alice.shouldSeeProjectOnAllProjects({ name: 'Harbor shed', status: 'active' });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_confirmed_in_review',
      });

      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessCurrent('Paint the door');
      await alice.trashProcessCurrent();
      await alice.shouldSeeProcessEmpty();

      const second = await lane.createProject({
        name: 'Kitchen wall',
        status: 'proposed',
      });
      await alice.openMobileBottomTab('capture');
      await alice.openMobileBottomTab('process');
      await alice.shouldSeeProcessProposal({ name: 'Kitchen wall', proposedBy: 'Lane' });
      await alice.turnDownProcessProposal();
      await alice.shouldSeeUndoToast('Turned down');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_turned_down',
        includeToasts: true,
      });
      await alice.shouldSeeProcessEmpty();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_empty',
      });

      await alice.restoreProjectProposal(second.id);
      await alice.goToProject(second.id);
      await alice.shouldSeeProposalBanner({ proposedBy: 'Lane' });
      await alice.expandProjectHistory();
      await alice.shouldSeeHistoryEntry({
        kind: 'ProjectCreated',
        actor: 'Lane',
        text: 'proposed this project',
      });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'project_timeline_proposal',
      });
      void proposed;
    }, 120_000);

    it('saves desktop walkthrough shots', async () => {
      await lane.createProject({
        name: 'Harbor shed',
        objective: 'Keep the dock usable',
        status: 'proposed',
        reason: 'Dock needs work',
        suggestedNextAction: 'Call the mill',
      });
      await alice.createCapture({ content: 'Paint the door' });

      await alice.useDesktopViewport(DESKTOP);
      await alice.openProcess();
      await alice.shouldSeeProcessProposal({
        name: 'Harbor shed',
        proposedBy: 'Lane',
        reason: 'Dock needs work',
      });
      await alice.shouldSeeProcessLeft(2);
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_proposal_card',
      });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_mixed_count',
      });

      await alice.openProcessProposalConfirm();
      await alice.confirmProcessProposal();
      await alice.goToAllProjects();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_confirmed_in_review',
      });

      await alice.openProcess();
      await alice.shouldSeeProcessCurrent('Paint the door');
      await alice.trashProcessCurrent();
      await alice.shouldSeeProcessEmpty();

      await lane.createProject({ name: 'Kitchen wall', status: 'proposed' });
      await alice.openProcess();
      await alice.shouldSeeProcessProposal({ name: 'Kitchen wall', proposedBy: 'Lane' });
      await alice.turnDownProcessProposal();
      await alice.shouldSeeUndoToast('Turned down');
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'proposal_turned_down',
        includeToasts: true,
      });
      await alice.shouldSeeProcessEmpty();
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'process_empty',
      });

      const leftover = await lane.createProject({
        name: 'Garden wall',
        status: 'proposed',
      });
      await alice.goToProject(leftover.id);
      await alice.expandProjectHistory();
      await alice.shouldSeeHistoryEntry({
        kind: 'ProjectCreated',
        actor: 'Lane',
        text: 'proposed this project',
      });
      await alice.saveWalkthroughScreenshot({
        story: WALKTHROUGH_STORY,
        step: 'project_timeline_proposal',
      });
    }, 120_000);
  });
});
