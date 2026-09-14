import { describe, expect, it } from 'vitest';
import {
  INBOX_PANE_TABS,
  INBOX_TRIAGE_HEADING,
  inboxPaneTabLabels,
  inboxTriageSubcopy,
  isInboxPanePath,
} from './inbox-pane';

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

describe('inbox triage heading', () => {
  it('keeps the pane titled Inbox', () => {
    expect(INBOX_TRIAGE_HEADING).toBe('Inbox');
  });

  it('reads as triage and references, not open tasks', () => {
    expect(inboxTriageSubcopy(0)).toBe('0 to process · references & triage');
    expect(inboxTriageSubcopy(1)).toBe('1 to process · references & triage');
    expect(inboxTriageSubcopy(4)).toBe('4 to process · references & triage');
    expect(inboxTriageSubcopy(4)).not.toMatch(/open tasks/i);
  });
});
