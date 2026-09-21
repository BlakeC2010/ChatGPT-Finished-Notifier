'use strict';

importScripts('background-core.js');

const core = globalThis.ChatGPTNotifierBackgroundCore;

function makeNonce() {
  const randomPart = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

function clearNotification(notificationId) {
  chrome.notifications.clear(notificationId, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'CHATGPT_RESPONSE_COMPLETE') return;
  if (!sender.tab || !Number.isInteger(sender.tab.id)) return;

  const notificationId = core.makeNotificationId(sender.tab.id, makeNonce());

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'ChatGPT finished responding',
    message: 'Your response is ready.',
  }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const route = core.parseNotificationId(notificationId);
  if (!route) return;

  chrome.tabs.update(route.tabId, { active: true }, (tab) => {
    if (chrome.runtime.lastError || !tab || !Number.isInteger(tab.windowId)) {
      clearNotification(notificationId);
      return;
    }

    chrome.windows.update(tab.windowId, { focused: true }, () => {
      void chrome.runtime.lastError;
    });
    clearNotification(notificationId);
  });
});
