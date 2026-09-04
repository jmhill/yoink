import type { Page, CDPSession, Locator } from '@playwright/test';
import type { TaskFilter } from '../../dsl/types.js';

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
    const addButton = this.page.getByRole('button', { name: 'Add' });
    
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
      const contentElement = card.locator('p').first();
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
      const contentElement = card.locator('p').first();
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
      const contentElement = card.locator('p').first();
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
      const contentElement = card.locator('p').first();
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
      const contentElement = card.locator('p').first();
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
      const contentElement = card.locator('p').first();
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

  async goto(filter: TaskFilter = 'all'): Promise<void> {
    await this.page.goto(`/tasks?filter=${filter}`);
  }

  async openFilter(filter: TaskFilter): Promise<void> {
    const name = {
      today: 'Today',
      upcoming: /Upcoming|Soon/,
      all: 'All',
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
    await Promise.race([
      this.page.locator('[data-task-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No tasks yet').waitFor({ state: 'attached' }),
      this.page.getByText('No tasks for today').waitFor({ state: 'attached' }),
      this.page.getByText('No tasks assigned to you').waitFor({ state: 'attached' }),
      this.page.getByText('No upcoming tasks').waitFor({ state: 'attached' }),
      this.page.getByText('No completed tasks').waitFor({ state: 'attached' }),
      this.page.getByText('No open tasks on this list').waitFor({ state: 'attached' }),
      this.page.getByText('No open unlisted tasks').waitFor({ state: 'attached' }),
      this.page.getByText('No tasks assigned to you on this list').waitFor({ state: 'attached' }),
      this.page.getByText('No unlisted tasks assigned to you').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, let the test continue (it will fail if data is missing)
    });
  }

  taskCard(taskId: string) {
    return this.page.locator(`[data-task-id="${taskId}"]`);
  }

  async waitForTask(taskId: string): Promise<void> {
    await this.taskCard(taskId).waitFor({ state: 'visible' });
  }

  async openEdit(taskId: string): Promise<void> {
    const card = this.taskCard(taskId);
    await card.locator('p').first().click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible' });
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
    await this.page.getByRole('button', { name: 'Add' }).click();
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

  async waitForPileSelect(): Promise<void> {
    await this.page.locator('#all-pile').waitFor({ state: 'visible' });
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
    await this.goto('all');
    await this.waitForPileSelect();
    const previousPile = new URL(this.page.url()).searchParams.get('pile');

    await this.openNewListFromPileSelect();

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
      throw new Error(`Created list "${name}" did not land on one-pile All`);
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
      return parsed.searchParams.get('filter') === 'all' && !parsed.searchParams.has('pile');
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

  pinButtons() {
    return this.page.getByRole('button', { name: /^(Pin|Unpin) task/ });
  }

  async getNamedPiles(): Promise<Array<{ id: string; name: string }>> {
    await this.waitForPileSelect();
    await this.closePileSelect();
    await this.page.locator('#all-pile').click();
    const listbox = this.page.getByRole('listbox');
    await listbox.waitFor({ state: 'visible' });
    const items = listbox.locator('[data-slot="select-item"]:not([data-all-pile-new-list])');
    const count = await items.count();
    const lists: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const id = await item.getAttribute('data-value');
      const name = (await item.innerText()).trim();
      if (id && /^[0-9a-f-]{36}$/i.test(id) && name) {
        lists.push({ id, name });
      }
    }
    await this.closePileSelect();
    return lists;
  }

  async gotoNamedPile(listId: string): Promise<void> {
    await this.page.goto(`/tasks?filter=all&pile=${listId}`);
    await this.waitForPileSelect();
    await this.waitForTasksOrEmpty();
  }

  async gotoUnlistedPile(): Promise<void> {
    await this.page.goto('/tasks?filter=all&pile=unlisted');
    await this.waitForPileSelect();
    await this.waitForTasksOrEmpty();
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
    const card = this.page.locator(`[data-open-task-title="${title}"]`);
    await card.waitFor({ state: 'attached' });
    const button = card.getByRole('button', { name: `Move ${title} ${direction}` });
    await button.waitFor({ state: 'visible' });
    const before = await this.getOpenTaskTitles();
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/tasks/order') && response.request().method() === 'PUT'
    );
    await button.click();
    await responsePromise;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const after = await this.getOpenTaskTitles();
      if (after.join('\0') !== before.join('\0')) {
        return;
      }
      await this.page.waitForTimeout(50);
    }
  }

  async deleteNamedListById(
    id: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    await this.gotoNamedPile(id);
    const lists = await this.getNamedPiles();
    const list = lists.find((item) => item.id === id);
    if (!list) {
      throw new Error(`Named list ${id} not found in All pile dropdown`);
    }
    return this.deleteNamedListFromAll(list.name);
  }
}

