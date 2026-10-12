import { describe, expect, it } from 'vitest';
import { CheckSquare, FolderKanban, Inbox, ListFilter } from 'lucide-react';
import {
  MOBILE_TABS,
  activeMobileTab,
  mobileTabLabels,
  processBadgeCount,
  reviewBadgeCount,
} from './mobile-tabs';

describe('mobile tabs', () => {
  it('orders Capture, Process, Work, Review with the locked icons', () => {
    expect(mobileTabLabels()).toEqual(['Capture', 'Process', 'Work', 'Review']);
    expect(MOBILE_TABS.map((tab) => tab.key)).toEqual([
      'capture',
      'process',
      'work',
      'review',
    ]);
    expect(MOBILE_TABS.map((tab) => tab.to)).toEqual([
      '/',
      '/process',
      '/work',
      '/projects',
    ]);
    expect(MOBILE_TABS.map((tab) => tab.icon)).toEqual([
      Inbox,
      ListFilter,
      CheckSquare,
      FolderKanban,
    ]);
  });

  it('lights Capture on the inbox pane routes', () => {
    expect(activeMobileTab('/')).toBe('capture');
    expect(activeMobileTab('/snoozed')).toBe('capture');
    expect(activeMobileTab('/trash')).toBe('capture');
  });

  it('lights Process only on /process', () => {
    expect(activeMobileTab('/process')).toBe('process');
  });

  it('lights Work on Now, Tasks piles, and leftover Lists URLs', () => {
    expect(activeMobileTab('/work')).toBe('work');
    expect(activeMobileTab('/tasks')).toBe('work');
    expect(activeMobileTab('/lists')).toBe('work');
    expect(activeMobileTab('/lists/unlisted')).toBe('work');
    expect(activeMobileTab('/lists/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'work'
    );
  });

  it('lights Review on the project list, a project page, and import preview', () => {
    expect(activeMobileTab('/projects')).toBe('review');
    expect(activeMobileTab('/projects/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'review'
    );
    expect(
      activeMobileTab('/projects/imports/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    ).toBe('review');
  });

  it('lights no tab on Settings or an unknown path', () => {
    expect(activeMobileTab('/settings')).toBeNull();
    expect(activeMobileTab('/not-a-route')).toBeNull();
  });
});

describe('processBadgeCount', () => {
  it('hides the badge at zero and shows a positive inbox total', () => {
    expect(processBadgeCount(0)).toBeNull();
    expect(processBadgeCount(19)).toBe(19);
  });
});

describe('reviewBadgeCount', () => {
  it('hides the badge at zero and shows a positive attention total', () => {
    expect(reviewBadgeCount(0)).toBeNull();
    expect(reviewBadgeCount(2)).toBe(2);
  });
});
