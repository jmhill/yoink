import { type Page, type CDPSession, type Locator, expect } from '@playwright/test';
import type { TaskFilter } from '../../dsl/types.js';
import { dropPointForOpenTaskSlot } from './open-task-slot-drop.js';

/**
 * Page object for the login page (/login).
 * Handles passkey-based authentication.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async clickSignInWithPasskey(): Promise<void> {
    await this.page.getByRole('button', { name: 'Sign in with Passkey' }).click();
  }

  async hasError(): Promise<boolean> {
    return await this.page.locator('.bg-destructive\\/10').isVisible();
  }

  async getErrorMessage(): Promise<string | null> {
    const errorBox = this.page.locator('.bg-destructive\\/10');
    if (await errorBox.isVisible()) {
      return await errorBox.textContent();
    }
    return null;
  }
}

/**
 * Page object for the signup page (/signup).
 * Handles invitation-based account creation with passkey.
 */
export class SignupPage {
  constructor(private readonly page: Page) {}

  async goto(code?: string): Promise<void> {
    const url = code ? `/signup?code=${code}` : '/signup';
    await this.page.goto(url);
  }

  /**
   * Wait for the page to reach the details step (after code validation).
   * When navigating with ?code=XXX, the page auto-validates and transitions.
   */
  async waitForDetailsStep(): Promise<void> {
    // Wait for either the email field (details step) or an error
    await Promise.race([
      this.page.getByLabel('Email').waitFor({ state: 'visible', timeout: 10000 }),
      this.page.locator('.bg-destructive\\/10').waitFor({ state: 'visible', timeout: 10000 }),
    ]);
  }

  /**
   * Check if we're on the code entry step.
   */
  async isOnCodeStep(): Promise<boolean> {
    return await this.page.getByLabel('Invitation Code').isVisible();
  }

  async enterInvitationCode(code: string): Promise<void> {
    await this.page.getByLabel('Invitation Code').fill(code.toUpperCase());
  }

  async clickContinue(): Promise<void> {
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  async enterEmail(email: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
  }

  async enterDeviceName(name: string): Promise<void> {
    await this.page.getByLabel('Device Name').fill(name);
  }

  async clickCreateAccount(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create account with Passkey' }).click();
  }

  async waitForSuccess(): Promise<void> {
    await this.page.getByText('Welcome to Yoink!').waitFor({ state: 'visible' });
  }

  /**
   * Wait for redirect to home page after signup success.
   * The signup page auto-redirects after 2 seconds.
   */
  async waitForRedirect(): Promise<void> {
    await this.page.waitForURL('/', { timeout: 5000 });
  }

  async hasError(): Promise<boolean> {
    return await this.page.locator('.bg-destructive\\/10').isVisible();
  }

  async getErrorMessage(): Promise<string | null> {
    const errorBox = this.page.locator('.bg-destructive\\/10');
    if (await errorBox.isVisible()) {
      return await errorBox.textContent();
    }
    return null;
  }
}

/**
 * Helper for setting up a CDP virtual authenticator for WebAuthn testing.
 * This allows automated testing of passkey registration and authentication.
 */
export class VirtualAuthenticator {
  private authenticatorId: string | null = null;

  constructor(private readonly cdpSession: CDPSession) {}

  /**
   * Enable WebAuthn and add a virtual authenticator.
   * Should be called before any passkey operations.
   */
  async setup(): Promise<void> {
    await this.cdpSession.send('WebAuthn.enable', { enableUI: false });
    
    const result = await this.cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    
    this.authenticatorId = result.authenticatorId;
  }

  /**
   * Clean up the virtual authenticator.
   */
  async teardown(): Promise<void> {
    if (this.authenticatorId) {
      await this.cdpSession.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId: this.authenticatorId,
      });
      this.authenticatorId = null;
    }
    await this.cdpSession.send('WebAuthn.disable');
  }

  /**
   * Get all credentials registered with the virtual authenticator.
   */
  async getCredentials(): Promise<Array<{ credentialId: string; userHandle: string | undefined }>> {
    if (!this.authenticatorId) {
      throw new Error('Virtual authenticator not initialized');
    }

    const result = await this.cdpSession.send('WebAuthn.getCredentials', {
      authenticatorId: this.authenticatorId,
    });

    return result.credentials.map((c) => ({
      credentialId: c.credentialId,
      userHandle: c.userHandle,
    }));
  }
}

/**
 * Page object for the token configuration page (/config).
 */
export class ConfigPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/config');
  }

  async setToken(token: string): Promise<void> {
    await this.page.getByLabel('API Token').fill(token);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save Token' }).click();
  }

  async configure(token: string): Promise<void> {
    await this.goto();
    await this.setToken(token);
    await this.submit();
    // Wait for navigation to inbox
    await this.page.waitForURL('/');
  }
}

/**
 * Page object for the inbox page (/).
 */
