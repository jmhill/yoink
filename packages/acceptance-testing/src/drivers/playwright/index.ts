import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from '@playwright/test';
import type { Driver, DriverConfig } from '../types.js';
import type { Actor, AnonymousActor } from '../../dsl/index.js';
import { createHttpClient } from '../http/http-client.js';
import { createHttpAdmin } from '../http/admin.js';
import { createHttpHealth } from '../http/health.js';
import { createPlaywrightActor, createPlaywrightAnonymousActor } from './actor.js';
import { SignupPage, VirtualAuthenticator } from './page-objects.js';

/**
 * Creates a Playwright driver that implements DSL interfaces via browser automation.
 * 
 * The Playwright driver:
 * - Uses real passkey signup flow via the browser UI (with CDP virtual authenticator)
 * - Uses HTTP for Admin operations (admin UI is separate)
 * - Uses HTTP for Health operations (no UI for health)
 * - Each actor is created via fresh signup with unique invitation code
 */
export const createPlaywrightDriver = (config: DriverConfig): Driver => {
  // HTTP client for admin/health operations (no browser UI for these)
  const httpClient = createHttpClient(config.baseUrl);
  const admin = createHttpAdmin(httpClient, config.adminPassword);
  const health = createHttpHealth(httpClient);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  // Track virtual authenticators per page for cleanup
  const pageAuthenticators = new Map<Page, { cdpSession: CDPSession; authenticator: VirtualAuthenticator }>();

  /**
   * Set up a virtual authenticator for a page.
   * This enables passkey testing via CDP WebAuthn API.
   */
  const setupVirtualAuthenticator = async (page: Page): Promise<VirtualAuthenticator> => {
    const cdpSession = await page.context().newCDPSession(page);
    const authenticator = new VirtualAuthenticator(cdpSession);
    await authenticator.setup();
    pageAuthenticators.set(page, { cdpSession, authenticator });
    return authenticator;
  };

  return {
    name: 'playwright',
    capabilities: ['playwright'],

    admin,
    health,

    async createActor(email: string): Promise<Actor> {
      if (!context) {
        throw new Error('Driver not initialized. Call setup() first.');
      }

      // Create an isolated tenant for this actor (via HTTP admin API)
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orgName = `test-org-${suffix}`;
      // Make email unique per actor to satisfy the global email uniqueness constraint
      const [localPart, domain] = email.split('@');
      const uniqueEmail = `${localPart}+${suffix}@${domain}`;

      await admin.login();
      let invitationCode: string;
      let orgId: string;
      try {
        const org = await admin.createOrganization(orgName);
        orgId = org.id;
        const invitation = await admin.createInvitation(org.id, { role: 'admin' });
        invitationCode = invitation.code;
      } finally {
        await admin.logout();
      }

      // Create a new page for this actor
      const page = await context.newPage();
      
      // Set up virtual authenticator BEFORE navigating to signup
      // This enables the browser's WebAuthn API to use the virtual authenticator
      await setupVirtualAuthenticator(page);
      
      // Perform signup via the UI with the virtual authenticator
      const signupPage = new SignupPage(page);
      await signupPage.goto(invitationCode);
      
      // The code is pre-filled from URL, click continue to proceed to email step
      await signupPage.clickContinue();
      
      // Fill email and device name
      await signupPage.enterEmail(uniqueEmail);
      await signupPage.enterDeviceName('Test Device');
      
      // Click create account - this triggers WebAuthn registration
      // The virtual authenticator will automatically handle the credential creation
      await signupPage.clickCreateAccount();
      
      // Wait for signup to complete and redirect to inbox
      await signupPage.waitForSuccess();
      
      // Click "Go to Inbox" to continue
      await page.getByRole('link', { name: 'Go to Inbox' }).click();
      await page.waitForURL('/');

      // Get user ID from session - we need to call the API
      // The session cookie is already set from signup
      const sessionResponse = await page.evaluate(async () => {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Failed to get session: ${response.status}`);
        }
        return response.json();
      });

      return createPlaywrightActor(page, {
        email: uniqueEmail,
        userId: (sessionResponse as { user: { id: string } }).user.id,
        organizationId: orgId,
      });
    },

    createAnonymousActor(): AnonymousActor {
      if (!context) {
        throw new Error('Driver not initialized. Call setup() first.');
      }

      // Create a page without a token configured
      // We need to return synchronously, so we'll create the page lazily
      let page: Page | null = null;
      
      const getPage = async (): Promise<Page> => {
        if (!page) {
          page = await context!.newPage();
        }
        return page;
      };

      return {
        async createCapture(input) {
          const p = await getPage();
          return createPlaywrightAnonymousActor(p).createCapture(input);
        },
        async listCaptures() {
          const p = await getPage();
          return createPlaywrightAnonymousActor(p).listCaptures();
        },
        async getCapture(id) {
          const p = await getPage();
          return createPlaywrightAnonymousActor(p).getCapture(id);
        },
      };
    },

    async setup(): Promise<void> {
      // Verify connectivity via HTTP first
      await health.check();

      // Launch browser
      browser = await chromium.launch({
        headless: true,
      });
      
      // Create a browser context (isolated session)
      context = await browser.newContext({
        baseURL: config.baseUrl,
      });
    },

    async teardown(): Promise<void> {
      // Clean up virtual authenticators
      for (const [page, { authenticator, cdpSession }] of pageAuthenticators) {
        try {
          await authenticator.teardown();
          await cdpSession.detach();
        } catch {
          // Ignore errors during cleanup (page may already be closed)
        }
        pageAuthenticators.delete(page);
      }

      if (context) {
        await context.close();
        context = null;
      }
      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
};
