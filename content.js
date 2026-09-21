(function () {
  'use strict';

  const core = globalThis.ChatGPTNotifierCore;
  if (!core) return;

  const EXACT_STOP_SELECTOR = '[data-testid="stop-button"]';
  const CONTROL_SELECTOR = 'button, [role="button"]';
  const OBSERVE_THROTTLE_MS = 75;
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
    return !element.hidden && element.getAttribute('aria-hidden') !== 'true';
  }

  function isGenerating() {
    if (document.querySelector(EXACT_STOP_SELECTOR)) return true;

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

  function isAway() {
    return document.hidden || !document.hasFocus();
  }

  function sendCompletion() {
    try {
      const maybePromise = chrome.runtime.sendMessage({
        type: 'CHATGPT_RESPONSE_COMPLETE',
      });
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch (_) {}
  }

  const tracker = new core.GenerationTracker({
    stabilizeMs: STABILIZE_MS,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
    readGenerating: isGenerating,
    readAway: isAway,
    onComplete: sendCompletion,
  });

  tracker.initialize();

  let scheduled = false;
  function scheduleObservation() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      tracker.observe();
    }, OBSERVE_THROTTLE_MS);
  }

  const observer = new MutationObserver(scheduleObservation);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-testid', 'aria-label', 'aria-hidden', 'title', 'hidden'],
  });

  document.addEventListener('visibilitychange', scheduleObservation, { passive: true });
  window.addEventListener('focus', scheduleObservation, { passive: true });
  window.addEventListener('blur', scheduleObservation, { passive: true });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    tracker.dispose();
  }, { once: true });
})();