export class InboxPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async waitForLoad(): Promise<void> {
    // Wait for either captures to load or empty state
    await this.page.waitForSelector('[data-slot="card"]');
  }

  quickCaptureInput() {
    return this.page.getByTestId('quick-capture-input');
  }

  quickCaptureShortcutHint() {
    return this.page.getByTestId('quick-capture-shortcut-hint');
  }

  /**
   * Wait for either capture cards to appear or empty state message.
   * This replaces arbitrary timeouts with explicit wait conditions.
   */
  async waitForCapturesOrEmpty(): Promise<void> {
    // Wait for either:
    // 1. At least one capture card to appear
    // 2. The "Your inbox is empty" message to appear
    await Promise.race([
      this.page.locator('[data-capture-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('Your inbox is empty').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, the page might still be loading
      // Fall through and let the test continue (it will fail if data is missing)
    });
  }

  /**
   * Add a capture via the quick-add input.
   * Returns the created capture's ID if successful, null if the UI prevented submission.
   */
  async quickAdd(content: string): Promise<string | null> {
    const input = this.page.getByPlaceholder('Quick capture...');
    // Unique actor emails become org names (`local+suffix@…'s Workspace`).
    // Substring `name: 'Add'` matches those when the suffix contains "add".
    const addButton = this.page.getByRole('button', { name: 'Add', exact: true });
    
    await input.fill(content);
    
    // Check if the Add button is disabled (UI validation for empty content)
    const isDisabled = await addButton.isDisabled();
    if (isDisabled) {
      return null;
    }
    
    await addButton.click();
    
    // Get the real ID from the newly created capture card.
    // We must wait for the server response to replace the optimistic temp ID.
    // Optimistic updates use IDs like "temp-1234567890", real IDs are UUIDs.
    // Use .first() to avoid strict mode violations when optimistic updates
    // briefly show duplicate elements with the same content.
    const card = this.page.locator('[data-capture-id]').filter({ hasText: content }).first();
    
    // Wait for the card to be visible
    await card.waitFor({ state: 'visible' });
    
    // Poll until we get a real UUID (not a temp ID from optimistic update)
    let captureId: string | null = null;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      captureId = await card.getAttribute('data-capture-id');
      if (captureId && !captureId.startsWith('temp-')) {
        break;
      }
      await this.page.waitForTimeout(100);
    }
    
    // If we still have a temp ID, the server response didn't arrive in time
    if (captureId?.startsWith('temp-')) {
      throw new Error(`Timed out waiting for server to confirm capture creation. Got temp ID: ${captureId}`);
    }
    
    return captureId;
  }

  async getCaptureContents(): Promise<string[]> {
    // Get all capture cards and extract their content
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const contents: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const contentElement = card.getByTestId('capture-content');
      const text = await contentElement.textContent();
      if (text) {
        contents.push(text);
      }
    }
    
    return contents;
  }

  /**
   * Get all captures with their IDs from the DOM.
   */
  async getCaptures(): Promise<Array<{ id: string; content: string }>> {
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const captures: Array<{ id: string; content: string }> = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-capture-id');
      const contentElement = card.getByTestId('capture-content');
      const content = await contentElement.textContent();
      if (id && content) {
        captures.push({ id, content });
      }
    }
    
    return captures;
  }

  /**
   * Get a capture's ID by its content.
   */
  async getCaptureIdByContent(content: string): Promise<string | null> {
    const card = this.page.locator('[data-capture-id]').filter({ hasText: content }).first();
    return await card.getAttribute('data-capture-id');
  }

  /**
   * Get the source URL displayed on a capture card, if any.
   */
  async getCaptureSourceUrl(content: string): Promise<string | null> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    const urlElement = card.locator('[data-testid="source-url"]');
    if (await urlElement.isVisible()) {
      return await urlElement.textContent();
    }
    return null;
  }

  async trashCapture(content: string): Promise<void> {
    // Find the card containing this content and click its trash button
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Trash' }).click();
    // Wait for the capture to disappear
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async snoozeCapture(content: string, option: 'later-today' | 'tomorrow' | 'next-week'): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    // Click the snooze dropdown trigger using role selector (consistent with other button selectors)
    await card.getByRole('button', { name: 'Snooze' }).click();
    // Wait for the dropdown menu to appear
    await this.page.locator('[data-slot="dropdown-menu-content"]').waitFor({ state: 'visible' });
    // Select the snooze option from dropdown - Radix uses data-slot for menu items
    const optionText = option === 'later-today' ? 'Later today' : option === 'tomorrow' ? 'Tomorrow' : 'Next week';
    await this.page.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: optionText }).click();
    // Wait for the capture to disappear from inbox
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async goToSnoozed(): Promise<void> {
    await this.page.locator('[data-inbox-pane-tabs]').getByRole('tab', { name: 'Snoozed' }).click();
    await this.page.waitForURL('/snoozed');
  }

  async goToTrash(): Promise<void> {
    await this.page.locator('[data-inbox-pane-tabs]').getByRole('tab', { name: 'Trash' }).click();
    await this.page.waitForURL('/trash');
  }

  paneTabs() {
    return this.page.locator('[data-inbox-pane-tabs]');
  }

  triageSurface() {
    return this.page.getByTestId('inbox-triage-surface');
  }

  triageHeading() {
    return this.page.getByRole('heading', { name: 'Inbox', level: 1 });
  }

  triageSubcopy() {
    return this.page.getByTestId('inbox-triage-subcopy');
  }

  async getPaneTabLabels(): Promise<string[]> {
    const tabs = this.paneTabs().locator('[data-inbox-pane-tab]');
    const count = await tabs.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await tabs.nth(i).innerText();
      if (text.trim()) {
        labels.push(text.trim());
      }
    }
    return labels;
  }

  async openPaneTab(tab: 'inbox' | 'snoozed' | 'trash'): Promise<void> {
    const label = tab === 'inbox' ? 'Inbox' : tab === 'snoozed' ? 'Snoozed' : 'Trash';
    await this.paneTabs().getByRole('tab', { name: label }).click();
    const path = tab === 'inbox' ? '/' : `/${tab}`;
    await this.page.waitForURL(path);
  }

  captureCard(content: string) {
    return this.page.locator('[data-capture-id]').filter({ hasText: content });
  }

  captureContent(content: string) {
    return this.captureCard(content).getByTestId('capture-content');
  }

  captureSourceLine(content: string) {
    return this.captureCard(content).getByTestId('capture-source-line');
  }

  captureContentLink(content: string, href: string) {
    return this.captureCard(content)
      .locator('[data-testid="capture-content-link"]')
      .filter({ hasText: href });
  }

  captureContentLinks(content: string) {
    return this.captureCard(content).locator('[data-testid="capture-content-link"]');
  }

  captureSourceUrl(content: string) {
    return this.captureCard(content).locator('[data-testid="source-url"]');
  }

  async swipeCaptureCard(
    content: string,
    delta: { x: number; y: number }
  ): Promise<void> {
    const card = this.captureCard(content);
    await card.waitFor({ state: 'visible' });
    await card.evaluate((node, { x, y }) => {
      const view = node.ownerDocument.defaultView;
      if (!view) {
        throw new Error('capture card is not in a window');
      }
      const rect = node.getBoundingClientRect();
      const startX = rect.left + Math.min(rect.width * 0.35, 90);
      const startY = rect.top + rect.height / 2;
      const fire = (type: string, clientX: number, clientY: number) => {
        const touch = new view.Touch({
          identifier: 1,
          target: node,
          clientX,
          clientY,
          pageX: clientX,
          pageY: clientY,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });
        node.dispatchEvent(
          new view.TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: type === 'touchend' ? [] : [touch],
            targetTouches: type === 'touchend' ? [] : [touch],
            changedTouches: [touch],
          })
        );
      };
      fire('touchstart', startX, startY);
      fire('touchmove', startX + x * 0.25, startY + y * 0.25);
      fire('touchmove', startX + x, startY + y);
      fire('touchend', startX + x, startY + y);
    }, delta);
  }

  async openPromote(content: string): Promise<void> {
    const card = this.captureCard(content);
    await card.hover();
    await card.getByRole('button', { name: 'Promote' }).click();
  }

  promoteSheet() {
    return this.page.locator('[data-promote-sheet]');
  }

  promoteTitle() {
    return this.page.locator('#promote-title');
  }

  promoteList() {
    return this.page.locator('#promote-list');
  }

  async selectPromoteListByName(name: string): Promise<void> {
    await this.promoteList().click();
    const option = this.page
      .getByRole('listbox')
      .locator('[data-slot="select-item"]')
      .filter({ hasText: name });
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  async confirmPromote(): Promise<void> {
    await this.promoteSheet().getByRole('button', { name: 'Promote' }).click();
  }

  async cancelPromote(): Promise<void> {
    await this.promoteSheet().getByRole('button', { name: 'Cancel' }).click();
  }

  async goToSettings(): Promise<void> {
    await this.page.getByTitle('Settings').click();
    await this.page.waitForURL('/settings');
  }

  async isEmpty(): Promise<boolean> {
    const emptyMessage = this.page.getByText('Your inbox is empty');
    return await emptyMessage.isVisible();
  }
}

/**
 * Page object for the settings page (/settings).
 */
export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  async logout(): Promise<void> {
    await this.page.getByRole('button', { name: 'Log out' }).click();
    // Wait for redirect to login page (new auth flow) or config page (legacy)
    await Promise.race([
      this.page.waitForURL('**/login'),
      this.page.waitForURL('**/config'),
    ]);
  }

  async goBack(): Promise<void> {
    await this.page.getByRole('link', { name: 'Back' }).or(
      this.page.locator('a[href="/"]')
    ).click();
    await this.page.waitForURL('/');
  }

  /**
   * Click the "Add Passkey" button in the Security section.
   */
  async clickAddPasskey(): Promise<void> {
    await this.page.getByRole('button', { name: 'Add Passkey' }).click();
  }

  /**
   * Fill in the device name in the Add Passkey dialog.
   */
  async fillDeviceName(name: string): Promise<void> {
    await this.page.getByLabel('Device Name').fill(name);
  }

  /**
   * Click "Register Passkey" in the Add Passkey dialog.
   */
  async clickRegisterPasskey(): Promise<void> {
    await this.page.getByRole('button', { name: 'Register Passkey' }).click();
  }

  /**
   * Wait for the passkey registration to complete successfully.
   */
  async waitForPasskeyRegistered(): Promise<void> {
    // The dialog should close on success
    await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
  }

  /**
   * Get the list of passkeys displayed in the Security section.
   */
  async getPasskeyList(): Promise<Array<{ name: string }>> {
    // Wait for security section to load
    await this.page.getByText('Manage your passkeys').waitFor({ state: 'visible' });

    // Find passkey items (they have a delete button)
    const items = this.page.locator('[class*="rounded-lg border"]').filter({
      has: this.page.locator('button[title*="Delete"]'),
    });

    const count = await items.count();
    const passkeys: Array<{ name: string }> = [];

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const nameElement = item.locator('p.font-medium').first();
      const name = await nameElement.textContent();
      if (name) {
        passkeys.push({ name });
      }
    }

    return passkeys;
  }

  /**
   * Delete a passkey by name.
   */
  async deletePasskey(name: string): Promise<void> {
    const item = this.page.locator('[class*="rounded-lg border"]').filter({ hasText: name });
    await item.getByRole('button').click();
    // Confirm deletion in dialog
    await this.page.getByRole('button', { name: 'Delete' }).click();
    // Wait for dialog to close
    await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
  }

  /**
   * Check if the delete button for a passkey is disabled (last passkey guard).
   */
  async isDeleteDisabled(name: string): Promise<boolean> {
    const item = this.page.locator('[class*="rounded-lg border"]').filter({ hasText: name });
    const deleteButton = item.getByRole('button');
    return await deleteButton.isDisabled();
  }
}

/**
 * Page object for the trash page (/trash).
 */
