import type { Page } from '@playwright/test';

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

  async quickAdd(content: string): Promise<void> {
    await this.page.getByPlaceholder('Quick capture...').fill(content);
    await this.page.getByRole('button', { name: 'Add' }).click();
    // Wait for the capture to appear
    await this.page.getByText(content).waitFor();
  }

  async getCaptureContents(): Promise<string[]> {
    // Get all capture cards and extract their content
    const cards = this.page.locator('[data-slot="card"]');
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

  async archiveCapture(content: string): Promise<void> {
    // Find the card containing this content and click its archive button
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Archive' }).click();
    // Wait for the capture to disappear
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async pinCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Pin' }).click();
    // Wait for the pin action to complete - the button should now say "Unpin"
    await card.getByRole('button', { name: 'Unpin' }).waitFor();
  }

  async unpinCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Unpin' }).click();
    // Wait for the unpin action to complete - the button should now say "Pin"
    await card.getByRole('button', { name: 'Pin' }).waitFor();
  }

  async snoozeCapture(content: string, option: 'later-today' | 'tomorrow' | 'next-week'): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    // Click the snooze dropdown trigger
    await card.getByLabel('Snooze').click();
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

  async goToArchived(): Promise<void> {
    await this.page.getByRole('link', { name: 'Archived' }).click();
    await this.page.waitForURL('/archived');
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
    // Wait for redirect to config page
    await this.page.waitForURL('**/config');
  }

  async goBack(): Promise<void> {
    await this.page.getByRole('link', { name: 'Back' }).or(
      this.page.locator('a[href="/"]')
    ).click();
    await this.page.waitForURL('/');
  }
}

/**
 * Page object for the archived page (/archived).
 */
export class ArchivedPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/archived');
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('[data-slot="card"]');
  }

  async getCaptureContents(): Promise<string[]> {
    const cards = this.page.locator('[data-slot="card"]');
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

  async unarchiveCapture(content: string): Promise<void> {
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Move to inbox' }).click();
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async goToInbox(): Promise<void> {
    await this.page.getByRole('link', { name: 'Inbox' }).click();
    await this.page.waitForURL('/');
  }

  async isEmpty(): Promise<boolean> {
    const emptyMessage = this.page.getByText('No archived captures');
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

  async getCaptureContents(): Promise<string[]> {
    const cards = this.page.locator('[data-slot="card"]');
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
