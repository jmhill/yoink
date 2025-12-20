// Background service worker for context menu and keyboard shortcut handling

import { createCaptureApi } from '@/lib/api-client';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'yoink-capture',
    title: 'Capture with Yoink',
    contexts: ['selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'yoink-capture' || !info.selectionText) {
    return;
  }

  const api = await createCaptureApi();
  if (!api) {
    // Not configured - show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Yoink',
      message: 'Please configure your API settings first.',
    });
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const response = await api.create({
      body: {
        content: info.selectionText,
        sourceUrl: tab?.url,
        sourceApp: 'browser-extension',
      },
    });

    if (response.status === 201) {
      // Show success notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Yoink',
        message: 'Captured successfully!',
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Yoink',
        message: `Failed to capture: ${response.status}`,
      });
    }
  } catch (error) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Yoink',
      message: error instanceof Error ? error.message : 'Failed to capture',
    });
  }
});

export {};