export class TrashPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/trash');
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('[data-slot="card"]');
  }

  /**
   * Wait for either capture cards to appear or empty state message.
   * This replaces arbitrary timeouts with explicit wait conditions.
   */
  async waitForCapturesOrEmpty(): Promise<void> {
    await Promise.race([
      this.page.locator('[data-capture-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No trashed captures').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, let the test continue (it will fail if data is missing)
    });
  }

  async getCaptureContents(): Promise<string[]> {
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const contents: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const contentElement = card.getByTestId('capture-content');
      const text = await contentElement.textContent();
      if (text) {
        contents.push(text);
      }
    }
    
    return contents;
  }

  /**
   * Get all captures with their IDs from the DOM.
   */
  async getCaptures(): Promise<Array<{ id: string; content: string }>> {
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const captures: Array<{ id: string; content: string }> = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-capture-id');
      const contentElement = card.getByTestId('capture-content');
      const content = await contentElement.textContent();
      if (id && content) {
        captures.push({ id, content });
      }
    }
    
    return captures;
  }

  async restoreCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Restore' }).click();
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async deleteCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Delete permanently' }).click();
    // Wait for confirmation dialog
    await this.page.getByRole('button', { name: 'Delete' }).click();
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async emptyTrash(): Promise<number> {
    // Click the Empty Trash button
    await this.page.getByRole('button', { name: 'Empty Trash' }).click();
    // Wait for confirmation dialog and click confirm
    await this.page.getByRole('dialog').getByRole('button', { name: 'Empty Trash' }).click();
    // Wait for the trash to be empty
    await this.page.getByText('No trashed captures').waitFor({ state: 'attached' });
    // Return 0 as we can't easily get the count from UI
    return 0;
  }

  async goToInbox(): Promise<void> {
    await this.page.locator('[data-inbox-pane-tabs]').getByRole('tab', { name: 'Inbox' }).click();
    await this.page.waitForURL('/');
  }

  async isEmpty(): Promise<boolean> {
    const emptyMessage = this.page.getByText('No trashed captures');
    return await emptyMessage.isVisible();
  }
}

/**
 * Page object for the snoozed page (/snoozed).
 */
export class SnoozedPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/snoozed');
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('[data-slot="card"]');
  }

  /**
   * Wait for either capture cards to appear or empty state message.
   * This replaces arbitrary timeouts with explicit wait conditions.
   */
  async waitForCapturesOrEmpty(): Promise<void> {
    await Promise.race([
      this.page.locator('[data-capture-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No snoozed captures').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, let the test continue (it will fail if data is missing)
    });
  }

  async getCaptureContents(): Promise<string[]> {
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const contents: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const contentElement = card.getByTestId('capture-content');
      const text = await contentElement.textContent();
      if (text) {
        contents.push(text);
      }
    }
    
    return contents;
  }

  /**
   * Get all captures with their IDs from the DOM.
   */
  async getCaptures(): Promise<Array<{ id: string; content: string }>> {
    const cards = this.page.locator('[data-capture-id]');
    const count = await cards.count();
    const captures: Array<{ id: string; content: string }> = [];
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-capture-id');
      const contentElement = card.getByTestId('capture-content');
      const content = await contentElement.textContent();
      if (id && content) {
        captures.push({ id, content });
      }
    }
    
    return captures;
  }

  async unsnoozeCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByLabel('Unsnooze').click();
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async goToInbox(): Promise<void> {
    await this.page.locator('[data-inbox-pane-tabs]').getByRole('tab', { name: 'Inbox' }).click();
    await this.page.waitForURL('/');
  }

  async isEmpty(): Promise<boolean> {
    const emptyMessage = this.page.getByText('No snoozed captures');
    return await emptyMessage.isVisible();
  }
}

/**
 * Page object for the tasks board (/tasks).
 */
export class TasksPage {
  constructor(private readonly page: Page) {}

  async goto(filter: Exclude<TaskFilter, 'all'> = 'today'): Promise<void> {
    await this.page.goto(`/tasks?filter=${filter}`);
  }

  async openFilter(filter: Exclude<TaskFilter, 'all'>): Promise<void> {
    const name = {
      today: 'Today',
      upcoming: /Upcoming|Soon/,
      completed: 'Done',
      mine: 'Mine',
    }[filter];
    await this.page.getByRole('tab', { name }).click();
  }

