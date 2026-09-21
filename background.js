'use strict';

importScripts('background-core.js');

const core = globalThis.ChatGPTNotifierBackgroundCore;
const NOTIFICATION_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADNElEQVR42u3dO1IbQRRGYU2XlsGjxAIcE5J7EU7Zhcu7IPUinCsk9gJM+bEPHBHYhaTRqKdf9zsRVYDQ9H/u7Yc0YrMBAAAAAARiKv0Hr252r4b9MH9+vUxDCSDwtoWYBB9bhEnwsUWYBB9bhCT8Psk15kn4sSVIwo8tQRJ+bAmS8GNLkIQfW4Ik/NgSJEMWm6T6Y3cBHUAHUP2Ru8DWUK3Hh/2ng9/7/vC1iec4qf5yodeQ4dSLRgSoGHwJEU4JYBHYSPg5H8c5QIfh15Igaf/thZXzcU9lqAM0WqmlOgEBGg6nxN8hQAM8Pzy1eQ5gDbB+Vf4f/v3+Mfv28NhWUAdorPKfH56KdoTwAvz++aO55/ReFzAFFAz8+vZu9fZ/qMoPhX/JNHBsCtiq7nm/d0iK3hZ9YaaA3K19zuPNCfbYz5Rs/UMLUGNefwt2aXXXCH9IAWqGf6rKz533CXBm8LVW9O8FOFcKa4BBtnLHJGht3h9qG1g6/I8vX7Kt8OeG7ySw4cpfGmrtyh9+G9iDBATosPq/7T5fLME5gqz97mEdoEAnuN8//vN1S3S7CKw9/59aDOYgV/UPtwhsYfE3dyqoHb4poEMJSt41lFR/WxKUvmVMB2hIghr3C7o5NLMESxaHNW8U7WoX0OLJ3yGub++auTs47DuCatPKLeDWACAACAACgAAgAAgAAoAAIAABQAAQAAQAARqmp/cC9PR8dQAdQDVFft5bA1jmGnJ+xlCIDjBC+D1cTzJYsa8rGaTY12cXYBcAAoAAIEATtLpfHvX6kkGKfV3JYMW+nm20Qbvk/wVYA3TO3EOY0Q+jQgpwbqhRJLANtA1U/ZG7gA6gA4AAIAAIMCxLD3YiHAjpADpADM6t5ijHwaE6wNxQI70WEO6TQt/CXfv/AxNg0IWhKQAEQBABjn3MOPrgVIY6gA4AAoAA1gHx5n8dAPME0AXGrH4dAPMF0AXGq34dAOcJoAuMVf2LOgAJxgl/8RRAgjHCv2gNQIL+w794EUiCvsPPsgsgQb/hZ9sGkqDP8DebzSZ7cFc3u1fxtB/8agIQoY/gVxeACG0HX0wAQlhPAQAAAACa4S9ZFnZODus74AAAAABJRU5ErkJggg==';

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
    iconUrl: NOTIFICATION_ICON,
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
