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
  const GENERIC_COMPLETION_SELECTORS = [];
  const GENERIC_PROMPT_SELECTORS = [
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]',
  ];

  const STOP_SELECTOR = [...profile.generating, ...GENERIC_STOP_SELECTORS].join(', ');
  const SEND_SELECTOR = [...profile.send, ...GENERIC_SEND_SELECTORS].join(', ');
  const COMPLETION_MARKER_SELECTOR = [...profile.completion, ...GENERIC_COMPLETION_SELECTORS].join(', ');
  const PROMPT_SELECTOR = [...profile.prompt, ...GENERIC_PROMPT_SELECTORS].join(', ');
  const STABILIZE_MS = 1000;

  function controlDescriptor(element) {
    return {
      testId: element.getAttribute('data-testid') || element.getAttribute('data-test-id') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      title: element.getAttribute('title') || '',
      text: element.textContent || '',
    };
  }

  function isUsableControl(element) {
    const readStyle = typeof getComputedStyle === 'function' ? getComputedStyle : null;
    return core.isElementVisible(element, readStyle)
      && element.getAttribute('aria-disabled') !== 'true'
      && element.disabled !== true;
  }

  function anyUsableMatch(selector) {
    if (!selector) return false;
    for (const element of document.querySelectorAll(selector)) {
      if (isUsableControl(element)) return true;
    }
    return false;
  }

  function isGenerating() {
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

  function completionMarkerCount() {
    const markers = new Set(document.querySelectorAll(COMPLETION_MARKER_SELECTOR));

    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      if (!isUsableControl(element)) continue;
      if (providers.isCompletionMarkerDescriptor(controlDescriptor(element))) markers.add(element);
    }

    return markers.size;
  }

  function isAway() {
    return document.hidden;
  }

  function makeCompletionId() {
    const randomPart = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
    return Date.now().toString(36) + '-' + randomPart;
  }

  function sendCompletion() {
    const completionId = makeCompletionId();

    return core.deliverCompletionWithRetry({
      completionId,
      maxAttempts: 4,
      retryDelayMs: 500,
      ackTimeoutMs: 1500,
      send: (message) => chrome.runtime.sendMessage({ ...message, provider: profile.provider }),
    });
  }

  const tracker = new core.ResponseCycleTracker({
    stabilizeMs: STABILIZE_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
    readGenerating: isGenerating,
    readCompletionMarkerCount: completionMarkerCount,
    readAway: isAway,
    onComplete: sendCompletion,
  });

  function armResponseCycle() {
    tracker.arm();
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

  function observeNow() {
    if (isGenerating()) armResponseCycle();
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

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    tracker.dispose();
  }, { once: true });
})();