  async waitForTasksOrEmpty(): Promise<void> {
    await this.page
      .getByText('Loading...', { exact: true })
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {
        // Loading copy is absent on views that never show it.
      });
    const settleMs = 8_000;
    await Promise.race([
      this.page.locator('[data-task-id]').first().waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No tasks yet').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No tasks for today').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No tasks assigned to you').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No upcoming tasks').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No completed tasks').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No open tasks on this list').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No open unlisted tasks').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No tasks assigned to you on this list').waitFor({ state: 'attached', timeout: settleMs }),
      this.page.getByText('No unlisted tasks assigned to you').waitFor({ state: 'attached', timeout: settleMs }),
    ]).catch(() => {
      // If neither appears, let the test continue (it will fail if data is missing)
    });
  }

  taskSurface() {
    return this.page.getByTestId('task-surface');
  }

  placeHeading() {
    return this.taskSurface().locator('[data-place-heading]');
  }

  placeSubcopy() {
    return this.taskSurface().getByTestId('task-place-subcopy');
  }

  taskCard(taskId: string) {
    return this.page.locator(`[data-task-id="${taskId}"]`);
  }

  async waitForTask(taskId: string): Promise<void> {
    await this.taskCard(taskId).waitFor({ state: 'visible' });
  }

  async openEdit(taskId: string): Promise<void> {
    await this.taskTitle(taskId).click();
    await this.page.getByRole('dialog', { name: 'Edit Task' }).waitFor({ state: 'visible' });
  }

  async selectAssignee(userId: string): Promise<void> {
    await this.chooseAssigneeOption(userId);
  }

  async clearAssignee(): Promise<void> {
    await this.chooseAssigneeOption('unassigned');
  }

  private async chooseAssigneeOption(value: string): Promise<void> {
    await this.page.locator('#edit-task-assignee').click();
    const option = this.page.locator(`[data-slot="select-item"][data-value="${value}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  async selectList(listId: string): Promise<void> {
    await this.chooseListOption(listId);
  }

  async clearList(): Promise<void> {
    await this.chooseListOption('unlisted');
  }

  private async chooseListOption(value: string): Promise<void> {
    await this.page.locator('#edit-task-list').click();
    const option = this.page.locator(`[data-slot="select-item"][data-value="${value}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  async selectCreateList(listId: string): Promise<void> {
    await this.page.locator('#create-task-list').click();
    const option = this.page
      .getByRole('listbox')
      .locator(`[data-slot="select-item"][data-value="${listId}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  createTaskListPicker() {
    return this.page.locator('#create-task-list');
  }

  async quickAdd(title: string): Promise<void> {
    await this.page.locator('#create-task-title').fill(title);
    await this.page.getByRole('button', { name: 'Add', exact: true }).click();
  }

  async setTitle(title: string): Promise<void> {
    await this.page.locator('#edit-task-title').fill(title);
  }

  async setDueDate(dueDate: string): Promise<void> {
    await this.page.locator('#edit-task-due-date').fill(dueDate);
  }

  async clearDueDate(): Promise<void> {
    const clearButton = this.page.getByRole('button', { name: 'Clear due date' });
    if (await clearButton.isVisible()) {
      await clearButton.click();
    }
  }

  async saveEdit(): Promise<void> {
    await this.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
  }

  assigneeOnTask(taskId: string) {
    return this.taskCard(taskId).locator('[data-assignee]');
  }

  listOnTask(taskId: string) {
    return this.taskCard(taskId).locator('[data-list]');
  }

  async waitForPileScreen(): Promise<void> {
    await this.page.waitForURL(/[?&]pile=/);
    await this.waitForTasksOrEmpty();
  }

  async waitForPileSelect(): Promise<void> {
    throw new Error('All pile dropdown (#all-pile) is retired');
  }

  async getBoardTaskTitles(): Promise<string[]> {
    return this.titlesIn(this.page.locator('[data-task-id]'));
  }

  async selectAllPile(value: string): Promise<void> {
    await this.closePileSelect();
    await this.waitForPileSelect();
    await this.page.locator('#all-pile').click();
    await this.chooseOpenPileOption(value);
  }

  private async chooseOpenPileOption(value: string): Promise<void> {
    const listbox = this.page.getByRole('listbox');
    const option = listbox.locator(`[data-slot="select-item"][data-value="${value}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
    await listbox.waitFor({ state: 'hidden' });
  }

  async selectAllNamedPile(name: string): Promise<void> {
    await this.closePileSelect();
    await this.waitForPileSelect();
    await this.page.locator('#all-pile').click();
    const option = this.namedPileOption(name);
    await option.waitFor({ state: 'visible' });
    await option.click();
    await this.page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i);
  }

  namedPileOption(name: string) {
    return this.page
      .getByRole('listbox')
      .locator('[data-slot="select-item"]:not([data-all-pile-new-list])')
      .filter({ hasText: new RegExp(`^${name}$`) });
  }

  async openNewListFromPileSelect(): Promise<void> {
    await this.waitForPileSelect();
    await this.page.locator('#all-pile').click();
    const option = this.page.locator('[data-all-pile-new-list]');
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  async closePileSelect(): Promise<void> {
    const listbox = this.page.getByRole('listbox');
    if (!(await listbox.isVisible())) {
      return;
    }
    await this.page.keyboard.press('Escape');
    try {
      await listbox.waitFor({ state: 'hidden', timeout: 1000 });
    } catch {
      const trigger = this.page.locator('#all-pile').first();
      if (await trigger.isVisible()) {
        // Named-list / Unlisted screens have no create-task list picker,
        // so the open Select overlay can intercept a normal click.
        await trigger.click({ force: true });
      }
      await listbox.waitFor({ state: 'hidden' });
    }
  }

  async createNamedListFromAll(
    name: string
  ): Promise<
    | { status: 'created'; id: string; name: string }
    | { status: 'empty' }
    | { status: 'duplicate' }
  > {
    // All is gone — create lives on + New list.
    const previousPile = new URL(this.page.url()).searchParams.get('pile');
    await this.page.locator('[data-app-rail]:visible [data-rail-item="new-list"]').click();

    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const nameInput = dialog.getByLabel('Name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(name);

    const createButton = dialog.getByRole('button', { name: 'Create list' });
    if (await createButton.isDisabled()) {
      return { status: 'empty' };
    }

    await createButton.click();

    const duplicateError = dialog.locator('[data-list-create-error]');
    await Promise.race([
      duplicateError.waitFor({ state: 'visible' }),
      this.page.waitForURL((url) => {
        const pile = new URL(url).searchParams.get('pile');
        return Boolean(
          pile && pile !== previousPile && /^[0-9a-f-]{36}$/i.test(pile)
        );
      }),
    ]);

    if (await duplicateError.isVisible()) {
      return { status: 'duplicate' };
    }

    const pile = new URL(this.page.url()).searchParams.get('pile');
    if (!pile) {
      throw new Error(`Created list "${name}" did not land on that pile`);
    }
    await this.waitForTasksOrEmpty();
    return { status: 'created', id: pile, name };
  }

  async deleteNamedListFromAll(
    name: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    await this.closePileSelect();
    await this.waitForPileSelect();
    const deleteButton = this.page.getByRole('button', {
      name: `Delete ${name}`,
      exact: true,
    });
    await deleteButton.waitFor({ state: 'visible' });

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/lists/') &&
        response.request().method() === 'DELETE'
    );
    await deleteButton.click();

    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    const response = await responsePromise;

    if (response.status() === 409) {
      await this.page.locator('[data-list-delete-error]').waitFor({ state: 'visible' });
      await this.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
      return { status: 'has-open-tasks' };
    }
    if (response.status() !== 204) {
      throw new Error(`Failed to delete named list: ${response.status()}`);
    }

    // Kit dialog leaves the rest of the page aria-hidden until it closes.
    await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
    await this.page.waitForURL((url) => {
      const parsed = new URL(url);
      return parsed.searchParams.get('filter') === 'today' && !parsed.searchParams.has('pile');
    });
    await this.waitForTasksOrEmpty();
    return { status: 'deleted' };
  }

  async getAllPileGroupNames(): Promise<string[]> {
    const groups = this.page.locator('[data-pile-group]');
    const count = await groups.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = await groups.nth(i).getAttribute('data-pile-name');
      if (name) {
        names.push(name);
      }
    }
    return names;
  }

  async getTitlesInPileGroup(groupName: string): Promise<string[]> {
    return this.titlesIn(this.page.locator(`[data-pile-name="${groupName}"]`).locator('[data-task-id]'));
  }

  async getTodayOuterSections(): Promise<Array<'overdue' | 'due-today'>> {
    const sections = this.todayDueSections();
    const count = await sections.count();
    const names: Array<'overdue' | 'due-today'> = [];
    for (let i = 0; i < count; i++) {
      const section = await sections.nth(i).getAttribute('data-today-section');
      if (section === 'overdue' || section === 'due-today') {
        names.push(section);
      }
    }
    return names;
  }

  async getPileGroupNamesInTodaySection(
    section: 'overdue' | 'due-today'
  ): Promise<string[]> {
    const groups = this.page
      .locator(`[data-today-section="${section}"]`)
      .locator('[data-pile-group]');
    const count = await groups.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = await groups.nth(i).getAttribute('data-pile-name');
      if (name) {
        names.push(name);
      }
    }
    return names;
  }

  async getTitlesInTodaySectionPileGroup(
    section: 'overdue' | 'due-today',
    groupName: string
  ): Promise<string[]> {
    return this.titlesIn(
      this.page
        .locator(`[data-today-section="${section}"]`)
        .locator(`[data-pile-name="${groupName}"]`)
        .locator('[data-task-id]')
    );
  }

  todayDueSections() {
    return this.page.locator('[data-today-section]');
  }

  private async titlesIn(cards: Locator): Promise<string[]> {
    const count = await cards.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const title = await cards.nth(i).locator('p').first().textContent();
      if (title) {
        titles.push(title.trim());
      }
    }
    return titles;
  }

  reorderButtons() {
    return this.page.getByRole('button', { name: /^Move / });
  }

  reorderEnterButton() {
    return this.page.locator('[data-reorder-enter]');
  }

  reorderDoneButton() {
    return this.page.locator('[data-reorder-done]');
  }

  insertionLine() {
    return this.page.locator('[data-insertion-line]');
  }

  draggingRow() {
    return this.page.locator('[data-dragging]');
  }

  slotShiftRows() {
    return this.page.locator('[data-slot-shift]');
  }

  dragHandles() {
    return this.page.locator('[data-drag-handle]');
  }

  dragHandle(title: string) {
    return this.page.locator(`[data-open-task-title="${title}"] [data-drag-handle]`);
  }

  openTaskRow(title: string) {
    return this.page.locator(`[data-open-task-title="${title}"]`);
  }

  /**
   * Layout box `dropIndexForClientY` snapshots (`data-sortable-item`).
   * The title line sits above this midpoint.
   */
  openTaskSlot(title: string) {
    return this.page
      .locator('[data-sortable-item]')
      .filter({ has: this.openTaskRow(title) });
  }

  async openTaskSlotBox(title: string): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const slot = this.openTaskSlot(title);
    await slot.waitFor({ state: 'visible' });
    const box = await slot.boundingBox();
    if (!box) {
      throw new Error(`open-task slot "${title}" should have a layout box`);
    }
    return box;
  }

  async enterReorderMode(): Promise<void> {
    if (await this.reorderDoneButton().isVisible().catch(() => false)) {
      return;
    }
    await this.reorderEnterButton().waitFor({ state: 'visible' });
    await this.reorderEnterButton().click();
    await this.reorderDoneButton().waitFor({ state: 'visible' });
    await this.dragHandles().first().waitFor({ state: 'visible' });
  }

  async exitReorderMode(): Promise<void> {
    if (!(await this.reorderDoneButton().isVisible().catch(() => false))) {
      return;
    }
    await this.reorderDoneButton().click();
    await this.reorderEnterButton().waitFor({ state: 'visible' });
  }

  pinButtons() {
    return this.page.getByRole('button', { name: /^(Pin|Unpin) task/ });
  }

  completeControl(taskId: string) {
    return this.taskCard(taskId).locator('[data-slot="task-complete"]');
  }

  overflowControl(taskId: string) {
    return this.taskCard(taskId).locator('[data-slot="task-overflow"]');
  }

  overflowMenu(taskId: string) {
    return this.page.locator(`[data-task-overflow-menu="${taskId}"]`);
  }

  editMenuItem(taskId: string) {
    return this.overflowMenu(taskId).getByRole('menuitem', { name: 'Edit' });
  }

  deleteMenuItem(taskId: string) {
    return this.overflowMenu(taskId).getByRole('menuitem', { name: 'Delete' });
  }

  rowEditIcon(taskId: string) {
    return this.taskCard(taskId).getByRole('button', { name: /^Edit task/ });
  }

  rowDeleteIcon(taskId: string) {
    return this.taskCard(taskId).getByRole('button', { name: /^Delete task/ });
  }

  async openOverflow(taskId: string): Promise<void> {
    await this.overflowControl(taskId).click();
    await this.overflowMenu(taskId).waitFor({ state: 'visible' });
  }

  async closeOverflow(taskId: string): Promise<void> {
    const menu = this.overflowMenu(taskId);
    if ((await menu.count()) === 0) {
      return;
    }
    await this.page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }

  taskTitle(taskId: string) {
    return this.taskCard(taskId).locator('[data-slot="task-title"]');
  }

  /**
   * Glyph and first-line geometry for title-line alignment (#84).
   */
  async measureTaskRowTitleLine(taskId: string): Promise<{
    titleLineCenterY: number;
    titleBottom: number;
    titleLineCount: number;
    completeCircleCenterY: number;
    completeHit: { width: number; height: number };
    gripCenterY: number | null;
    gripHit: { width: number; height: number } | null;
    overflowCenterY: number;
    overflowHit: { width: number; height: number };
    metaTop: number | null;
  }> {
    const card = this.taskCard(taskId);
    await card.waitFor({ state: 'visible' });
    return card.evaluate((node) => {
      const title = node.querySelector('[data-slot="task-title"]');
      const complete = node.querySelector('[data-slot="task-complete"]');
      const grip = node.querySelector('[data-drag-handle]');
      const overflow = node.querySelector('[data-slot="task-overflow"]');
      const meta = node.querySelector('[data-slot="task-meta"]');

      if (!title || !complete) {
        throw new Error('task row is missing title-line controls');
      }

      const range = title.ownerDocument.createRange();
      range.selectNodeContents(title);
      const lineRects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0
      );
      const firstLine = lineRects[0] ?? title.getBoundingClientRect();

      const svgCenterY = (el: typeof complete): number => {
        const svg = el.querySelector('svg');
        const box = (svg ?? el).getBoundingClientRect();
        return box.top + box.height / 2;
      };
      const hit = (el: typeof complete): { width: number; height: number } => {
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      };

      return {
        titleLineCenterY: firstLine.top + firstLine.height / 2,
        titleBottom: title.getBoundingClientRect().bottom,
        titleLineCount: Math.max(lineRects.length, 1),
        completeCircleCenterY: svgCenterY(complete),
        completeHit: hit(complete),
        gripCenterY: grip ? svgCenterY(grip) : null,
        gripHit: grip ? hit(grip) : null,
        overflowCenterY: overflow ? svgCenterY(overflow) : firstLine.top + firstLine.height / 2,
        overflowHit: overflow ? hit(overflow) : { width: 0, height: 0 },
        metaTop: meta ? meta.getBoundingClientRect().top : null,
      };
    });
  }

  /**
   * Fire a native touch swipe on the task row (useSwipe is touch-only).
   * Start away from the left-edge rail strip. Threshold is 80px.
   */
  async swipeTaskRow(
    taskId: string,
    delta: { x: number; y: number }
  ): Promise<void> {
    const card = this.taskCard(taskId);
    await card.waitFor({ state: 'visible' });
    await card.evaluate((node, { x, y }) => {
      const view = node.ownerDocument.defaultView;
      if (!view) {
        throw new Error('task row is not in a window');
      }
      const rect = node.getBoundingClientRect();
      const startX = rect.left + Math.min(rect.width * 0.35, 90);
      const startY = rect.top + rect.height / 2;
      const fire = (type: string, clientX: number, clientY: number) => {
        const touch = new view.Touch({
          identifier: 1,
          target: node,
          clientX,
          clientY,
          pageX: clientX,
          pageY: clientY,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1,
        });
        node.dispatchEvent(
          new view.TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: type === 'touchend' ? [] : [touch],
            targetTouches: type === 'touchend' ? [] : [touch],
            changedTouches: [touch],
          })
        );
      };
      fire('touchstart', startX, startY);
      fire('touchmove', startX + x * 0.25, startY + y * 0.25);
      fire('touchmove', startX + x, startY + y);
      fire('touchend', startX + x, startY + y);
    }, delta);
  }

  async dragTaskRowWithMouse(taskId: string, deltaX: number): Promise<void> {
    const card = this.taskCard(taskId);
    const box = await card.boundingBox();
    if (!box) {
      throw new Error('task row should have a layout box');
    }
    const y = box.y + 6;
    const startX = box.x + Math.min(box.width * 0.45, 120);
    await this.page.mouse.move(startX, y);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, y, { steps: 12 });
    await this.page.mouse.up();
  }

  async getNamedPiles(): Promise<Array<{ id: string; name: string }>> {
    const items = this.page.locator('[data-app-rail]:visible [data-rail-item="named"]');
    const count = await items.count();
    const lists: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const id = await item.getAttribute('data-rail-list-id');
      const name = await item.getAttribute('data-rail-label');
      if (id && name) {
        lists.push({ id, name });
      }
    }
    return lists;
  }

  async gotoNamedPile(listId: string): Promise<void> {
    await this.page.goto(`/tasks?pile=${listId}`);
    await this.waitForPileScreen();
  }

  async gotoUnlistedPile(): Promise<void> {
    await this.page.goto('/tasks?pile=unlisted');
    await this.waitForPileScreen();
  }

  async getOpenTaskTitles(): Promise<string[]> {
    const cards = this.page.locator('[data-open-task-title]');
    const count = await cards.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const title = await cards.nth(i).getAttribute('data-open-task-title');
      if (title) {
        titles.push(title);
      }
    }
    return titles;
  }

  async getOpenTasks(): Promise<Array<{ id: string; title: string }>> {
    const cards = this.page.locator('[data-open-task-id]');
    const count = await cards.count();
    const tasks: Array<{ id: string; title: string }> = [];
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-open-task-id');
      const title = await card.getAttribute('data-open-task-title');
      if (id && title) {
        tasks.push({ id, title });
      }
    }
    return tasks;
  }

  async moveOpenTask(title: string, direction: 'up' | 'down'): Promise<void> {
    const titles = await this.getOpenTaskTitles();
    const index = titles.indexOf(title);
    if (index < 0) {
      throw new Error(`Open task "${title}" not found`);
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const targetTitle = titles[targetIndex];
    if (!targetTitle) {
      throw new Error(`Cannot move "${title}" ${direction}`);
    }
    await this.dragOpenTaskOnto(title, targetTitle);
  }

  /**
   * One continuous pointer drag from one open-task slot onto another.
   * Drop Y is the frozen slot midpoint (#90), not the title line.
   */
  async dragOpenTaskOnto(sourceTitle: string, targetTitle: string): Promise<void> {
    await this.enterReorderMode();
    await this.dragHandles().first().waitFor({ state: 'visible' });
    const from = await this.openTaskSlotBox(sourceTitle);
    const to = await this.openTaskSlotBox(targetTitle);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = dropPointForOpenTaskSlot(from, to);
    const before = await this.getOpenTaskTitles();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/order') && response.request().method() === 'PUT'
    );
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    // One continuous gesture — enough samples to cross every open slot.
    await this.page.mouse.move(end.x, end.y, { steps: 24 });
    await this.page.mouse.up();
    await responsePromise;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const after = await this.getOpenTaskTitles();
      if (after.join('\0') !== before.join('\0')) {
        await this.exitReorderMode();
        return;
      }
      await this.page.waitForTimeout(50);
    }
    await this.exitReorderMode();
  }

  /**
   * Touch drag on the row body in reorder mode. Same vertical persist
   * path as pointer drag — not a horizontal swipe. Dispatch on the
   * title so the event bubbles through CardContent handlers.
   */
  async dragOpenTaskOntoByTouch(sourceTitle: string, targetTitle: string): Promise<void> {
    await this.enterReorderMode();
    const source = this.openTaskRow(sourceTitle).locator('[data-slot="task-title"]');
    await source.waitFor({ state: 'visible' });
    const from = await this.openTaskSlotBox(sourceTitle);
    const to = await this.openTaskSlotBox(targetTitle);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = dropPointForOpenTaskSlot(from, to);

    const before = await this.getOpenTaskTitles();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/order') && response.request().method() === 'PUT'
    );

    await source.evaluate(
      (node, { startX: x0, startY: y0, endX: x1, endY: y1 }) => {
        const view = node.ownerDocument.defaultView;
        if (!view) {
          throw new Error('open-task row is not in a window');
        }
        const fire = (type: string, clientX: number, clientY: number) => {
          const touch = new view.Touch({
            identifier: 1,
            target: node,
            clientX,
            clientY,
            pageX: clientX,
            pageY: clientY,
            radiusX: 2.5,
            radiusY: 2.5,
            rotationAngle: 0,
            force: 1,
          });
          node.dispatchEvent(
            new view.TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              touches: type === 'touchend' ? [] : [touch],
              targetTouches: type === 'touchend' ? [] : [touch],
              changedTouches: [touch],
            })
          );
        };
        fire('touchstart', x0, y0);
        const steps = 16;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          fire('touchmove', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
        fire('touchend', x1, y1);
      },
      { startX: start.x, startY: start.y, endX: end.x, endY: end.y }
    );

    await responsePromise;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const after = await this.getOpenTaskTitles();
      if (after.join('\0') !== before.join('\0')) {
        await this.exitReorderMode();
        return;
      }
      await this.page.waitForTimeout(50);
    }
    await this.exitReorderMode();
  }

  /**
   * Hold a drag mid-gesture and assert drop-slot chrome (lifted card,
   * neighbor shift, insertion line). Does not wait on animation frames.
   */
  async seeDropSlotWhileDragging(sourceTitle: string, targetTitle: string): Promise<void> {
    await this.enterReorderMode();
    await this.dragHandles().first().waitFor({ state: 'visible' });
    const from = await this.openTaskSlotBox(sourceTitle);
    const to = await this.openTaskSlotBox(targetTitle);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = dropPointForOpenTaskSlot(from, to);
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, { steps: 16 });
    await expect(this.draggingRow()).toBeVisible();
    await expect(this.insertionLine()).toBeVisible();
    await expect(this.slotShiftRows().first()).toBeVisible();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/order') && response.request().method() === 'PUT'
    );
    await this.page.mouse.up();
    await responsePromise;
    await this.exitReorderMode();
  }

  async dragTaskRowVerticallyWithTouch(taskId: string, deltaY: number): Promise<void> {
    await this.swipeTaskRow(taskId, { x: 8, y: deltaY });
  }

  async deleteNamedListById(
    id: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    await this.gotoNamedPile(id);
    const lists = await this.getNamedPiles();
    const list = lists.find((item) => item.id === id);
    if (!list) {
      throw new Error(`Named list ${id} not found on the rail`);
    }
    return this.deleteNamedListFromAll(list.name);
  }
}

