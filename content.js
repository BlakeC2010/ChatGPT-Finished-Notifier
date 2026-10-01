(function () {
  'use strict';

  const core = globalThis.ChatGPTNotifierCore;
  if (!core) return;

  const STOP_SELECTOR = [
    '[data-testid="stop-button"]',
    'button[aria-label="Stop"]',
    '[role="button"][aria-label="Stop"]',
  ].join(', ');
  const CONTROL_SELECTOR = 'button, [role="button"]';
  const COMPLETION_MARKER_SELECTOR = '[data-testid="copy-turn-action-button"]';
  const SEND_SELECTOR = [
    '[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Send"]',
  ].join(', ');
  const PROMPT_SELECTOR = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'textarea',
    '[contenteditable="true"]',
  ].join(', ');
  const STABILIZE_MS = 800;

  function controlDescriptor(element) {
    return {
      testId: element.getAttribute('data-testid') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      title: element.getAttribute('title') || '',
      text: element.textContent || '',
    };
  }

  function isUsableControl(element) {
    return !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getAttribute('aria-disabled') !== 'true'
      && element.disabled !== true;
  }

  function isGenerating() {
    if (document.querySelector(STOP_SELECTOR)) return true;

    const descriptors = [];
    for (const element of document.querySelectorAll(CONTROL_SELECTOR)) {
      if (!isUsableControl(element)) continue;
      const descriptor = controlDescriptor(element);
      const searchable = `${descriptor.testId} ${descriptor.ariaLabel} ${descriptor.title} ${descriptor.text}`;
      if (!/\bstop\b/i.test(searchable)) continue;
      descriptors.push(descriptor);
    }

    return core.detectGeneratingFromDescriptors(descriptors);
  }

  function completionMarkerCount() {
    return document.querySelectorAll(COMPLETION_MARKER_SELECTOR).length;
  }

  function isAway() {
    return document.hidden || !document.hasFocus();
  }

  function makeCompletionId() {
    const randomPart = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
    return `${Date.now().toString(36)}-${randomPart}`;
  }

  function sendCompletion() {
    const completionId = makeCompletionId();

    return core.deliverCompletionWithRetry({
      completionId,
      maxAttempts: 4,
      retryDelayMs: 500,
      ackTimeoutMs: 1500,
      send: (message) => chrome.runtime.sendMessage(message),
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
    const control = target.closest(SEND_SELECTOR);
    return control && isUsableControl(control) ? control : null;
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
    tracker.observe();
  }

  const observer = new MutationObserver(observeNow);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-testid', 'aria-label', 'aria-hidden', 'aria-disabled', 'title', 'hidden', 'disabled'],
  });

  document.addEventListener('visibilitychange', observeNow, { passive: true });
  window.addEventListener('focus', observeNow, { passive: true });
  window.addEventListener('blur', observeNow, { passive: true });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    tracker.dispose();
  }, { once: true });
})();
