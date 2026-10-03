(function () {
  'use strict';

  const core = globalThis.ChatGPTNotifierCore;
  const providers = globalThis.AIChatProviderProfiles;
  if (!core || !providers) return;
  if (globalThis.__AI_CHAT_NOTIFICATIONS_CONTENT_LOADED__) return;
  globalThis.__AI_CHAT_NOTIFICATIONS_CONTENT_LOADED__ = true;

  const hostname = typeof location === 'object' && location ? location.hostname : 'chatgpt.com';
  const profile = providers.getProfile(hostname);
  if (!profile) return;

  const CONTROL_SELECTOR = 'button, [role="button"]';
  const GENERIC_STOP_SELECTORS = profile.provider === 'ChatGPT' ? [] : [
    'button[aria-label*="Stop" i]',
    '[role="button"][aria-label*="Stop" i]',
    '[data-testid*="stop" i]',
    '[data-test-id*="stop" i]',
  ];
  const GENERIC_SEND_SELECTORS = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    'button[type="submit"]',
    '[data-testid*="send" i]',
    '[data-test-id*="send" i]',
  ];
  const GENERIC_PROMPT_SELECTORS = [
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ];

  const STOP_SELECTOR = [...profile.generating, ...GENERIC_STOP_SELECTORS].join(', ');
  const SEND_SELECTOR = [...profile.send, ...GENERIC_SEND_SELECTORS].join(', ');
  const COMPLETION_MARKER_SELECTOR = [...profile.completion].join(', ');
  const PROMPT_SELECTOR = [...profile.prompt, ...GENERIC_PROMPT_SELECTORS].join(', ');
  const STABILIZE_MS = 1000;
  const STREAM_MESSAGE_SOURCE = 'ai-chat-notifications';

  let activeCycle = null;

  function controlDescriptor(element) {
    return {
      testId: element.getAttribute?.('data-testid') || element.getAttribute?.('data-test-id') || '',
      ariaLabel: element.getAttribute?.('aria-label') || '',
      title: element.getAttribute?.('title') || '',
      text: element.textContent || '',
    };
  }

  function isUsableControl(element) {
    if (!element) return false;
    const readStyle = typeof getComputedStyle === 'function' ? getComputedStyle : null;
    return core.isElementVisible(element, readStyle)
      && element.getAttribute?.('aria-disabled') !== 'true'
      && element.disabled !== true;
  }

  function anyUsableMatch(selector) {
    if (!selector) return false;
    for (const element of document.querySelectorAll(selector)) {
      if (isUsableControl(element)) return true;
    }
    return false;
  }

  function readDomGenerating() {
    if (anyUsableMatch(STOP_SELECTOR)) return true;

    const descriptors = [];
    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      if (!isUsableControl(element)) continue;
      const descriptor = controlDescriptor(element);
      const searchable = descriptor.testId + ' ' + descriptor.ariaLabel + ' ' + descriptor.title + ' ' + descriptor.text;
      if (!/\bstop\b/i.test(searchable)) continue;
      descriptors.push(descriptor);
    }

    return core.detectGeneratingFromDescriptors(descriptors);
  }

  function conversationKey() {
    try {
      const origin = location.origin || '';
      const pathname = location.pathname || '/';
      return origin + pathname.replace(/\/+$/, '');
    } catch (_) {
      return '';
    }
  }

  function sourceStillOpen(cycle = activeCycle) {
    return Boolean(cycle) && conversationKey() === cycle.sourceConversationKey;
  }

  function isGeneratingForTracker() {
    if (activeCycle && !sourceStillOpen(activeCycle)) {
      // Navigating to another chat removes the old response DOM immediately.
      // Keep the tracker armed until the page-world stream bridge confirms the
      // original request actually finished.
      return true;
    }
    return readDomGenerating();
  }

  function completionMarkerCount() {
    const markers = new Set(document.querySelectorAll(COMPLETION_MARKER_SELECTOR));

    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      if (!isUsableControl(element)) continue;
      if (providers.isCompletionMarkerDescriptor(controlDescriptor(element))) markers.add(element);
    }

    return markers.size;
  }

  function normalizePreviewText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function truncatePreview(value, maxLength = 160) {
    const text = normalizePreviewText(value);
    if (text.length <= maxLength) return text;
    const slice = text.slice(0, maxLength - 1);
    const lastSpace = slice.lastIndexOf(' ');
    const trimmed = lastSpace > 95 ? slice.slice(0, lastSpace) : slice;
    return trimmed.trimEnd() + '…';
  }

  function cleanAssistantText(value) {
    let text = normalizePreviewText(value);
    text = text.replace(/^(ChatGPT|Claude|Gemini)\s+said:\s*/i, '');
    text = text.replace(/^(Assistant|Model)\s*:\s*/i, '');
    return text.trim();
  }

  function readChatTitle() {
    let title = normalizePreviewText(document.title);
    title = title.replace(/^\(\d+\)\s*/, '');
    title = title.replace(/\s*[\-–—|·]\s*(ChatGPT|Claude|Gemini|Google Gemini)\s*$/i, '').trim();

    if (!title || /^(chatgpt|claude|gemini|google gemini|new chat)$/i.test(title)) {
      return profile.provider + ' chat';
    }

    return truncatePreview(title, 90);
  }

  function readResponseSnippet() {
    const selectors = Array.isArray(profile.responseText) ? profile.responseText : [];

    for (const selector of selectors) {
      let matches;
      try {
        matches = [...document.querySelectorAll(selector)];
      } catch (_) {
        continue;
      }

      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const element = matches[index];
        let raw = '';

        if (typeof element.innerText === 'string') raw = element.innerText;
        else raw = element.textContent || '';

        const text = cleanAssistantText(raw);
        if (!text) continue;

        return truncatePreview(text, 160);
      }
    }

    return '';
  }

  function readSourceTheme() {
    try {
      const target = document.body || document.documentElement;
      if (!target || typeof getComputedStyle !== 'function') return '';
      const background = getComputedStyle(target).backgroundColor || '';
      const match = background.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
      if (!match) return '';

      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
      return luminance < 128 ? 'dark' : 'light';
    } catch (_) {
      return '';
    }
  }

  function currentUrl() {
    try {
      return String(location.href || '');
    } catch (_) {
      return '';
    }
  }

  function makeCycleId() {
    const randomPart = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
    return Date.now().toString(36) + '-' + randomPart;
  }

  function updateCyclePreview() {
    if (!activeCycle || !sourceStillOpen(activeCycle)) return;
    const snippet = readResponseSnippet();
    if (snippet) activeCycle.latestSnippet = snippet;
  }

  function isAwayFromCycle(cycle) {
    if (!cycle) return false;
    if (document.hidden) return true;
    return conversationKey() !== cycle.sourceConversationKey;
  }

  async function sendCompletion(cycle) {
    if (!cycle) return false;

    return core.deliverCompletionWithRetry({
      completionId: cycle.id,
      maxAttempts: 4,
      retryDelayMs: 500,
      ackTimeoutMs: 1500,
      send: (message) => chrome.runtime.sendMessage({
        ...message,
        provider: profile.provider,
        chatTitle: cycle.chatTitle,
        snippet: cycle.latestSnippet || '',
        sourceTheme: cycle.sourceTheme,
        sourceUrl: cycle.sourceUrl,
      }),
    });
  }

  function clearCycle() {
    activeCycle = null;
  }

  function completeCycle(reason) {
    const cycle = activeCycle;
    if (!cycle) return false;

    updateCyclePreview();

    if (reason === 'stream' && tracker && typeof tracker.cancel === 'function') {
      tracker.cancel();
    }

    clearCycle();

    if (isAwayFromCycle(cycle)) {
      void sendCompletion(cycle);
    }

    return true;
  }

  const tracker = new core.ResponseCycleTracker({
    stabilizeMs: STABILIZE_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
    readGenerating: isGeneratingForTracker,
    readCompletionMarkerCount: completionMarkerCount,
    // Always invoke onComplete after a confirmed response. Whether an alert
    // should be shown is decided from the cycle's original route below.
    readAway: () => true,
    onComplete: () => completeCycle('dom'),
  });

  function armResponseCycle() {
    if (activeCycle) return false;

    const armed = tracker.arm();
    if (!armed) return false;

    activeCycle = {
      id: makeCycleId(),
      sourceConversationKey: conversationKey(),
      sourceUrl: currentUrl(),
      chatTitle: readChatTitle(),
      latestSnippet: readResponseSnippet(),
      sourceTheme: readSourceTheme(),
      streamTracked: false,
    };

    try {
      window.postMessage({
        source: STREAM_MESSAGE_SOURCE,
        type: 'ARM_STREAM_TRACKER',
        cycleId: activeCycle.id,
        provider: profile.provider,
      }, '*');
    } catch (_) {}

    return true;
  }

  function findSendControl(target) {
    if (!target || typeof target.closest !== 'function') return null;

    const matched = target.closest(SEND_SELECTOR);
    if (isUsableControl(matched)) return matched;

    const control = target.closest(CONTROL_SELECTOR);
    if (!isUsableControl(control)) return null;
    return providers.isSendControlDescriptor(controlDescriptor(control)) ? control : null;
  }

  function findPromptEditor(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(PROMPT_SELECTOR);
  }

  function editorCanSubmit(editor) {
    if (!editor) return false;

    const form = typeof editor.closest === 'function' ? editor.closest('form') : null;
    const sendControl = form && typeof form.querySelector === 'function'
      ? form.querySelector(SEND_SELECTOR)
      : document.querySelector(SEND_SELECTOR);

    if (sendControl) return isUsableControl(sendControl);

    const text = typeof editor.value === 'string' ? editor.value : editor.textContent;
    return String(text || '').trim().length > 0;
  }

  document.addEventListener('click', (event) => {
    if (findSendControl(event.target)) armResponseCycle();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;

    const editor = findPromptEditor(event.target);
    if (!editor || !editorCanSubmit(editor)) return;
    armResponseCycle();
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form || typeof form.querySelector !== 'function') return;
    if (!form.querySelector(PROMPT_SELECTOR) && !form.querySelector(SEND_SELECTOR)) return;
    armResponseCycle();
  }, true);

  window.addEventListener('message', (event) => {
    if (event.source && event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== STREAM_MESSAGE_SOURCE || !activeCycle) return;
    if (String(data.cycleId || '') !== activeCycle.id) return;

    if (data.type === 'STREAM_TRACKING') {
      activeCycle.streamTracked = true;
      return;
    }

    if (data.type === 'STREAM_DONE') {
      completeCycle('stream');
    }
  });

  function observeNow() {
    updateCyclePreview();

    if (readDomGenerating() && !activeCycle) {
      armResponseCycle();
    }

    tracker.observe();
  }

  const observer = new MutationObserver(observeNow);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'data-testid',
      'data-test-id',
      'aria-label',
      'aria-hidden',
      'aria-disabled',
      'aria-busy',
      'title',
      'hidden',
      'disabled',
      'class',
    ],
  });

  document.addEventListener('visibilitychange', observeNow, { passive: true });
  window.addEventListener('focus', observeNow, { passive: true });
  window.addEventListener('blur', observeNow, { passive: true });
  window.addEventListener('popstate', observeNow, { passive: true });
  window.addEventListener('hashchange', observeNow, { passive: true });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    tracker.dispose();
    clearCycle();
  }, { once: true });
})();
