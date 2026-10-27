import { fileURLToPath } from 'node:url';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  CREATE_OWNER_INVITE_LABEL,
  MAKE_NEW_LINK_LABEL,
  NO_OWNER_BADGE,
  OWNER_EMAIL_LABEL,
  WAITING_FOR_OWNER_BADGE,
  ownerAssignedToast,
  ownerInviteCreatedMessage,
  ownerInviteExpired,
} from '@yoink/api-contracts';
import type { Admin } from '../../dsl/index.js';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from './page-objects.js';
import { SignupPage } from './page-objects.js';
import { openTestBrowserContext } from './test-browser-context.js';
import {
  OPEN_DIALOG_CONTENT,
  saveWalkthroughPng,
  waitForSettledOpenDialog,
  type WalkthroughViewport,
} from './walkthrough-screenshots.js';

export type PlaywrightAdminDependencies = {
  http: Admin;
  password: string;
  baseUrl: string;
  getBrowser: () => Browser | null;
};

const memberRow = (page: Page, userId: string) => page.locator(`[data-user-id="${userId}"]`);

export const createPlaywrightAdmin = (deps: PlaywrightAdminDependencies): Admin => {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let unsignedContext: BrowserContext | null = null;
  let unsignedPage: Page | null = null;
  let walkthroughViewport: WalkthroughViewport = 'desktop';

  const browserPage = (): Page => {
    if (!page) {
      throw new Error('Admin panel page is not open. Call openOrganization first.');
    }
    return page;
  };

  const clearScreenshotFocus = async (adminPage: Page): Promise<void> => {
    await adminPage.locator('[data-screenshot-focus]').evaluateAll((els) => {
      for (const el of els) {
        el.removeAttribute('data-screenshot-focus');
      }
    });
  };

  const restoreHiddenOrganizationRows = async (adminPage: Page): Promise<void> => {
    await adminPage.locator('[data-screenshot-hidden-row]').evaluateAll((els) => {
      for (const el of els) {
        el.removeAttribute('data-screenshot-hidden-row');
        el.removeAttribute('hidden');
      }
    });
  };

  const ensureLoggedIn = async (): Promise<Page> => {
    if (page) {
      return page;
    }
    const browser = deps.getBrowser();
    if (!browser) {
      throw new Error('Driver not initialized. Call setup() first.');
    }
    context = await openTestBrowserContext(browser, {
      baseURL: deps.baseUrl,
      reducedMotion: 'reduce',
    });
    page = await context.newPage();
    await page.goto('/admin/login');
    await page.getByLabel('Admin Password').fill(deps.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
    return page;
  };

  return {
    login: () => deps.http.login(),
    logout: () => deps.http.logout(),
    isLoggedIn: () => deps.http.isLoggedIn(),
    createOrganization: (name, options) => deps.http.createOrganization(name, options),
    issueOwnerInvitation: (organizationId, email) =>
      deps.http.issueOwnerInvitation(organizationId, email),
    getOwnerInvitation: (organizationId) => deps.http.getOwnerInvitation(organizationId),
    getOwnerInvitationDetails: (organizationId) =>
      deps.http.getOwnerInvitationDetails(organizationId),
    createOwnerlessWorkspace: (name, options) =>
      deps.http.createOwnerlessWorkspace(name, options),
    expireInvitation: (code) => deps.http.expireInvitation(code),
    assignOwnerKeepingInvite: (organizationId, userId) =>
      deps.http.assignOwnerKeepingInvite(organizationId, userId),
    listOrganizations: () => deps.http.listOrganizations(),
    getOrganization: (id) => deps.http.getOrganization(id),
    renameOrganization: (id, newName) => deps.http.renameOrganization(id, newName),
    createUser: (organizationId, email, options) =>
      deps.http.createUser(organizationId, email, options),
    listUsers: (organizationId) => deps.http.listUsers(organizationId),
    getUser: (id) => deps.http.getUser(id),
    setOrganizationOwner: (organizationId, userId) =>
      deps.http.setOrganizationOwner(organizationId, userId),
    changeMemberRole: (organizationId, userId, role) =>
      deps.http.changeMemberRole(organizationId, userId, role),
    updateUser: (id, options) => deps.http.updateUser(id, options),
    updateProjectCreatedAt: (id, createdAt) => deps.http.updateProjectCreatedAt(id, createdAt),
    createToken: (organizationId, userId, name) =>
      deps.http.createToken(organizationId, userId, name),
    listTokens: (organizationId, userId) => deps.http.listTokens(organizationId, userId),
    revokeToken: (tokenId) => deps.http.revokeToken(tokenId),
    createInvitation: (organizationId, input) => deps.http.createInvitation(organizationId, input),

    async openOrganization(organizationId: string): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await restoreHiddenOrganizationRows(adminPage);
      await adminPage.goto(`/admin/organizations/${organizationId}`);
      await expect(
        adminPage.getByText('Each workspace has at most one owner')
      ).toBeVisible();
    },

    async openOrganizationsList(): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await restoreHiddenOrganizationRows(adminPage);
      const heading = adminPage.getByRole('heading', { name: 'Organizations' });
      const breadcrumb = adminPage.getByRole('link', { name: 'Organizations' });
      await expect(breadcrumb.or(heading).first()).toBeVisible();
      if (await breadcrumb.isVisible()) {
        await breadcrumb.click();
        await expect(heading).toBeVisible();
        return;
      }
      await expect(heading).toBeVisible();
      await adminPage.goto('/admin');
      await expect(heading).toBeVisible();
    },

    async frameOrganizationRow(orgId: string): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await restoreHiddenOrganizationRows(adminPage);
      const row = adminPage.locator(`[data-organization-id="${orgId}"]`);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
      await clearScreenshotFocus(adminPage);
      await row.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
      await adminPage.locator('tr[data-organization-id]').evaluateAll((rows, id) => {
        for (const other of rows) {
          if (other.getAttribute('data-organization-id') !== id) {
            other.setAttribute('data-screenshot-hidden-row', '');
            other.setAttribute('hidden', '');
          }
        }
      }, orgId);
    },

    async frameOwnerSection(): Promise<void> {
      const adminPage = browserPage();
      const section = adminPage.locator('[data-owner-section]');
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();
      await clearScreenshotFocus(adminPage);
      await section.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
    },

    async frameOwnerAndUsers(): Promise<void> {
      const adminPage = browserPage();
      const panel = adminPage.locator('[data-owner-users-panel]');
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible();
      await clearScreenshotFocus(adminPage);
      await panel.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
    },

    async shouldSeeOwnerBadge(
      orgId: string,
      kind: 'no-owner' | 'waiting-for-owner'
    ): Promise<void> {
      const adminPage = await ensureLoggedIn();
      const badge = adminPage.locator(
        `[data-organization-id="${orgId}"] [data-owner-badge="${kind}"]`
      );
      await expect(badge).toHaveText(kind === 'no-owner' ? NO_OWNER_BADGE : WAITING_FOR_OWNER_BADGE);
    },

    async shouldSeeNoOwnerBadge(orgId: string): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await expect(adminPage.locator(`[data-organization-id="${orgId}"]`)).toBeVisible();
      await expect(
        adminPage.locator(`[data-organization-id="${orgId}"] [data-owner-badge]`)
      ).toHaveCount(0);
    },

    async clickOwnerBadge(orgId: string): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await restoreHiddenOrganizationRows(adminPage);
      await adminPage.locator(`[data-organization-id="${orgId}"] [data-owner-badge]`).click();
      await expect(adminPage.locator('#owner')).toBeVisible();
    },

    async shouldSeeExpiredOwnerInvite(email: string): Promise<void> {
      const line = browserPage().locator('[data-owner-invite-expired]');
      await expect(line).toBeVisible();
      const expectedPrefix = ownerInviteExpired(email, '\u0000').split('\u0000')[0] ?? '';
      await expect(line).toHaveText(new RegExp(`^${expectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    },

    async shouldSeeOwnerInviteEmailPrefilled(email: string): Promise<void> {
      await expect(browserPage().locator('#create-owner-invite-email')).toHaveValue(email);
    },

    async replaceExpiredOwnerInviteEmail(email: string): Promise<void> {
      const adminPage = browserPage();
      const field = adminPage.locator('#create-owner-invite-email');
      await field.fill('');
      await expect(field).toHaveValue('');
      await field.fill(email);
      await adminPage.locator('[data-action="create-owner-invite"]').click();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      const pending = adminPage.locator('[data-owner-invite-pending]');
      await expect(dialog.or(pending).first()).toBeVisible();
    },

    async shouldSeeNoCreateOwnerInvite(): Promise<void> {
      await expect(browserPage().locator('[data-action="create-owner-invite"]')).toHaveCount(0);
    },

    async makeOwner(userId: string): Promise<void> {
      const adminPage = browserPage();
      await memberRow(adminPage, userId).locator('[data-action="make-owner"]').click();
      await expect(memberRow(adminPage, userId)).toHaveAttribute('data-role', 'owner');
    },

    async makeAdmin(userId: string): Promise<void> {
      const adminPage = browserPage();
      await memberRow(adminPage, userId).locator('[data-action="toggle-admin"]').click();
    },

    async shouldSeeMemberRole(userId: string, role: string): Promise<void> {
      await expect(memberRow(browserPage(), userId)).toHaveAttribute('data-role', role);
    },

    async shouldSeeMemberError(userId: string, pattern: string | RegExp): Promise<void> {
      await expect(browserPage().locator(`[data-member-error="${userId}"]`)).toHaveText(pattern);
    },

    async shouldNotSeeMakeAdmin(userId: string): Promise<void> {
      await expect(memberRow(browserPage(), userId).locator('[data-action="toggle-admin"]')).toHaveCount(
        0
      );
    },

    async shouldNotSeeMakeOwner(userId: string): Promise<void> {
      await expect(memberRow(browserPage(), userId).locator('[data-action="make-owner"]')).toHaveCount(
        0
      );
    },

    async shouldSeeMakeOwner(userId: string): Promise<void> {
      await expect(memberRow(browserPage(), userId).locator('[data-action="make-owner"]')).toBeVisible();
    },

    async shouldNotSeeNamedUser(name: string): Promise<void> {
      await expect(browserPage().getByText(name, { exact: true })).toHaveCount(0);
    },

    async openCreateUser(): Promise<void> {
      const adminPage = browserPage();
      await adminPage.locator('[data-action="create-user"]').click();
      await expect(adminPage.getByRole('heading', { name: 'Create User' })).toBeVisible();
      await waitForSettledOpenDialog({ page: adminPage });
    },

    async submitCreateUser(input: {
      email: string;
      name?: string;
      kind: 'human' | 'agent';
      role: 'member' | 'admin';
    }): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByLabel('Email').fill(input.email);
      if (input.name !== undefined) {
        await dialog.getByLabel('Name (optional)').fill(input.name);
      }
      await dialog.getByLabel('Kind').selectOption(input.kind);
      await dialog.getByLabel('Role').selectOption(input.role);
      await dialog.getByRole('button', { name: 'Create User' }).click();
    },

    async shouldSeeCreateUserError(pattern: string | RegExp): Promise<void> {
      const error = browserPage().locator('[data-create-user-error]');
      await expect(error).toHaveText(pattern);
      await error.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
      await error.scrollIntoViewIfNeeded();
    },

    async revealMember(userId: string): Promise<void> {
      await memberRow(browserPage(), userId).scrollIntoViewIfNeeded();
    },

    async frameMember(userId: string): Promise<void> {
      const row = memberRow(browserPage(), userId);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
      await browserPage().locator('[data-screenshot-focus]').evaluateAll((els) => {
        for (const el of els) {
          el.removeAttribute('data-screenshot-focus');
        }
      });
      await row.evaluate((el) => {
        el.setAttribute('data-screenshot-focus', '');
      });
    },

    async useMobileViewport(): Promise<void> {
      walkthroughViewport = 'phone';
      const adminPage = await ensureLoggedIn();
      await adminPage.setViewportSize(MOBILE_VIEWPORT);
    },

    async useDesktopViewport(): Promise<void> {
      walkthroughViewport = 'desktop';
      const adminPage = await ensureLoggedIn();
      await adminPage.setViewportSize(DESKTOP_VIEWPORT);
    },

    async saveWalkthroughScreenshot(input: {
      story: string;
      step: string;
      includeToasts?: boolean;
    }): Promise<void> {
      const adminPage = browserPage();
      const openDialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      if (await openDialog.isVisible().catch(() => false)) {
        await waitForSettledOpenDialog({ page: adminPage });
      }
      if (input.includeToasts) {
        await expect(adminPage.locator('[data-sonner-toast]').first()).toBeVisible();
      }
      await adminPage.mouse.move(0, 0);
      await saveWalkthroughPng({
        page: adminPage,
        fromDir: fileURLToPath(new URL('.', import.meta.url)),
        story: input.story,
        viewport: walkthroughViewport,
        step: input.step,
        includeToasts: input.includeToasts,
      });
    },

    async openCreateWorkspace(): Promise<void> {
      const adminPage = await ensureLoggedIn();
      await adminPage.goto('/admin');
      await expect(adminPage.getByRole('heading', { name: 'Organizations' })).toBeVisible();
      await adminPage.locator('[data-action="create-workspace"]').click();
      await expect(adminPage.getByRole('heading', { name: 'Create Organization' })).toBeVisible();
      await waitForSettledOpenDialog({ page: adminPage });
    },

    async fillCreateWorkspace(input: { name: string; ownerEmail: string }): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByLabel('Organization Name').fill(input.name);
      await dialog.getByLabel(OWNER_EMAIL_LABEL).fill(input.ownerEmail);
    },

    async submitCreateWorkspace(): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByRole('button', { name: 'Create' }).click();
    },

    async shouldSeeOwnerAssignedToast(name: string, workspace: string): Promise<void> {
      await expect(browserPage().locator('[data-sonner-toast]').first()).toContainText(
        ownerAssignedToast(name, workspace)
      );
    },

    async shouldSeeOwnerInviteCreated(email: string): Promise<void> {
      await expect(browserPage().getByText(ownerInviteCreatedMessage(email))).toBeVisible();
    },

    async copyOwnerInviteLink(): Promise<void> {
      const adminPage = browserPage();
      await adminPage.locator('[data-action="copy-owner-link"]').first().click();
      await expect(adminPage.locator('[data-sonner-toast]').first()).toBeVisible();
    },

    async closeOwnerInviteDialog(): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByRole('button', { name: 'Done' }).click();
      await expect(dialog).toHaveCount(0);
    },

    async shouldSeeOwner(name: string): Promise<void> {
      await expect(browserPage().locator('[data-owner-name]')).toHaveText(`Owner: ${name}`);
    },

    async shouldSeePendingOwnerInvite(email: string): Promise<void> {
      await expect(browserPage().locator('[data-owner-invite-pending]')).toContainText(email);
    },

    async clickNewOwnerLink(): Promise<void> {
      const adminPage = browserPage();
      await adminPage.locator('[data-action="new-owner-link"]').click();
      await waitForSettledOpenDialog({ page: adminPage });
    },

    async confirmNewOwnerLink(): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByRole('button', { name: MAKE_NEW_LINK_LABEL }).click();
    },

    async clickUseDifferentEmail(): Promise<void> {
      const adminPage = browserPage();
      await adminPage.locator('[data-action="use-different-owner-email"]').click();
      await waitForSettledOpenDialog({ page: adminPage });
    },

    async submitDifferentOwnerEmail(email: string): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByLabel(OWNER_EMAIL_LABEL).fill(email);
      await dialog.getByRole('button', { name: CREATE_OWNER_INVITE_LABEL }).click();
    },

    async clickCreateOwnerInvite(): Promise<void> {
      const adminPage = browserPage();
      await adminPage.locator('[data-action="create-owner-invite"]').click();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      const pending = adminPage.locator('[data-owner-invite-pending]');
      await expect(dialog.or(pending).first()).toBeVisible();
    },

    async submitCreateOwnerInvite(email: string): Promise<void> {
      const adminPage = browserPage();
      const dialog = adminPage.locator(OPEN_DIALOG_CONTENT);
      await dialog.getByLabel(OWNER_EMAIL_LABEL).fill(email);
      await dialog.locator('[data-action="submit-create-owner-invite"]').click();
    },

    async openUnsignedSignup(code: string): Promise<void> {
      const browser = deps.getBrowser();
      if (!browser) {
        throw new Error('Driver not initialized. Call setup() first.');
      }
      if (!unsignedContext) {
        unsignedContext = await openTestBrowserContext(browser, {
          baseURL: deps.baseUrl,
          reducedMotion: 'reduce',
        });
        unsignedPage = await unsignedContext.newPage();
      }
      const webPage = unsignedPage;
      if (!webPage) {
        throw new Error('Unsigned web page is not open.');
      }
      if (walkthroughViewport === 'phone') {
        await webPage.setViewportSize(MOBILE_VIEWPORT);
      } else {
        await webPage.setViewportSize(DESKTOP_VIEWPORT);
      }
      const signupPage = new SignupPage(webPage);
      await signupPage.goto(code);
    },

    async fillUnsignedSignupEmail(email: string): Promise<void> {
      if (!unsignedPage) {
        throw new Error('Unsigned web page is not open. Call openUnsignedSignup first.');
      }
      const signupPage = new SignupPage(unsignedPage);
      await signupPage.waitForDetailsStep();
      await signupPage.enterEmail(email);
    },

    async submitUnsignedSignup(): Promise<void> {
      if (!unsignedPage) {
        throw new Error('Unsigned web page is not open. Call openUnsignedSignup first.');
      }
      const signupPage = new SignupPage(unsignedPage);
      await signupPage.clickCreateAccount();
    },

    async shouldSeeUnsignedSignupText(text: string): Promise<void> {
      if (!unsignedPage) {
        throw new Error('Unsigned web page is not open. Call openUnsignedSignup first.');
      }
      await expect(unsignedPage.getByText(text)).toBeVisible();
    },

    async saveUnsignedWalkthroughScreenshot(input: {
      story: string;
      step: string;
    }): Promise<void> {
      if (!unsignedPage) {
        throw new Error('Unsigned web page is not open. Call openUnsignedSignup first.');
      }
      if (walkthroughViewport === 'phone') {
        await unsignedPage.setViewportSize(MOBILE_VIEWPORT);
      } else {
        await unsignedPage.setViewportSize(DESKTOP_VIEWPORT);
      }
      await unsignedPage.mouse.move(0, 0);
      await saveWalkthroughPng({
        page: unsignedPage,
        fromDir: fileURLToPath(new URL('.', import.meta.url)),
        story: input.story,
        viewport: walkthroughViewport,
        step: input.step,
      });
    },
  };
};
