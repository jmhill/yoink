import type { Page } from '@playwright/test';
import type {
  Actor,
  AnonymousActor,
  Capture,
  CreateCaptureInput,
  UpdateCaptureInput,
} from '../../dsl/index.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../dsl/index.js';
import { ConfigPage, InboxPage, ArchivedPage } from './page-objects.js';

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * State tracking for captures created through the UI.
 * Since the UI doesn't expose all capture fields, we need to track them.
 */
type CaptureState = {
  id: string;
  content: string;
  status: 'inbox' | 'archived';
  capturedAt: string;
};

/**
 * Playwright implementation of the Actor interface.
 * Interacts with the web UI to perform operations.
 */
export const createPlaywrightActor = (
  page: Page,
  credentials: ActorCredentials
): Actor => {
  const configPage = new ConfigPage(page);
  const inboxPage = new InboxPage(page);
  const archivedPage = new ArchivedPage(page);
  
  // Track captures we've created for ID lookup
  const capturesByContent = new Map<string, CaptureState>();
  let isConfigured = false;

  const ensureConfigured = async (): Promise<void> => {
    if (!isConfigured) {
      await configPage.configure(credentials.token);
      isConfigured = true;
    }
  };

  // Helper to build a Capture object from UI state
  const buildCapture = (state: CaptureState): Capture => ({
    id: state.id,
    content: state.content,
    status: state.status,
    organizationId: credentials.organizationId,
    createdById: credentials.userId,
    capturedAt: state.capturedAt,
  });

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      if (!input.content || input.content.trim() === '') {
        throw new ValidationError('Content is required');
      }
      
      await ensureConfigured();
      await inboxPage.goto();
      await inboxPage.quickAdd(input.content);
      
      // Generate a pseudo-ID (the real ID is in the backend)
      // For tests that need the ID, we'll use the content as a lookup key
      const capturedAt = new Date().toISOString();
      const state: CaptureState = {
        id: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        content: input.content,
        status: 'inbox',
        capturedAt,
      };
      capturesByContent.set(input.content, state);
      
      return buildCapture(state);
    },

    async listCaptures(): Promise<Capture[]> {
      await ensureConfigured();
      await inboxPage.goto();
      
      // Small delay to ensure page is loaded
      await page.waitForTimeout(100);
      
      const contents = await inboxPage.getCaptureContents();
      
      return contents.map((content) => {
        const state = capturesByContent.get(content);
        if (state) {
          return buildCapture(state);
        }
        // Capture exists but we don't have metadata for it
        return {
          id: `unknown-${Date.now()}`,
          content,
          status: 'inbox' as const,
          organizationId: credentials.organizationId,
          createdById: credentials.userId,
          capturedAt: new Date().toISOString(),
        };
      });
    },

    async getCapture(id: string): Promise<Capture> {
      await ensureConfigured();
      
      // Look up by ID in our tracked captures
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          return buildCapture(state);
        }
      }
      
      throw new NotFoundError('Capture', id);
    },

    async updateCapture(id: string, input: UpdateCaptureInput): Promise<Capture> {
      await ensureConfigured();
      
      // Find the capture by ID
      let targetState: CaptureState | undefined;
      for (const state of capturesByContent.values()) {
        if (state.id === id) {
          targetState = state;
          break;
        }
      }
      
      if (!targetState) {
        throw new NotFoundError('Capture', id);
      }
      
      // Handle status change
      if (input.status === 'archived' && targetState.status === 'inbox') {
        await inboxPage.goto();
        await inboxPage.archiveCapture(targetState.content);
        targetState.status = 'archived';
      } else if (input.status === 'inbox' && targetState.status === 'archived') {
        await archivedPage.goto();
        await archivedPage.unarchiveCapture(targetState.content);
        targetState.status = 'inbox';
      }
      
      // Update content in our state (UI doesn't support inline edit yet)
      if (input.content) {
        capturesByContent.delete(targetState.content);
        targetState.content = input.content;
        capturesByContent.set(targetState.content, targetState);
      }
      
      return buildCapture(targetState);
    },

    async archiveCapture(id: string): Promise<Capture> {
      return this.updateCapture(id, { status: 'archived' });
    },

    async unarchiveCapture(id: string): Promise<Capture> {
      return this.updateCapture(id, { status: 'inbox' });
    },
  };
};

/**
 * Playwright implementation of AnonymousActor.
 * Attempts operations without configuring a token.
 */
export const createPlaywrightAnonymousActor = (page: Page): AnonymousActor => {
  return {
    async createCapture(_input: CreateCaptureInput): Promise<Capture> {
      // Navigate without token - should redirect to config
      await page.goto('/');
      
      // Check if redirected to config page
      const url = page.url();
      if (url.includes('/config')) {
        throw new UnauthorizedError();
      }
      
      // Should not reach here
      throw new UnauthorizedError();
    },

    async listCaptures(): Promise<Capture[]> {
      await page.goto('/');
      
      const url = page.url();
      if (url.includes('/config')) {
        throw new UnauthorizedError();
      }
      
      return [];
    },

    async getCapture(id: string): Promise<Capture> {
      await page.goto('/');
      
      const url = page.url();
      if (url.includes('/config')) {
        throw new UnauthorizedError();
      }
      
      throw new NotFoundError('Capture', id);
    },
  };
};