/**
 * Header org switcher. Kit DropdownMenu was clipped/buried by header
 * chrome (same family as named-list overflow); the picker portals to
 * document.body. Use the data attributes, not org-name accessible names
 * — personal orgs are `{email}'s Workspace` and substring-match other
 * buttons.
 */
export class OrganizationSwitcherChrome {
  constructor(private readonly page: Page) {}

  trigger() {
    return this.page.locator('[data-org-switcher]');
  }

  current() {
    return this.page.locator('[data-org-switcher-current]');
  }

  menu() {
    return this.page.locator('[data-org-switcher-menu]');
  }

  item(orgName: string) {
    return this.menu().getByRole('menuitem', { name: orgName });
  }

  async waitForCurrent(orgName: string): Promise<void> {
    await expect(this.current()).toHaveAttribute('data-org-switcher-current', orgName, {
      timeout: 15_000,
    });
  }

  async open(): Promise<void> {
    const menu = this.menu();
    if (await menu.isVisible().catch(() => false)) {
      return;
    }
    await this.trigger().click();
    await menu.waitFor({ state: 'visible' });
  }

  async close(): Promise<void> {
    const menu = this.menu();
    if (!(await menu.isVisible().catch(() => false))) {
      return;
    }
    await this.page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
  }

  /**
   * Picker must be the topmost hit at the first item’s center — not the
   * desktop rail, a leftover Vaul overlay, or a 0-height clipped menu.
   */
  async expectPickerOpen(orgNames: string[]): Promise<void> {
    await this.open();
    const menu = this.menu();
    await menu.waitFor({ state: 'visible' });

    const box = await menu.boundingBox();
    if (!box || box.y < 0 || box.x + box.width <= 0 || box.y + box.height <= 0) {
      throw new Error('Org switcher picker opened off the viewport');
    }

    for (const name of orgNames) {
      await expect(this.item(name)).toBeVisible();
    }

    const first = this.item(orgNames[0] ?? '');
    const itemBox = await first.boundingBox();
    if (!itemBox || itemBox.width <= 0 || itemBox.height <= 0) {
      throw new Error('Org switcher picker item has no hit target');
    }

    const hit = await first.evaluate((node, point) => {
      const el = node.ownerDocument.elementFromPoint(point.x, point.y);
      if (!el) {
        return null;
      }
      return Boolean(el.closest('[data-org-switcher-menu]'));
    }, { x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 });
    if (hit !== true) {
      throw new Error('Org switcher picker is not the topmost hit');
    }

    await this.close();
  }