/**
 * Desktop app rail (Inbox, smart views, named lists, Unlisted, New list).
 * Hidden below the md breakpoint; Playwright’s default viewport is desktop.
 */
export class AppRail {
  constructor(private readonly page: Page) {}

  root() {
    return this.page.locator('[data-app-rail]');
  }

  async waitForVisible(): Promise<void> {
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
   * Rail visual order including the Lists heading (not a rail item).
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
      const label = await node.getAttribute('data-rail-label');
      if (label) {
        labels.push(label);
      }
    }
    return labels;
  }

  async openItem(label: string): Promise<void> {
    await this.waitForVisible();
    const item = this.itemByLabel(label);
    await item.waitFor({ state: 'visible' });
    await item.click();
  }

  async isItemActive(label: string): Promise<boolean> {
    await this.waitForVisible();
    return (await this.itemByLabel(label).getAttribute('data-rail-active')) === 'true';
  }

  async openNewList(): Promise<void> {
    await this.waitForVisible();
    const button = this.root().locator('[data-rail-item="new-list"]');
    await button.waitFor({ state: 'visible' });
    await button.click();
  }

  async createNamedList(
    name: string
  ): Promise<
    | { status: 'created'; id: string; name: string }
    | { status: 'empty' }
    | { status: 'duplicate' }
  > {
    const previousPile = new URL(this.page.url()).searchParams.get('pile');
    await this.openNewList();

    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const nameInput = dialog.getByLabel('Name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(name);

    const createButton = dialog.getByRole('button', { name: 'Create list' });
    if (await createButton.isDisabled()) {
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
      return { status: 'duplicate' };
    }
    if (response.status() !== 201) {
      throw new Error(`Failed to create named list from the rail: ${response.status()}`);
    }

    await this.page.waitForURL((url) => {
      const pile = new URL(url).searchParams.get('pile');
      return Boolean(pile && pile !== previousPile && /^[0-9a-f-]{36}$/i.test(pile));
    });

    if (await duplicateError.isVisible()) {
      return { status: 'duplicate' };
    }

    const pile = new URL(this.page.url()).searchParams.get('pile');
    if (!pile) {
      throw new Error(`Created list "${name}" from the rail did not land on one-pile All`);
    }
    return { status: 'created', id: pile, name };
  }

  overflowByLabel(label: string) {
    return this.root().locator(`[data-rail-overflow="${label}"]`);
  }

  async openOverflow(label: string): Promise<void> {
    await this.waitForVisible();
    const overflow = this.overflowByLabel(label);
    await overflow.waitFor({ state: 'visible' });
    await overflow.click();
    await this.page.getByRole('menu').waitFor({ state: 'visible' });
  }

  async deleteNamedList(
    name: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    const previous = new URL(this.page.url());
    const listId = await this.itemByLabel(name).getAttribute('data-rail-list-id');
    const viewingDeletedPile =
      previous.pathname === '/tasks' &&
      previous.searchParams.get('filter') === 'all' &&
      Boolean(listId) &&
      previous.searchParams.get('pile') === listId;

    await this.openOverflow(name);
    const deleteItem = this.page.getByRole('menuitem', { name: 'Delete', exact: true });
    await deleteItem.waitFor({ state: 'visible' });
    await deleteItem.press('Enter');

    const dialog = this.page.getByRole('dialog');
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
      await this.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
      await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
      return { status: 'has-open-tasks' };
    }
    if (response.status() !== 204) {
      throw new Error(`Failed to delete named list from the rail: ${response.status()}`);
    }

    await this.page.getByRole('dialog').waitFor({ state: 'hidden' });
    if (viewingDeletedPile) {
      await this.page.waitForURL((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get('filter') === 'all' && !parsed.searchParams.has('pile');
      });
    }
    return { status: 'deleted' };
  }
}
