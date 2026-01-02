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
 * - Each actor gets its own browser context for session cookie isolation
 */
export const createPlaywrightDriver = (config: DriverConfig): Driver => {
  // HTTP client for admin/health operations (no browser UI for these)
  const httpClient = createHttpClient(config.baseUrl);
  const admin = createHttpAdmin(httpClient, config.adminPassword);
  const health = createHttpHealth(httpClient);

  let browser: Browser | null = null;
  
  // Each actor gets its own browser context for cookie isolation
  const actorContexts: BrowserContext[] = [];

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
      if (!browser) {
        throw new Error('Driver not initialized. Call setup() first.');
      }

      const debug = (msg: string) => {
        if (process.env.DEBUG_PLAYWRIGHT) {
          console.log(`[Playwright] ${msg}`);
        }
      };

      // Create an isolated browser context for this actor (cookie isolation)
      const context = await browser.newContext({
        baseURL: config.baseUrl,
      });
      actorContexts.push(context);
      debug('Created isolated browser context');

      // Create an isolated tenant for this actor (via HTTP admin API)
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orgName = `test-org-${suffix}`;
      // Make email unique per actor to satisfy the global email uniqueness constraint
      const [localPart, domain] = email.split('@');
      const uniqueEmail = `${localPart}+${suffix}@${domain}`;

      debug(`Creating actor with email: ${uniqueEmail}`);

      // Use admin to create org and invitation.
      // NOTE: Tests are expected to call ctx.admin.login() in beforeAll.
      // We do NOT log in/out here because it would interfere with the test's admin session.
      const org = await admin.createOrganization(orgName);
      const orgId = org.id;
      debug(`Created org: ${orgId}`);

      const invitation = await admin.createInvitation(org.id, { role: 'admin' });
      const invitationCode = invitation.code;
      debug(`Created invitation: ${invitationCode}`);

      // Create a new page for this actor in their isolated context
      const page = await context.newPage();
      debug('Created new page');
      
      // Set up virtual authenticator BEFORE navigating to signup
      // This enables the browser's WebAuthn API to use the virtual authenticator
      await setupVirtualAuthenticator(page);
      debug('Virtual authenticator set up');
      
      // Perform signup via the UI with the virtual authenticator
      const signupPage = new SignupPage(page);
      await signupPage.goto(invitationCode);
      debug(`Navigated to signup with code: ${invitationCode}`);
      
      // Wait for the page to auto-validate the code and reach the details step
      // (navigating with ?code=XXX triggers auto-validation)
      debug('Waiting for details step...');
      await signupPage.waitForDetailsStep();
      debug('Reached details step');
      
      // Check for errors during validation
      if (await signupPage.hasError()) {
        const error = await signupPage.getErrorMessage();
        throw new Error(`Signup validation failed: ${error}`);
      }
      
      // Fill email and device name
      await signupPage.enterEmail(uniqueEmail);
      debug('Filled email');
      await signupPage.enterDeviceName('Test Device');
      debug('Filled device name');
      
      // Click create account - this triggers WebAuthn registration
      // The virtual authenticator will automatically handle the credential creation
      debug('Clicking create account...');
      await signupPage.clickCreateAccount();
      debug('Clicked create account, waiting for WebAuthn...');
      
      // Wait for signup to complete - check for either success or error
      try {
        // Race between success and error states
        const result = await Promise.race([
          signupPage.waitForSuccess().then(() => 'success' as const),
          page.locator('.bg-destructive\\/10').waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
        ]);
        
        if (result === 'error') {
          const errorMsg = await signupPage.getErrorMessage();
          debug(`Signup failed with error: ${errorMsg}`);
          throw new Error(`Signup failed: ${errorMsg}`);
        }
      } catch (e) {
        // If both fail, log page state for debugging
        debug(`Timeout waiting for signup result, current URL: ${page.url()}`);
        const content = await page.content();
        debug(`Page content (first 1000 chars): ${content.substring(0, 1000)}`);
        throw e;
      }
      debug('Signup success!');
      
      // Wait for auto-redirect to home page (happens after 2 seconds)
      await signupPage.waitForRedirect();
      debug('Redirected to home');

      // Get user ID from session - we need to call the API  
      // The session cookie is already set from signup
      
      // Set a timeout for the page.evaluate call
      const sessionPromise = page.evaluate(async () => {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to get session: ${response.status} - ${text}`);
        }
        return response.json();
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session fetch timed out after 5s')), 5000);
      });
      
      let sessionResponse;
      try {
        sessionResponse = await Promise.race([sessionPromise, timeoutPromise]);
      } catch (e) {
        debug(`Session fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        debug(`Current page URL: ${page.url()}`);
        throw e;
      }
      
      debug(`Session validated, user: ${(sessionResponse as { user: { id: string } }).user.id}`);

      return createPlaywrightActor(page, {
        email: uniqueEmail,
        userId: (sessionResponse as { user: { id: string } }).user.id,
        organizationId: orgId,
      });
    },

    async createActorWithInvitation(invitationCode: string, email: string): Promise<Actor> {
      if (!browser) {
        throw new Error('Driver not initialized. Call setup() first.');
      }

      const debug = (msg: string) => {
        if (process.env.DEBUG_PLAYWRIGHT) {
          console.log(`[Playwright:Invitation] ${msg}`);
        }
      };

      // Create an isolated browser context for this actor (cookie isolation)
      const context = await browser.newContext({
        baseURL: config.baseUrl,
      });
      actorContexts.push(context);
      debug('Created isolated browser context');

      // Make email unique per actor to satisfy the global email uniqueness constraint
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const [localPart, domain] = email.split('@');
      const uniqueEmail = `${localPart}+${suffix}@${domain}`;
      debug(`Creating actor with email: ${uniqueEmail}`);

      // Create a new page for this actor in their isolated context
      const page = await context.newPage();
      debug('Created new page');

      // Set up virtual authenticator BEFORE navigating to signup
      await setupVirtualAuthenticator(page);
      debug('Virtual authenticator set up');

      // Perform signup via the UI with the provided invitation code
      const signupPage = new SignupPage(page);
      await signupPage.goto(invitationCode);
      debug(`Navigated to signup with code: ${invitationCode}`);

      // Wait for the page to auto-validate the code and reach the details step
      debug('Waiting for details step...');
      await signupPage.waitForDetailsStep();
      debug('Reached details step');

      // Check for errors during validation
      if (await signupPage.hasError()) {
        const error = await signupPage.getErrorMessage();
        throw new Error(`Signup validation failed: ${error}`);
      }

      // Fill email and device name
      await signupPage.enterEmail(uniqueEmail);
      debug('Filled email');
      await signupPage.enterDeviceName('Test Device');
      debug('Filled device name');

      // Click create account - this triggers WebAuthn registration
      debug('Clicking create account...');
      await signupPage.clickCreateAccount();
      debug('Clicked create account, waiting for WebAuthn...');

      // Wait for signup to complete
      try {
        const result = await Promise.race([
          signupPage.waitForSuccess().then(() => 'success' as const),
          page.locator('.bg-destructive\\/10').waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
        ]);

        if (result === 'error') {
          const errorMsg = await signupPage.getErrorMessage();
          debug(`Signup failed with error: ${errorMsg}`);
          throw new Error(`Signup failed: ${errorMsg}`);
        }
      } catch (e) {
        debug(`Timeout waiting for signup result, current URL: ${page.url()}`);
        throw e;
      }
      debug('Signup success!');

      // Wait for auto-redirect to home page
      await signupPage.waitForRedirect();
      debug('Redirected to home');

      // Get user ID and org ID from session
      const sessionPromise = page.evaluate(async () => {
        const response = await fetch('/api/auth/session', { credentials: 'include' });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to get session: ${response.status} - ${text}`);
        }
        return response.json();
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session fetch timed out after 5s')), 5000);
      });

      let sessionResponse;
      try {
        sessionResponse = await Promise.race([sessionPromise, timeoutPromise]);
      } catch (e) {
        debug(`Session fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }

      const typedSession = sessionResponse as { user: { id: string }; organizationId: string };
      debug(`Session validated, user: ${typedSession.user.id}, org: ${typedSession.organizationId}`);

      return createPlaywrightActor(page, {
        email: uniqueEmail,
        userId: typedSession.user.id,
        organizationId: typedSession.organizationId,
      });
    },

    createAnonymousActor(): AnonymousActor {
      if (!browser) {
        throw new Error('Driver not initialized. Call setup() first.');
      }

      // Create a dedicated context for anonymous actor
      let context: BrowserContext | null = null;
      let page: Page | null = null;
      
      const getPage = async (): Promise<Page> => {
        if (!page) {
          if (!context) {
            context = await browser!.newContext({
              baseURL: config.baseUrl,
            });
            actorContexts.push(context);
          }
          page = await context.newPage();
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

      // Close all actor contexts
      for (const context of actorContexts) {
        try {
          await context.close();
        } catch {
          // Ignore errors during cleanup
        }
      }
      actorContexts.length = 0;

      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
};
