(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChatGPTNotifierBackgroundCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const PREFIX = 'chatgpt-done';
  const VALID_NOTIFICATION_MODES = new Set(['auto', 'browser', 'system']);

  function makeNotificationId(tabId, nonce) {
    if (!Number.isInteger(tabId) || tabId < 0) {
      throw new TypeError('tabId must be a non-negative integer');
    }
    const safeNonce = String(nonce || '').trim();
    if (!safeNonce || safeNonce.includes(':')) {
      throw new TypeError('nonce must be a non-empty string without colons');
    }
    return `${PREFIX}:${tabId}:${safeNonce}`;
  }

  function parseNotificationId(notificationId) {
    if (typeof notificationId !== 'string') return null;
    const match = /^chatgpt-done:(\d+):([^:]+)$/.exec(notificationId);
    if (!match) return null;

    const tabId = Number(match[1]);
    if (!Number.isSafeInteger(tabId) || tabId < 0) return null;
    return { tabId };
  }

  function normalizeNotificationMode(mode) {
    return VALID_NOTIFICATION_MODES.has(mode) ? mode : 'auto';
  }

  function chooseDeliveryMode(mode, chromeFocused) {
    const normalized = normalizeNotificationMode(mode);
    if (normalized === 'browser' || normalized === 'system') return normalized;
    return chromeFocused ? 'browser' : 'system';
  }

  function computeToastBounds(anchorWindow, width = 400, height = 150, margin = 18) {
    const result = { width, height };
    if (!anchorWindow || !Number.isFinite(anchorWindow.left) || !Number.isFinite(anchorWindow.top)
      || !Number.isFinite(anchorWindow.width)) {
      return result;
    }

    result.left = Math.round(anchorWindow.left + anchorWindow.width - width - margin);
    result.top = Math.round(anchorWindow.top + margin);
    return result;
  }

  function parseTargetTabId(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const tabId = Number(text);
    return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null;
  }

  return {
    makeNotificationId,
    parseNotificationId,
    normalizeNotificationMode,
    chooseDeliveryMode,
    computeToastBounds,
    parseTargetTabId,
  };
});
