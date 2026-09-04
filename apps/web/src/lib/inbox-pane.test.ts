import { describe, expect, it } from 'vitest';
import { INBOX_PANE_TABS, inboxPaneTabLabels, isInboxPanePath } from './inbox-pane';

describe('inbox pane tabs', () => {
  it('orders Inbox first, then Snoozed and Trash', () => {
    expect(inboxPaneTabLabels()).toEqual(['Inbox', 'Snoozed', 'Trash']);
    expect(INBOX_PANE_TABS.map((tab) => tab.to)).toEqual(['/', '/snoozed', '/trash']);
  });

  it('treats the three capture routes as the Inbox pane', () => {
    expect(isInboxPanePath('/')).toBe(true);
    expect(isInboxPanePath('/snoozed')).toBe(true);
    expect(isInboxPanePath('/trash')).toBe(true);
    expect(isInboxPanePath('/tasks')).toBe(false);
  });
});
