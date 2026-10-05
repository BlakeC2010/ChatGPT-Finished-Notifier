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
  const GENERIC_PROMPT_SELECTORS = profile.provider === 'ChatGPT' ? [] : [
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
  const STREAM_CYCLE_ATTR = 'data-ai-chat-notifier-cycle';

  let activeCycle = null;
  let ignoreGenerationUntilIdle = false;

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
      return providers.conversationKeyFromUrl(currentUrl());
    } catch (_) {
      return '';
    }
  }

  function sourceStillOpen(cycle = activeCycle) {
    return Boolean(cycle) && conversationKey() === cycle.sourceConversationKey;
  }

  function startsOnNewChatRoute() {
    try {
      const path = location.pathname || '/';
      if (profile.provider === 'ChatGPT') {
        return path === '/' || path === '/new' || /^\/g\/[^/]+(?:\/project)?\/?$/.test(path);
      }
      if (profile.provider === 'Claude') return path === '/' || path === '/new';
      if (profile.provider === 'Gemini') return path === '/' || path === '/app' || path === '/app/';
    } catch (_) {}
    return false;
  }

  function maybeAdoptConversationRoute() {
    if (!activeCycle || !activeCycle.startedOnNewChat) return;
    const currentKey = conversationKey();
    if (!currentKey || currentKey === activeCycle.sourceConversationKey) return;

    if (profile.provider === 'ChatGPT') {
      const path = location.pathname || '';
      if (!/^(?:\/g\/[^/]+)?\/c\/[^/]+\/?$/.test(path)) return;
      const starter = new URL(activeCycle.sourceUrl).pathname.match(/^\/g\/[^/]+/);
      if (starter && !path.startsWith(starter[0] + '/c/')) return;
    }

    const age = Date.now() - activeCycle.startedAt;
    if (age > 15000) {
      activeCycle.startedOnNewChat = false;
      return;
    }

    activeCycle.sourceConversationKey = currentKey;
    activeCycle.sourceUrl = currentUrl();
    activeCycle.startedOnNewChat = false;
  }

  function isGeneratingForTracker() {
    if (activeCycle?.streamTracked && !activeCycle.streamFinished) return true;
    if (activeCycle && !sourceStillOpen(activeCycle)) {
      // Navigating to another chat removes the old response DOM immediately.
      // Keep the tracker armed until the page-world stream bridge confirms the
      // original request actually finished.
      return !activeCycle.streamFinished;
    }
    return readDomGenerating();
  }

  function completionMarkerCount() {
    const markers = new Set([...document.querySelectorAll(COMPLETION_MARKER_SELECTOR)]
      .filter((element) => core.isElementVisible(element, typeof getComputedStyle === 'function' ? getComputedStyle : null)));

    if (profile.provider === 'ChatGPT') return markers.size;

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
    if (!activeCycle) return;

    maybeAdoptConversationRoute();
    if (!sourceStillOpen(activeCycle)) return;

    const title = readChatTitle();
    if (title && !/^(ChatGPT|Claude|Gemini) chat$/i.test(title)) {
      activeCycle.chatTitle = title;
    }

    const snippet = readResponseSnippet();
    if (snippet) activeCycle.latestSnippet = snippet;

    const url = currentUrl();
    if (url) activeCycle.sourceUrl = url;
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
    const cycleId = activeCycle?.id || '';
    activeCycle = null;

    try {
      const raw = document.documentElement?.getAttribute(STREAM_CYCLE_ATTR);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!cycleId || String(parsed?.cycleId || '') === cycleId) {
        document.documentElement.removeAttribute(STREAM_CYCLE_ATTR);
      }
    } catch (_) {
      document.documentElement?.removeAttribute(STREAM_CYCLE_ATTR);
    }
  }

  function cancelResponseCycle() {
    ignoreGenerationUntilIdle = true;
    tracker.cancel();
    clearCycle();
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
      streamFinished: false,
      startedAt: Date.now(),
      startedOnNewChat: startsOnNewChatRoute(),
    };

    try {
      document.documentElement?.setAttribute(STREAM_CYCLE_ATTR, JSON.stringify({
        cycleId: activeCycle.id,
        provider: profile.provider,
        armedAt: activeCycle.startedAt,
      }));

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

    const specificSelector = profile.provider === 'ChatGPT'
      ? '#composer-submit-button, [data-testid="send-button"]'
      : profile.send.join(', ');
    const specific = target.closest(specificSelector);
    if (isUsableControl(specific) && !core.isStopControlDescriptor(controlDescriptor(specific))) {
      return specific;
    }

    const matched = target.closest(SEND_SELECTOR);
    const control = matched || target.closest(CONTROL_SELECTOR);
    if (!isUsableControl(control)) return null;
    if (core.isStopControlDescriptor(controlDescriptor(control))) return null;
    const form = control.closest('form');
    if (!form?.querySelector(PROMPT_SELECTOR)) return null;
    return matched || (providers.isSendControlDescriptor(controlDescriptor(control)) ? control : null);
  }

  function findPromptEditor(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(PROMPT_SELECTOR);
  }

  function editorCanSubmit(editor) {
    if (!editor) return false;

    const text = typeof editor.value === 'string' ? editor.value : editor.textContent;
    if (!String(text || '').trim()) return false;

    const form = typeof editor.closest === 'function' ? editor.closest('form') : null;
    const sendControl = form && typeof form.querySelector === 'function'
      ? form.querySelector(SEND_SELECTOR)
      : document.querySelector(SEND_SELECTOR);

    if (sendControl) return isUsableControl(sendControl);

    return true;
  }

  document.addEventListener('click', (event) => {
    if (profile.provider === 'ChatGPT' && activeCycle?.startedOnNewChat
      && (event.button == null || event.button === 0)
      && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
      && typeof event.target?.closest === 'function') {
      const link = event.target.closest('a[href]');
      const target = String(link?.getAttribute?.('target') || '').toLowerCase();
      if (link && (!target || target === '_self') && !link.hasAttribute?.('download')) {
        try {
          const destination = new URL(link.href || link.getAttribute?.('href'), currentUrl());
          if (destination.origin === location.origin
            && providers.conversationKeyFromUrl(destination.href) !== conversationKey()) {
            // Current-tab navigation is distinct from a new chat's assigned URL.
            activeCycle.startedOnNewChat = false;
          }
        } catch (_) {}
      }
    }
    if (profile.provider === 'ChatGPT' && sourceStillOpen() && typeof event.target?.closest === 'function') {
      const control = event.target.closest(STOP_SELECTOR) || event.target.closest(CONTROL_SELECTOR);
      if (isUsableControl(control) && core.isStopControlDescriptor(controlDescriptor(control))) {
        cancelResponseCycle();
        return;
      }
    }
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
    const editor = form.querySelector(PROMPT_SELECTOR);
    if (!editor || !editorCanSubmit(editor)) return;
    armResponseCycle();
  }, true);

  window.addEventListener('message', (event) => {
    if (event.source && event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== STREAM_MESSAGE_SOURCE || !activeCycle) return;
    if (String(data.cycleId || '') !== activeCycle.id) return;

    if (data.type === 'STREAM_TRACKING') {
      activeCycle.streamTracked = true;
      tracker.observe();
      return;
    }

    if (data.type === 'STREAM_CANCELLED') {
      cancelResponseCycle();
      return;
    }

    if (data.type === 'STREAM_DONE' && activeCycle.streamTracked) {
      activeCycle.streamFinished = true;
      updateCyclePreview();
      tracker.observe();
    }
  });

  function observeNow() {
    updateCyclePreview();

    const generating = readDomGenerating();
    if (!generating) ignoreGenerationUntilIdle = false;
    if (generating && !activeCycle && !ignoreGenerationUntilIdle) {
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
  window.addEventListener('popstate', () => {
    if (profile.provider === 'ChatGPT' && activeCycle) activeCycle.startedOnNewChat = false;
    observeNow();
  }, { passive: true });
  window.addEventListener('hashchange', observeNow, { passive: true });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    tracker.dispose();
    clearCycle();
  }, { once: true });
})();
