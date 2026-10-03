'use strict';

importScripts('background-core.js');

const core = globalThis.ChatGPTNotifierBackgroundCore;
const GENERIC_NOTIFICATION_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADNElEQVR42u3dO1IbQRRGYU2XlsGjxAIcE5J7EU7Zhcu7IPUinCsk9gJM+bEPHBHYhaTRqKdf9zsRVYDQ9H/u7Yc0YrMBAAAAAARiKv0Hr252r4b9MH9+vUxDCSDwtoWYBB9bhEnwsUWYBB9bhCT8Psk15kn4sSVIwo8tQRJ+bAmS8GNLkIQfW4Ik/NgSJEMWm6T6Y3cBHUAHUP2Ru8DWUK3Hh/2ng9/7/vC1iec4qf5yodeQ4dSLRgSoGHwJEU4JYBHYSPg5H8c5QIfh15Igaf/thZXzcU9lqAM0WqmlOgEBGg6nxN8hQAM8Pzy1eQ5gDbB+Vf4f/v3+Mfv28NhWUAdorPKfH56KdoTwAvz++aO55/ReFzAFFAz8+vZu9fZ/qMoPhX/JNHBsCtiq7nm/d0iK3hZ9YaaA3K19zuPNCfbYz5Rs/UMLUGNefwt2aXXXCH9IAWqGf6rKz533CXBm8LVW9O8FOFcKa4BBtnLHJGht3h9qG1g6/I8vX7Kt8OeG7ySw4cpfGmrtyh9+G9iDBATosPq/7T5fLME5gqz97mEdoEAnuN8//vN1S3S7CKw9/59aDOYgV/UPtwhsYfE3dyqoHb4poEMJSt41lFR/WxKUvmVMB2hIghr3C7o5NLMESxaHNW8U7WoX0OLJ3yGub++auTs47DuCatPKLeDWACAACAACgAAgAAgAAoAAIAABQAAQAAQAARqmp/cC9PR8dQAdQDVFft5bA1jmGnJ+xlCIDjBC+D1cTzJYsa8rGaTY12cXYBcAAoAAIEATtLpfHvX6kkGKfV3JYMW+nm20Qbvk/wVYA3TO3EOY0Q+jQgpwbqhRJLANtA1U/ZG7gA6gA4AAIAAIMCxLD3YiHAjpADpADM6t5ijHwaE6wNxQI70WEO6TQt/CXfv/AxNg0IWhKQAEQBABjn3MOPrgVIY6gA4AAoAA1gHx5n8dAPME0AXGrH4dAPMF0AXGq34dAOcJoAuMVf2LOgAJxgl/8RRAgjHCv2gNQIL+w794EUiCvsPPsgsgQb/hZ9sGkqDP8DebzSZ7cFc3u1fxtB/8agIQoY/gVxeACG0HX0wAQlhPAQAAAACa4S9ZFnZODus74AAAAABJRU5ErkJggg==';
const KNOWN_PROVIDERS = new Set(['ChatGPT', 'Claude', 'Gemini']);
const SUPPORTED_URL_PATTERNS = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
];
const CONTENT_SCRIPT_FILES = ['providers.js', 'content-core.js', 'content.js'];
const STREAM_BRIDGE_FILE = 'stream-bridge.js';
const TARGET_KEY_PREFIX = 'notification-target:';

