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

  async archiveCapture(content: string): Promise<void> {
    // Find the card containing this content and click its archive button
    const card = this.page.locator('[data-slot="card"]').filter({ hasText: content });
    await card.hover();
    await card.getByRole('button', { name: 'Archive' }).click();
    // Wait for the capture to disappear
    await this.page.getByText(content).waitFor({ state: 'hidden' });
  }

  async goToArchived(): Promise<void> {
    await this.page.getByRole('link', { name: 'Archived' }).click();
    await this.page.waitForURL('/archived');
  }

  async isEmpty(): Promise<boolean> {
    const emptyMessage = this.page.getByText('Your inbox is empty');
    return await emptyMessage.isVisible();
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
