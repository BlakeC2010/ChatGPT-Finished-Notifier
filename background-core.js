(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChatGPTNotifierBackgroundCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  const PREFIX = 'chatgpt-done';

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

  return {
    makeNotificationId,
    parseNotificationId,
  };
});