  async pick(orgName: string): Promise<void> {
    await this.open();
    const item = this.item(orgName);
    await expect(item).toBeVisible();
    await item.click();
    await this.waitForCurrent(orgName);
  }

  async expectSwitchFailureToast(orgName: string): Promise<void> {
    await this.open();
    await this.page.route('**/api/organizations/switch', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Failed to switch organization' }),
        });
        return;
      }
      await route.continue();
    });
    await this.item(orgName).click();
    const toast = this.page.locator('[data-sonner-toast]').filter({
      hasText: 'Failed to switch organization',
    });
    await expect(toast).toBeVisible();
    await this.page.unroute('**/api/organizations/switch');
  }
}

export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
export const DESKTOP_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * Mobile Inbox | Tasks bottom tabs. Visible below the md breakpoint.
 */
export class MobileNav {
  constructor(private readonly page: Page) {}

  root() {
    return this.page.locator('[data-app-mobile-nav]');
  }

  item(label: string) {
    return this.root().locator(`[data-mobile-nav-item="${label}"]`);
  }

  async getItemLabels(): Promise<string[]> {
    const items = this.root().locator('[data-mobile-nav-item]');
    const count = await items.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await items.nth(i).getAttribute('data-mobile-nav-item');
      if (label) {
        labels.push(label);
      }
    }
    return labels;
  }

  async open(label: 'Inbox' | 'Tasks'): Promise<void> {
    await this.root().waitFor({ state: 'visible' });
    await this.item(label).click();
    if (label === 'Inbox') {
      await this.page.waitForURL((url) => {
        const path = new URL(url).pathname;
        return path === '/' || path === '/snoozed' || path === '/trash';
      });
      return;
    }
    await this.page.waitForURL(/\/tasks/);
  }
}

/**
 * App rail (Inbox, smart views, named lists, Unlisted, New list).
 * Desktop: left sidebar (default Playwright viewport).
 * Mobile: the same flat rail in a Tasks swipe drawer (closed by default).
 */
export class AppRail {
  constructor(private readonly page: Page) {}

  root() {
    return this.page.locator('[data-app-rail]:visible');
  }

  desktop() {
    return this.page.locator('[data-app-rail-surface="desktop"]');
  }

  mobileTasks() {
    return this.page.locator('[data-app-rail-surface="mobile-tasks"]');
  }

  mobileTrigger() {
    return this.page.locator('[data-mobile-tasks-rail-trigger]');
  }

  /**
   * A closed Vaul drawer can stay in the DOM (off-screen or aria-hidden).
   * Count > 0 is not "open" — only an on-screen rail item is usable.
   */
  async mobileDrawerIsInteractable(): Promise<boolean> {
    const rail = this.mobileTasks();
    if ((await rail.count()) === 0) {
      return false;
    }
    const item = rail.locator('[data-rail-label]').first();
    if ((await item.count()) === 0) {
      return false;
    }
    const box = await item.boundingBox();
    return Boolean(box && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0);
  }