function ensureContentScriptsOnOpenTabs() {
  if (!chrome.tabs || typeof chrome.tabs.query !== 'function') return;
  if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') return;

  chrome.tabs.query({ url: SUPPORTED_URL_PATTERNS }, (tabs) => {
    if (chrome.runtime.lastError || !Array.isArray(tabs)) return;

    for (const tab of tabs) {
      if (!tab || !Number.isInteger(tab.id)) continue;

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [STREAM_BRIDGE_FILE],
        world: 'MAIN',
      }, () => {
        void chrome.runtime.lastError;
      });

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: CONTENT_SCRIPT_FILES,
      }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

ensureContentScriptsOnOpenTabs();

function cleanProvider(provider) {
  const value = String(provider || '').trim();
  return KNOWN_PROVIDERS.has(value) ? value : '';
}

function cleanText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function cleanTheme(value) {
  return value === 'dark' || value === 'light' ? value : '';
}

function cleanSourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (!['chatgpt.com', 'claude.ai', 'gemini.google.com'].includes(url.hostname)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function notificationData(input = {}) {
  return {
    provider: cleanProvider(input.provider),
    chatTitle: cleanText(input.chatTitle, 90),
    snippet: cleanText(input.snippet, 180),
    sourceTheme: cleanTheme(input.sourceTheme),
    sourceUrl: cleanSourceUrl(input.sourceUrl),
  };
}

function svgDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function providerIconUrl(provider) {
  if (provider === 'ChatGPT') {
    return svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#10a37f"/><g fill="none" stroke="#fff" stroke-width="5.2" stroke-linecap="round"><path d="M32 13c8 0 14 6 14 14 7 4 9 13 5 20-4 7-13 10-20 6-7 4-16 1-20-6-4-7-2-16 5-20 0-8 6-14 16-14Z"/><path d="M23 20 41 30 31 47 15 37 23 20Zm18 10 8 17M31 47l-18-1"/></g></svg>');
  }

  if (provider === 'Claude') {
    return svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#d97757"/><g stroke="#fff8f1" stroke-width="5" stroke-linecap="round"><path d="M32 13v38M13 32h38M19 19l26 26M45 19 19 45"/></g></svg>');
  }

  if (provider === 'Gemini') {
    return svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="10" y1="54" x2="54" y2="10"><stop stop-color="#4e8cff"/><stop offset=".52" stop-color="#8b6cf6"/><stop offset="1" stop-color="#d96bd8"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#202124"/><path fill="url(#g)" d="M32 8c2.7 13.8 10.2 21.3 24 24-13.8 2.7-21.3 10.2-24 24-2.7-13.8-10.2-21.3-24-24C21.8 29.3 29.3 21.8 32 8Z"/></svg>');
  }

  return GENERIC_NOTIFICATION_ICON;
}

function clearNotification(notificationId, callback) {
  chrome.notifications.clear(notificationId, () => {
    void chrome.runtime.lastError;
    callback?.();
  });
}

function rememberNotificationTarget(notificationId, data, callback) {
  if (!chrome.storage?.session || !data.sourceUrl) {
    callback?.();
    return;
  }

  chrome.storage.session.set({
    [TARGET_KEY_PREFIX + notificationId]: {
      sourceUrl: data.sourceUrl,
    },
  }, () => {
    void chrome.runtime.lastError;
    callback?.();
  });
}

function readNotificationTarget(notificationId, callback) {
  if (!chrome.storage?.session) {
    callback('');
    return;
  }

  const key = TARGET_KEY_PREFIX + notificationId;
  chrome.storage.session.get(key, (result) => {
    const sourceUrl = cleanSourceUrl(result?.[key]?.sourceUrl);
    callback(sourceUrl);
  });
}

function forgetNotificationTarget(notificationId) {
  if (!chrome.storage?.session) return;
  chrome.storage.session.remove(TARGET_KEY_PREFIX + notificationId, () => {
    void chrome.runtime.lastError;
  });
}

function focusTab(tabId, sourceUrl, callback) {
  const update = { active: true };
  const safeUrl = cleanSourceUrl(sourceUrl);
  if (safeUrl) update.url = safeUrl;

  chrome.tabs.update(tabId, update, (tab) => {
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

function notificationCopy(data) {
  const title = data.chatTitle
    || (data.provider ? data.provider + ' response ready' : 'Response ready');
  const message = data.snippet
    || (data.provider ? data.provider + ' finished responding.' : 'Your AI chat finished responding.');

  return { title, message };
}

function createSystemNotification(tabId, completionId, data, callback) {
  let notificationId;
  try {
    notificationId = core.makeNotificationId(tabId, completionId);
  } catch (_) {
    callback(false);
    return;
  }

  const copy = notificationCopy(data);
  const contextMessage = data.provider
    ? data.provider + ' · Click to open chat'
    : 'Click to open chat';

  const createWithIcon = (iconUrl, allowFallback) => {
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl,
      title: copy.title,
      message: copy.message,
      contextMessage,
      buttons: [{ title: 'Open chat' }],
    }, () => {
      if (chrome.runtime.lastError && allowFallback) {
        createWithIcon(GENERIC_NOTIFICATION_ICON, false);
        return;
      }
      callback(!chrome.runtime.lastError);
    });
  };

  clearNotification(notificationId, () => {
    rememberNotificationTarget(notificationId, data, () => {
      createWithIcon(providerIconUrl(data.provider), true);
    });
  });
}

function showInlineToastInTab(activeTabId, sourceTabId, data, callback) {
  chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ['overlay.js'],
  }, () => {
    if (chrome.runtime.lastError) {
      callback(false);
      return;
    }

    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_INLINE_TOAST',
      sourceTabId,
      provider: data.provider,
      chatTitle: data.chatTitle,
      snippet: data.snippet,
      sourceTheme: data.sourceTheme,
      sourceUrl: data.sourceUrl,
    }, (response) => {
      const ok = !chrome.runtime.lastError && response && response.ok === true;
      callback(Boolean(ok));
    });
  });
}

