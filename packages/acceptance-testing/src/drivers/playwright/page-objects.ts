import type { Page, CDPSession } from '@playwright/test';
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
    await this.page.getByRole('link', { name: 'Snoozed' }).click();
    await this.page.waitForURL('/snoozed');
  }

  async goToTrash(): Promise<void> {
    await this.page.getByRole('link', { name: 'Trash' }).click();
    await this.page.waitForURL('/trash');
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
    await this.page.getByRole('link', { name: 'Inbox' }).click();
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
    await this.page.getByRole('link', { name: 'Inbox' }).click();
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
    await Promise.race([
      this.page.locator('[data-task-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No tasks yet').waitFor({ state: 'attached' }),
      this.page.getByText('No tasks for today').waitFor({ state: 'attached' }),
      this.page.getByText('No tasks assigned to you').waitFor({ state: 'attached' }),
      this.page.getByText('No upcoming tasks').waitFor({ state: 'attached' }),
      this.page.getByText('No open tasks on this list').waitFor({ state: 'attached' }),
      this.page.getByText('No open unlisted tasks').waitFor({ state: 'attached' }),
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
    const option = this.page.locator(`[data-slot="select-item"][data-value="${listId}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
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

  async selectAllPile(value: string): Promise<void> {
    await this.waitForPileSelect();
    await this.page.locator('#all-pile').click();
    const option = this.page.locator(`[data-slot="select-item"][data-value="${value}"]`);
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  async selectAllNamedPile(name: string): Promise<void> {
    await this.waitForPileSelect();
    await this.page.locator('#all-pile').click();
    const option = this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: new RegExp(`^${name}$`) });
    await option.waitFor({ state: 'visible' });
    await option.click();
    await this.page.waitForURL(/[?&]pile=[0-9a-f-]{36}/i);
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
    const group = this.page.locator(`[data-pile-name="${groupName}"]`);
    const cards = group.locator('[data-task-id]');
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
}

/**
 * Page object for the named lists view (/lists).
 */
export class ListsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/lists');
  }

  async waitForListsOrEmpty(): Promise<void> {
    await Promise.race([
      this.page.locator('[data-list-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No named lists yet').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, let the test continue (it will fail if data is missing)
    });
  }

  async getLists(): Promise<Array<{ id: string; name: string }>> {
    const cards = this.page.locator('[data-list-id]');
    const count = await cards.count();
    const lists: Array<{ id: string; name: string }> = [];

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const id = await card.getAttribute('data-list-id');
      const name = await card.getAttribute('data-list-name');
      if (id && name) {
        lists.push({ id, name });
      }
    }

    return lists;
  }

  async createNamedList(
    name: string
  ): Promise<
    | { status: 'created'; id: string; name: string }
    | { status: 'empty' }
    | { status: 'duplicate' }
  > {
    await this.goto();
    await this.waitForListsOrEmpty();

    const existingIds = (await this.getLists()).map((list) => list.id);

    await this.page.getByRole('button', { name: 'New list' }).click();
    const nameInput = this.page.getByLabel('Name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(name);

    const createButton = this.page.getByRole('button', { name: 'Create list' });
    if (await createButton.isDisabled()) {
      return { status: 'empty' };
    }

    await createButton.click();

    const duplicateError = this.page.locator('[data-list-create-error]');
    await Promise.race([
      duplicateError.waitFor({ state: 'visible' }),
      this.page
        .locator('[data-list-id]')
        .nth(existingIds.length)
        .waitFor({ state: 'attached' }),
    ]);

    if (await duplicateError.isVisible()) {
      return { status: 'duplicate' };
    }

    const lists = await this.getLists();
    const created = lists.find((list) => !existingIds.includes(list.id));
    if (!created) {
      throw new Error(`Created list "${name}" did not appear`);
    }
    return { status: 'created', id: created.id, name: created.name };
  }

  async deleteNamedList(
    id: string
  ): Promise<{ status: 'deleted' } | { status: 'has-open-tasks' }> {
    await this.goto();
    await this.waitForListsOrEmpty();

    const card = this.page.locator(`[data-list-id="${id}"]`);
    await card.waitFor({ state: 'attached' });
    await card.getByRole('button', { name: /^Delete / }).click();

    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    const deleteError = this.page.locator('[data-list-delete-error]');
    await Promise.race([
      deleteError.waitFor({ state: 'visible' }),
      card.waitFor({ state: 'detached' }),
      this.page.getByText('No named lists yet').waitFor({ state: 'attached' }),
    ]);

    if (await deleteError.isVisible()) {
      return { status: 'has-open-tasks' };
    }

    return { status: 'deleted' };
  }

  async isEmpty(): Promise<boolean> {
    return await this.page.getByText('No named lists yet').isVisible();
  }

  async openNamedList(name: string): Promise<void> {
    await this.goto();
    await this.waitForListsOrEmpty();
    await this.page.locator(`[data-list-name="${name}"]`).getByRole('link', { name }).click();
    await this.page.waitForURL('**/lists/**');
    await this.waitForOpenTasksOrEmpty();
  }

  async openNamedListById(listId: string): Promise<void> {
    await this.page.goto(`/lists/${listId}`);
    await this.waitForOpenTasksOrEmpty();
  }

  async waitForOpenTasksOrEmpty(): Promise<void> {
    await Promise.race([
      this.page.locator('[data-open-task-id]').first().waitFor({ state: 'attached' }),
      this.page.getByText('No open tasks on this list').waitFor({ state: 'attached' }),
      this.page.getByText('No open unlisted tasks').waitFor({ state: 'attached' }),
      this.page.getByText('List not found').waitFor({ state: 'attached' }),
    ]).catch(() => {
      // If neither appears, let the test continue
    });
  }

  async openUnlistedPile(): Promise<void> {
    await this.goto();
    await this.waitForListsOrEmpty();
    await this.page.locator('[data-unlisted-pile]').getByRole('link', { name: 'Unlisted' }).click();
    await this.page.waitForURL('**/lists/unlisted');
    await this.waitForOpenTasksOrEmpty();
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
}