  private async waitForMobileDrawerInteractable(): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await this.mobileDrawerIsInteractable()) {
        return;
      }
      await this.page.waitForTimeout(50);
    }
    throw new Error('Mobile Tasks rail drawer opened but no rail item was on screen');
  }

  /**
   * After a destination, the phone drawer must finish closing so task
   * rows (complete / edit) are not under a leftover Vaul overlay.
   */
  async waitForMobileDrawerClosedIfPhone(): Promise<void> {
    if (await this.desktop().isVisible().catch(() => false)) {
      return;
    }
    if ((await this.mobileTrigger().count()) === 0) {
      return;
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      const overlayVisible = await this.page
        .locator('[data-slot="drawer-overlay"]')
        .isVisible()
        .catch(() => false);
      if (!overlayVisible && !(await this.mobileDrawerIsInteractable())) {
        return;
      }
      await this.page.waitForTimeout(50);
    }
  }

  private async waitForItemGeometry(item: Locator): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const box = await item.boundingBox();
      if (box && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0) {
        return;
      }
      await this.page.waitForTimeout(50);
    }
  }

  /**
   * On desktop the sidebar is always visible. On mobile the rail lives
   * in a Tasks drawer — open that tab and the drawer when the rail is not showing.
   */
  async ensureAvailable(): Promise<void> {
    if (await this.mobileDrawerIsInteractable()) {
      return;
    }
    if (await this.desktop().isVisible().catch(() => false)) {
      return;
    }
    const tasksTab = this.page.locator('[data-app-mobile-nav] [data-mobile-nav-item="Tasks"]');
    if (await tasksTab.isVisible().catch(() => false)) {
      if (!/\/tasks(?:\?|$)/.test(new URL(this.page.url()).pathname)) {
        await tasksTab.click();
        await this.page.waitForURL(/\/tasks/);
      }
      await this.openMobileDrawer();
      return;
    }
    await this.root().waitFor({ state: 'visible' });
  }

  async openMobileDrawer(): Promise<void> {
    if (await this.mobileDrawerIsInteractable()) {
      return;
    }
    const trigger = this.mobileTrigger();
    await trigger.waitFor({ state: 'visible' });
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.mobileDrawerIsInteractable()) {
        return;
      }
      const expanded = await trigger.getAttribute('aria-expanded');
      if (expanded !== 'true') {
        await trigger.click({ force: attempt > 0 });
      }
      await this.mobileTasks().waitFor({ state: 'attached' });
      try {
        await this.waitForMobileDrawerInteractable();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('Mobile Tasks rail drawer opened but no rail item was on screen');
  }

  /**
   * Mounted rail to click. Prefer the always-visible desktop sidebar when
   * it is showing — a closed Vaul drawer can still sit in the DOM. The
   * mobile drawer may still be transforming, so do not use Playwright's
   * :visible filter on that panel.
   */
  private async railForInteraction(): Promise<Locator> {
    await this.ensureAvailable();
    if (await this.desktop().isVisible().catch(() => false)) {
      return this.desktop();
    }
    if (await this.mobileDrawerIsInteractable()) {
      return this.mobileTasks();
    }
    return this.root();
  }

  /**
   * Fire pointer + click in the page. Playwright's default click waits for a
   * stable box and scrollIntoViews against vaul's transform / body lock.
   */
  private async clickRailControl(locator: Locator): Promise<void> {
    if (await this.desktop().isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
    if (!(await this.mobileDrawerIsInteractable())) {
      await locator.click();
      return;
    }
    await locator.evaluate((node) => {
      const view = node.ownerDocument.defaultView;
      if (!view) {
        throw new Error('Rail control is not in a window');
      }
      const Ctor = view.PointerEvent;
      node.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      node.dispatchEvent(new Ctor('pointerup', { bubbles: true, cancelable: true, button: 0 }));
      (node as { click: () => void }).click();
    });
  }

  async waitForVisible(): Promise<void> {
    await this.ensureAvailable();
    await this.root().waitFor({ state: 'visible' });
  }

  items() {
    return this.root().locator('[data-rail-label]');
  }

  itemByLabel(label: string) {
    return this.root().locator(`[data-rail-label="${label}"]`);
  }

  async getItemLabels(): Promise<string[]> {
    await this.waitForVisible();
    const items = this.items();
    const count = await items.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await items.nth(i).getAttribute('data-rail-label');
      if (label) {
        labels.push(label);
      }
    }
    return labels;
  }

  async getInboxCount(): Promise<number | null> {
    await this.waitForVisible();
    const badge = this.root().locator('[data-inbox-count]');
    if ((await badge.count()) === 0) {
      return null;
    }
    const count = await badge.getAttribute('data-inbox-count');
    if (count === null) {
      throw new Error('Inbox count is missing from the rail');
    }
    return Number(count);
  }

  /**
   * Rail visual order including section headings (not rail items).
   */
  async getVisualOrder(): Promise<string[]> {
    await this.waitForVisible();
    const nodes = this.root().locator('[data-rail-label], [data-rail-heading]');
    const count = await nodes.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const node = nodes.nth(i);
      const heading = await node.getAttribute('data-rail-heading');
      if (heading === 'lists') {
        labels.push('Lists');
        continue;
      }
      if (heading === 'task-family') {
        labels.push('Task family');
        continue;
      }
      const label = await node.getAttribute('data-rail-label');
      if (label) {
        labels.push(label);
      }
    }
    return labels;
  }

  inboxMode() {
    return this.root().locator('[data-rail-mode="inbox"]');
  }

  inboxModeCue() {
    return this.root().locator('[data-rail-mode-cue]');
  }

  inboxToTaskFamilySeparator() {
    return this.root().locator('[data-rail-separator="inbox-to-task-family"]');
  }

  taskFamilyHeading() {
    return this.root().locator('[data-rail-heading="task-family"]');
  }

  async openItem(label: string): Promise<void> {
    const rail = await this.railForInteraction();
    const item = rail.locator(`[data-rail-label="${label}"]`);
    await item.waitFor({ state: 'attached', timeout: 10_000 });
    if (!(await this.desktop().isVisible().catch(() => false))) {
      await this.waitForItemGeometry(item);
    }
    await this.clickRailControl(item);
  }

  async isItemActive(label: string): Promise<boolean> {
    await this.waitForVisible();
    return (await this.itemByLabel(label).getAttribute('data-rail-active')) === 'true';
  }

  /**
   * A long named-list name must wrap onto two+ lines and stay fully
   * readable — not one ellipsis line that only expands on hover.
   */
  async expectNamedListLabelWrapped(label: string): Promise<void> {
    await this.waitForVisible();
    const item = this.itemByLabel(label);
    await item.waitFor({ state: 'visible' });

    const geometry = await item.evaluate((node) => {
      const text =
        node.querySelector('[data-rail-label-text]') ??
        node.querySelector('span') ??
        node;
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(text);
      const lineRects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0
      );
      const styles = node.ownerDocument.defaultView?.getComputedStyle(text);
      return {
        visibleText: (text.textContent ?? '').trim(),
        lineCount: Math.max(lineRects.length, 1),
        whiteSpace: styles?.whiteSpace ?? '',
        textOverflow: styles?.textOverflow ?? '',
        clipped: text.scrollHeight > text.clientHeight + 1,
      };
    });

    if (geometry.visibleText !== label) {
      throw new Error(
        `Rail label should show the full name "${label}", got "${geometry.visibleText}"`
      );
    }
    if (geometry.lineCount < 2) {
      throw new Error(
        `Rail label "${label}" should wrap onto two or more lines (got ${geometry.lineCount})`
      );
    }
    if (geometry.whiteSpace.includes('nowrap') || geometry.textOverflow === 'ellipsis') {
      throw new Error(
        `Rail label "${label}" is still truncating (white-space=${geometry.whiteSpace}, text-overflow=${geometry.textOverflow})`
      );
    }
    if (geometry.clipped) {
      throw new Error(`Rail label "${label}" is clipped; the wrapped name is not fully readable`);
    }
  }

  /** Long rail labels must not push the page (or the rail) sideways. */
  async expectNoHorizontalPageScroll(): Promise<void> {
    await this.waitForVisible();
    const overflow = await this.root().evaluate((rail) => {
      const doc = rail.ownerDocument.documentElement;
      const body = rail.ownerDocument.body;
      return {
        page: Math.max(doc.scrollWidth - doc.clientWidth, body.scrollWidth - body.clientWidth),
        rail: rail.scrollWidth - rail.clientWidth,
      };
    });
    const slack = 1;
    if (overflow.page > slack) {
      throw new Error(`Page scrolls horizontally by ${overflow.page}px from the rail`);
    }
    if (overflow.rail > slack) {
      throw new Error(`Rail scrolls horizontally by ${overflow.rail}px`);
    }
  }

  async openNewList(): Promise<void> {
    await this.openNewListDialog();
  }

  async createNamedList(
    name: string
  ): Promise<
    | { status: 'created'; id: string; name: string }
    | { status: 'empty' }
    | { status: 'duplicate' }
  > {
    const previousPile = new URL(this.page.url()).searchParams.get('pile');
    const dialog = await this.openNewListDialog();
    const nameInput = dialog.getByLabel('Name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(name);

    const createButton = dialog.getByRole('button', { name: 'Create list' });
    if (await createButton.isDisabled()) {
      await this.dismissNewListDialog();
      return { status: 'empty' };
    }

    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/lists') &&
        response.request().method() === 'POST'
    );
    await createButton.click();
    const response = await responsePromise;

    const duplicateError = dialog.locator('[data-list-create-error]');
    if (response.status() === 409) {
      await duplicateError.waitFor({ state: 'visible' });
      await this.dismissNewListDialog();
      return { status: 'duplicate' };
    }
    if (response.status() !== 201) {
      throw new Error(`Failed to create named list from the rail: ${response.status()}`);
    }

    await dialog.waitFor({ state: 'hidden' });
    await this.page.locator('[data-slot="dialog-overlay"]').waitFor({ state: 'detached' }).catch(() => undefined);
    await this.page.waitForURL((url) => {
      const pile = new URL(url).searchParams.get('pile');
      return Boolean(pile && pile !== previousPile && /^[0-9a-f-]{36}$/i.test(pile));
    });
    // Desktop keeps the rail visible. Mobile closes the drawer after landing
    // on the new pile so task content owns the screen.
    if (await this.root().isVisible().catch(() => false)) {
      await this.itemByLabel(name).waitFor({ state: 'visible' });
    }

    const pile = new URL(this.page.url()).searchParams.get('pile');
    if (!pile) {
      throw new Error(`Created list "${name}" from the rail did not land on that pile`);
    }
    return { status: 'created', id: pile, name };
  }

  private newListDialog() {
    return this.page.getByRole('dialog', { name: 'New list' });
  }

  private async openNewListDialog() {
    await this.waitForVisible();
    const dialog = this.newListDialog();

    for (let attempt = 0; attempt < 4; attempt++) {
      await this.dismissNewListDialog();
      const rail = await this.railForInteraction();
      const button = rail.locator('[data-rail-item="new-list"]');
      await this.clickRailControl(button);
      try {
        await dialog.waitFor({ state: 'visible', timeout: 2_500 });
        return dialog;
      } catch {
        // Overlay from the previous create ate the click. Retry.
      }
    }

    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  /** Close a leftover New list dialog only — never the mobile rail drawer. */
  private async dismissNewListDialog(): Promise<void> {
    const dialog = this.newListDialog();
    if (!(await dialog.isVisible().catch(() => false))) {
      return;
    }
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await dialog.waitFor({ state: 'hidden' });
  }

  overflowByLabel(label: string) {
    return this.root().locator(`[data-rail-overflow="${label}"]`);
  }

  async openOverflow(label: string): Promise<void> {
    const menu = this.page.getByRole('menu');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await menu.isVisible().catch(() => false)) {
        await this.page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' }).catch(() => undefined);
      }
      const rail = await this.railForInteraction();
      const overflow = rail.locator(`[data-rail-overflow="${label}"]`);
      await this.clickRailControl(overflow);
      try {
        await menu.waitFor({ state: 'visible', timeout: 2_500 });
        const box = await menu.boundingBox();
        if (box && box.y >= 0 && box.x + box.width > 0 && box.y + box.height > 0) {
          return;
        }
        // Drawer motion placed the menu off-screen. Close and retry.
      } catch {
        // Drawer motion ate the click. Reopen and retry.
      }
    }
    await menu.waitFor({ state: 'visible' });
  }

  /**
   * Overflow Delete on the always-visible desktop sidebar must be the
   * topmost hit at its center — not the rail clip or leftover drawer
   * chrome — and a real pointer click must reach it.
   */
  async expectOverflowMenuOnDesktopSidebar(label: string): Promise<void> {
    await this.desktop().waitFor({ state: 'visible' });
    const overflow = this.desktop().locator(`[data-rail-overflow="${label}"]`);
    await overflow.waitFor({ state: 'visible' });
    await overflow.click();

    const menu = this.page.locator(
      `[data-rail-overflow-menu="${label}"][data-rail-overflow-menu-surface="desktop"]`
    );
    const deleteItem = menu.getByRole('menuitem', { name: 'Delete', exact: true });
    await deleteItem.waitFor({ state: 'visible' });

    const box = await deleteItem.boundingBox();
    if (!box || box.y < 0 || box.x + box.width <= 0 || box.y + box.height <= 0) {
      throw new Error(`Delete menu for "${label}" opened off the viewport`);
    }

    const hit = await deleteItem.evaluate((node, point) => {
      const el = node.ownerDocument.elementFromPoint(point.x, point.y);
      if (!el) {
        return null;
      }
      const host = el.closest('[data-rail-overflow-menu]');
      return host?.getAttribute('data-rail-overflow-menu') ?? el.textContent;
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    if (hit !== label) {
      throw new Error(
        `Delete menu for "${label}" is not the topmost hit (found ${String(hit)})`
      );
    }

    await deleteItem.click();
    const dialog = this.page.getByRole('dialog', { name: 'Delete list?' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await this.desktop().waitFor({ state: 'visible' });
  }

  /**
   * Overflow Delete must be the topmost hit at its center — not the Vaul
   * drawer or overlay — and a real pointer click must reach it.
   */
  async expectOverflowMenuAboveDrawer(label: string): Promise<void> {
    await this.openMobileDrawer();
    await this.mobileTasks().waitFor({ state: 'visible' });
    const overflow = this.mobileTasks().locator(`[data-rail-overflow="${label}"]`);
    await overflow.waitFor({ state: 'visible' });
    for (let attempt = 0; attempt < 20; attempt++) {
      const box = await overflow.boundingBox();
      if (box && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0) {
        break;
      }
      await this.page.waitForTimeout(50);
    }
    await this.openOverflow(label);

    const menu = this.page.locator('[data-rail-overflow-menu]:visible');
    const deleteItem = menu.getByRole('menuitem', { name: 'Delete', exact: true });
    await deleteItem.waitFor({ state: 'visible' });

    const box = await deleteItem.boundingBox();
    if (!box || box.y < 0 || box.x + box.width <= 0 || box.y + box.height <= 0) {
      throw new Error(`Delete menu for "${label}" opened off the viewport`);
    }

    // A real pointer click fails if the Vaul overlay/sheet is still on top.
    await deleteItem.click();
    const dialog = this.page.getByRole('dialog', { name: 'Delete list?' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'hidden' });
    await this.mobileTasks().waitFor({ state: 'visible' });
  }

  async expectOverflowDoesNotNavigate(label: string): Promise<void> {
    const before = this.page.url();
    await this.openOverflow(label);
    await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).waitFor({
      state: 'visible',
    });
    if (this.page.url() !== before) {
      throw new Error(`Opening overflow for "${label}" navigated away from ${before}`);
    }
  }

  async deleteNamedList(
    name: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    await this.ensureAvailable();
    const previous = new URL(this.page.url());
    const listId = await this.itemByLabel(name).getAttribute('data-rail-list-id');
    const viewingDeletedPile =
      previous.pathname === '/tasks' &&
      !previous.searchParams.get('filter') &&
      Boolean(listId) &&
      previous.searchParams.get('pile') === listId;

    await this.openOverflow(name);
    const deleteItem = this.page.getByRole('menuitem', { name: 'Delete', exact: true });
    await deleteItem.waitFor({ state: 'visible' });
    await deleteItem.click();

    const dialog = this.page.getByRole('dialog', { name: 'Delete list?' });
    await dialog.waitFor({ state: 'visible' });
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/lists/') &&
        response.request().method() === 'DELETE'
    );
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    const response = await responsePromise;

    if (response.status() === 409) {
      await this.page.locator('[data-list-delete-error]').waitFor({ state: 'visible' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await dialog.waitFor({ state: 'hidden' });
      return { status: 'has-open-tasks' };
    }
    if (response.status() !== 204) {
      throw new Error(`Failed to delete named list from the rail: ${response.status()}`);
    }

    await dialog.waitFor({ state: 'hidden' });
    if (viewingDeletedPile) {
      await this.page.waitForURL((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get('filter') === 'today' && !parsed.searchParams.has('pile');
      });
    }
    return { status: 'deleted' };
  }
}
