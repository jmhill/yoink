import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Driver, DriverConfig } from '../types.js';
import type { Actor, AnonymousActor } from '../../dsl/index.js';
import { createHttpClient } from '../http/http-client.js';
import { createHttpAdmin } from '../http/admin.js';
import { createHttpHealth } from '../http/health.js';
import { createPlaywrightActor, createPlaywrightAnonymousActor } from './actor.js';

/**
 * Creates a Playwright driver that implements DSL interfaces via browser automation.
 * 
 * The Playwright driver:
 * - Uses the browser to interact with the web UI for Actor operations
 * - Uses HTTP for Admin operations (admin UI is separate)
 * - Uses HTTP for Health operations (no UI for health)
 */
export const createPlaywrightDriver = (config: DriverConfig): Driver => {
  // HTTP client for admin/health operations (no browser UI for these)
  const httpClient = createHttpClient(config.baseUrl);
  const admin = createHttpAdmin(httpClient, config.adminPassword);
  const health = createHttpHealth(httpClient);

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

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
      try {
        const org = await admin.createOrganization(orgName);
        const user = await admin.createUser(org.id, uniqueEmail);
        const { rawToken } = await admin.createToken(user.id, 'test-token');

        // Create a new page for this actor
        const page = await context.newPage();
        await page.goto(config.baseUrl);

        return createPlaywrightActor(page, {
          email,
          userId: user.id,
          organizationId: org.id,
          token: rawToken,
        });
      } finally {
        await admin.logout();
      }
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