function createInlineToast(sourceTabId, data, focusedWindow, callback) {
  if (!focusedWindow || !Number.isInteger(focusedWindow.id)) {
    callback(false);
    return;
  }

  chrome.tabs.query({ active: true, windowId: focusedWindow.id }, (tabs) => {
    if (chrome.runtime.lastError) {
      callback(false);
      return;
    }

    const activeTab = Array.isArray(tabs) ? tabs[0] : null;
    if (!activeTab || !Number.isInteger(activeTab.id)) {
      callback(false);
      return;
    }

    showInlineToastInTab(activeTab.id, sourceTabId, data, callback);
  });
}

function deliverNotification(tabId, completionId, requestedMode, rawData, callback) {
  const data = notificationData(rawData);

  chrome.storage.sync.get({ notificationMode: 'auto' }, (settings) => {
    const storedMode = settings && settings.notificationMode;
    const mode = core.normalizeNotificationMode(requestedMode || storedMode);

    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
      const normalWindows = Array.isArray(windows) ? windows : [];
      const focusedWindow = normalWindows.find((windowInfo) => windowInfo.focused) || null;
      const deliveryMode = core.chooseDeliveryMode(mode, Boolean(focusedWindow));

      if (deliveryMode === 'browser') {
        createInlineToast(tabId, data, focusedWindow, (ok) => {
          if (ok) {
            callback(true);
            return;
          }

          createSystemNotification(tabId, completionId, data, callback);
        });
        return;
      }

      createSystemNotification(tabId, completionId, data, callback);
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

    focusTab(tabId, message.sourceUrl, (ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === 'TEST_NOTIFICATION') {
    const completionId = 'test';
    const testData = {
      provider: 'ChatGPT',
      chatTitle: 'Test notification',
      snippet: 'This is what a finished AI response will look like.',
      sourceTheme: 'dark',
    };
    const senderTabId = sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : null;

    if (senderTabId !== null) {
      deliverNotification(senderTabId, completionId, message.mode, testData, (ok) => sendResponse({ ok }));
      return true;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = Array.isArray(tabs) ? tabs[0] : null;
      const tabId = activeTab && Number.isInteger(activeTab.id) ? activeTab.id : null;
      if (tabId === null) {
        sendResponse({ ok: false });
        return;
      }

      deliverNotification(tabId, completionId, message.mode, testData, (ok) => sendResponse({ ok }));
    });
    return true;
  }

  if (!sender.tab || !Number.isInteger(sender.tab.id)) return false;
  if (message.type !== 'CHATGPT_RESPONSE_COMPLETE') return false;

  const completionId = typeof message.completionId === 'string'
    ? message.completionId.trim()
    : '';

  if (!completionId) {
    sendResponse({ ok: false });
    return false;
  }

  deliverNotification(sender.tab.id, completionId, null, {
    provider: message.provider,
    chatTitle: message.chatTitle,
    snippet: message.snippet,
    sourceTheme: message.sourceTheme,
    sourceUrl: message.sourceUrl,
  }, (ok) => sendResponse({ ok }));

  return true;
});

function handleSystemNotificationAction(notificationId) {
  const route = core.parseNotificationId(notificationId);
  if (!route) return;

  readNotificationTarget(notificationId, (sourceUrl) => {
    focusTab(route.tabId, sourceUrl, () => {
      clearNotification(notificationId);
      forgetNotificationTarget(notificationId);
    });
  });
}

chrome.notifications.onClicked.addListener(handleSystemNotificationAction);
chrome.notifications.onButtonClicked.addListener((notificationId) => {
  handleSystemNotificationAction(notificationId);
});
