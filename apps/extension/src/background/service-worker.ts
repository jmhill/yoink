// Background service worker for context menu and keyboard shortcut handling

import { createCaptureApi } from '@/lib/api-client';

// Helper to show notifications with unique IDs
const showNotification = (
  type: 'success' | 'error' | 'info',
  message: string
) => {
  const notificationId = `yoink-${type}-${Date.now()}`;
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Yoink',
    message,
  });
};

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  // Remove existing menu items first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'yoink-capture',
      title: 'Capture with Yoink',
      contexts: ['selection'],
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'yoink-capture' || !info.selectionText) {
    return;
  }

  // Handle async capture in a separate function to avoid issues with event listener
  handleCapture(info.selectionText, tab?.url);
});

// Handle keyboard shortcut for quick capture
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'quick-capture' && tab?.id) {
    // Get selected text from the active tab
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || '',
      },
      (results) => {
        if (chrome.runtime.lastError) {
          showNotification('error', 'Cannot capture from this page');
          return;
        }
        
        const selectedText = results?.[0]?.result;
        if (selectedText) {
          handleCapture(selectedText, tab.url);
        } else {
          showNotification('info', 'Please select some text first');
        }
      }
    );
  }
});

// Async capture handler
async function handleCapture(text: string, sourceUrl?: string) {
  try {
    const api = await createCaptureApi();
    
    if (!api) {
      showNotification('info', 'Please configure your API settings first.');
      chrome.runtime.openOptionsPage();
      return;
    }

    const response = await api.create({
      body: {
        content: text,
        sourceUrl,
        sourceApp: 'browser-extension',
      },
    });

    if (response.status === 201) {
      showNotification('success', 'Captured successfully!');
    } else if (response.status === 401) {
      showNotification('error', 'Invalid API token. Please check your settings.');
    } else {
      showNotification('error', `Failed to capture: ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to capture';
    showNotification('error', message);
  }
}

export {};
