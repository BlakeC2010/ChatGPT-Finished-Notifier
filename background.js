'use strict';

importScripts('background-core.js');

const core = globalThis.ChatGPTNotifierBackgroundCore;
const NOTIFICATION_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADNElEQVR42u3dO1IbQRRGYU2XlsGjxAIcE5J7EU7Zhcu7IPUinCsk9gJM+bEPHBHYhaTRqKdf9zsRVYDQ9H/u7Yc0YrMBAAAAAARiKv0Hr252r4b9MH9+vUxDCSDwtoWYBB9bhEnwsUWYBB9bhCT8Psk15kn4sSVIwo8tQRJ+bAmS8GNLkIQfW4Ik/NgSJEMWm6T6Y3cBHUAHUP2Ru8DWUK3Hh/2ng9/7/vC1iec4qf5yodeQ4dSLRgSoGHwJEU4JYBHYSPg5H8c5QIfh15Igaf/thZXzcU9lqAM0WqmlOgEBGg6nxN8hQAM8Pzy1eQ5gDbB+Vf4f/v3+Mfv28NhWUAdorPKfH56KdoTwAvz++aO55/ReFzAFFAz8+vZu9fZ/qMoPhX/JNHBsCtiq7nm/d0iK3hZ9YaaA3K19zuPNCfbYz5Rs/UMLUGNefwt2aXXXCH9IAWqGf6rKz533CXBm8LVW9O8FOFcKa4BBtnLHJGht3h9qG1g6/I8vX7Kt8OeG7ySw4cpfGmrtyh9+G9iDBATosPq/7T5fLME5gqz97mEdoEAnuN8//vN1S3S7CKw9/59aDOYgV/UPtwhsYfE3dyqoHb4poEMJSt41lFR/WxKUvmVMB2hIghr3C7o5NLMESxaHNW8U7WoX0OLJ3yGub++auTs47DuCatPKLeDWACAACAACgAAgAAgAAoAAIAABQAAQAAQAARqmp/cC9PR8dQAdQDVFft5bA1jmGnJ+xlCIDjBC+D1cTzJYsa8rGaTY12cXYBcAAoAAIEATtLpfHvX6kkGKfV3JYMW+nm20Qbvk/wVYA3TO3EOY0Q+jQgpwbqhRJLANtA1U/ZG7gA6gA4AAIAAIMCxLD3YiHAjpADpADM6t5ijHwaE6wNxQI70WEO6TQt/CXfv/AxNg0IWhKQAEQBABjn3MOPrgVIY6gA4AAoAA1gHx5n8dAPME0AXGrH4dAPMF0AXGq34dAOcJoAuMVf2LOgAJxgl/8RRAgjHCv2gNQIL+w794EUiCvsPPsgsgQb/hZ9sGkqDP8DebzSZ7cFc3u1fxtB/8agIQoY/gVxeACG0HX0wAQlhPAQAAAACa4S9ZFnZODus74AAAAABJRU5ErkJggg==';
const TOAST_WIDTH = 400;
const TOAST_HEIGHT = 150;
const TOAST_MARGIN = 18;
const KNOWN_PROVIDERS = new Set(['ChatGPT', 'Claude', 'Gemini', 'Grok', 'Kimi', 'Meta AI']);

function cleanProvider(provider) {
  const value = String(provider || '').trim();
  return KNOWN_PROVIDERS.has(value) ? value : '';
}

function clearNotification(notificationId) {
  chrome.notifications.clear(notificationId, () => {
    void chrome.runtime.lastError;
  });
}

function focusTab(tabId, callback) {
  chrome.tabs.update(tabId, { active: true }, (tab) => {
    if (chrome.runtime.lastError || !tab || !Number.isInteger(tab.windowId)) {
      callback?.(false);
      return;
    }

    chrome.windows.update(tab.windowId, { focused: true }, () => {
      const ok = !chrome.runtime.lastError;
      callback?.(ok);
    });
  });
}

function notificationCopy(provider) {
  const name = cleanProvider(provider);
  if (!name) {
    return {
      title: 'Response ready',
      message: 'Your AI chat finished responding.',
    };
  }

  return {
    title: name + ' response ready',
    message: name + ' finished responding.',
  };
}

function createSystemNotification(tabId, completionId, provider, callback) {
  let notificationId;
  try {
    notificationId = core.makeNotificationId(tabId, completionId);
  } catch (_) {
    callback(false);
    return;
  }

  const copy = notificationCopy(provider);
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: NOTIFICATION_ICON,
    title: copy.title,
    message: copy.message,
    contextMessage: 'Click to return to your chat',
    buttons: [{ title: 'Open chat' }],
  }, () => {
    callback(!chrome.runtime.lastError);
  });
}

function createBrowserToast(tabId, provider, anchorWindow, callback) {
  const bounds = core.computeToastBounds(anchorWindow, TOAST_WIDTH, TOAST_HEIGHT, TOAST_MARGIN);
  const name = cleanProvider(provider);
  let url = chrome.runtime.getURL('toast.html') + '?tab=' + encodeURIComponent(tabId);
  if (name) url += '&provider=' + encodeURIComponent(name);

  chrome.windows.create({
    url,
    type: 'popup',
    focused: false,
    ...bounds,
  }, (createdWindow) => {
    callback(!chrome.runtime.lastError && Boolean(createdWindow));
  });
}

function deliverNotification(tabId, completionId, requestedMode, provider, callback) {
  chrome.storage.sync.get({ notificationMode: 'auto' }, (settings) => {
    const storedMode = settings && settings.notificationMode;
    const mode = core.normalizeNotificationMode(requestedMode || storedMode);

    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
      const normalWindows = Array.isArray(windows) ? windows : [];
      const focusedWindow = normalWindows.find((windowInfo) => windowInfo.focused) || null;
      const deliveryMode = core.chooseDeliveryMode(mode, Boolean(focusedWindow));

      if (deliveryMode === 'browser') {
        const anchorWindow = focusedWindow || normalWindows[0] || null;
        createBrowserToast(tabId, provider, anchorWindow, (ok) => {
          if (ok || mode !== 'auto') {
            callback(ok);
            return;
          }
          createSystemNotification(tabId, completionId, provider, callback);
        });
        return;
      }

      createSystemNotification(tabId, completionId, provider, callback);
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (!details || details.reason !== 'install') return;
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'OPEN_CHAT') {
    const tabId = core.parseTargetTabId(message.tabId);
    if (tabId === null) {
      sendResponse({ ok: false });
      return false;
    }
    focusTab(tabId, (ok) => sendResponse({ ok }));
    return true;
  }

  if (!sender.tab || !Number.isInteger(sender.tab.id)) return false;

  if (message.type === 'TEST_NOTIFICATION') {
    const completionId = 'test-' + Date.now().toString(36);
    deliverNotification(sender.tab.id, completionId, message.mode, '', (ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type !== 'CHATGPT_RESPONSE_COMPLETE') return false;

  const completionId = typeof message.completionId === 'string'
    ? message.completionId.trim()
    : '';
  if (!completionId) {
    sendResponse({ ok: false });
    return false;
  }

  deliverNotification(sender.tab.id, completionId, null, message.provider, (ok) => sendResponse({ ok }));
  return true;
});

function handleSystemNotificationAction(notificationId) {
  const route = core.parseNotificationId(notificationId);
  if (!route) return;

  focusTab(route.tabId, () => {
    clearNotification(notificationId);
  });
}

chrome.notifications.onClicked.addListener(handleSystemNotificationAction);
chrome.notifications.onButtonClicked.addListener((notificationId) => {
  handleSystemNotificationAction(notificationId);
});
