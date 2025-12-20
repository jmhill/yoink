// Content script to get selection and page info
// This script runs in the context of web pages

import type { GetPageInfoResponse, ExtensionMessage } from '@/lib/messages';

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: GetPageInfoResponse) => void
  ) => {
    if (message.type === 'GET_PAGE_INFO') {
      const selection = window.getSelection()?.toString() || '';
      sendResponse({
        selection,
        url: window.location.href,
        title: document.title,
      });
    }
    return true; // Keep channel open for async response
  }
);
