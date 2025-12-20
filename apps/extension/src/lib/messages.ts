/**
 * Message types for communication between extension contexts
 * (popup, background, content scripts)
 */

export type GetPageInfoMessage = {
  type: 'GET_PAGE_INFO';
};

export type GetPageInfoResponse = {
  selection: string;
  url: string;
  title: string;
};

export type CaptureFromContextMenuMessage = {
  type: 'CAPTURE_FROM_CONTEXT_MENU';
  selection: string;
  url: string;
};

export type ExtensionMessage =
  | GetPageInfoMessage
  | CaptureFromContextMenuMessage;

/**
 * Request page info from the content script of the active tab
 */
export async function getPageInfo(): Promise<GetPageInfoResponse | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return null;
    }

    const response = await chrome.tabs.sendMessage<GetPageInfoMessage, GetPageInfoResponse>(
      tab.id,
      { type: 'GET_PAGE_INFO' }
    );

    return response;
  } catch {
    // Content script might not be loaded (e.g., on chrome:// pages)
    return null;
  }
}

/**
 * Get basic page info from the active tab (fallback when content script unavailable)
 */
export async function getActiveTabInfo(): Promise<{ url: string; title: string } | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return null;
    }

    return {
      url: tab.url ?? '',
      title: tab.title ?? '',
    };
  } catch {
    return null;
  }
}
