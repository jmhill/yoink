import { fileURLToPath } from 'node:url';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Admin } from '../../dsl/index.js';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from './page-objects.js';
import { saveWalkthroughPng, type WalkthroughViewport } from './walkthrough-screenshots.js';

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
  let walkthroughViewport: WalkthroughViewport = 'desktop';

  const browserPage = (): Page => {
    if (!page) {
      throw new Error('Admin panel page is not open. Call openOrganization first.');
    }
    return page;
  };

  const ensureLoggedIn = async (): Promise<Page> => {
    if (page) {
      return page;
    }
    const browser = deps.getBrowser();
    if (!browser) {
      throw new Error('Driver not initialized. Call setup() first.');
    }
    context = await browser.newContext({
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
    createOrganization: (name) => deps.http.createOrganization(name),
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
      await adminPage.goto(`/admin/organizations/${organizationId}`);
      await expect(adminPage.getByRole('heading', { name: 'Users' })).toBeVisible();
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

    async saveWalkthroughScreenshot(input: { story: string; step: string }): Promise<void> {
      const adminPage = browserPage();
      await adminPage.mouse.move(0, 0);
      await saveWalkthroughPng({
        page: adminPage,
        fromDir: fileURLToPath(new URL('.', import.meta.url)),
        story: input.story,
        viewport: walkthroughViewport,
        step: input.step,
      });
    },
  };
};
