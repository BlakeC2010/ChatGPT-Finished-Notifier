(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChatGPTNotifierCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isStopControlDescriptor(descriptor = {}) {
    const testId = normalize(descriptor.testId);
    if (testId === 'stop-button') return true;

    const semanticText = [descriptor.ariaLabel, descriptor.title, descriptor.text]
      .map(normalize)
      .filter(Boolean)
      .join(' | ');

    if (!semanticText) return false;
    if (semanticText === 'stop') return true;
    if (/\bstop\s+(streaming|generating|generation|responding|response|answering)\b/.test(semanticText)) {
      return true;
    }

    return false;
  }

  function detectGeneratingFromDescriptors(descriptors) {
    if (!Array.isArray(descriptors)) return false;
    return descriptors.some((descriptor) => isStopControlDescriptor(descriptor));
  }

  function isElementVisible(element, readStyle) {
    if (!element) return false;
    if (element.hidden) return false;
    if (typeof element.getAttribute === 'function' && element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false;
    }

    if (typeof readStyle === 'function') {
      let style;
      try {
        style = readStyle(element);
      } catch (_) {
        style = null;
      }

      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) {
        return false;
      }
    }

    return true;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function deliverCompletionWithRetry(options) {
    if (!options || typeof options.send !== 'function') {
      throw new TypeError('send must be a function');
    }

    const completionId = String(options.completionId || '').trim();
    if (!completionId) throw new TypeError('completionId must be a non-empty string');

    const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
      ? options.maxAttempts
      : 4;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0
      ? options.retryDelayMs
      : 500;
    const ackTimeoutMs = Number.isFinite(options.ackTimeoutMs) && options.ackTimeoutMs > 0
      ? options.ackTimeoutMs
      : 1500;
    const wait = typeof options.wait === 'function' ? options.wait : delay;
    const message = {
      type: 'CHATGPT_RESPONSE_COMPLETE',
      completionId,
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response;
      let timeoutId;

      try {
        response = await Promise.race([
          Promise.resolve(options.send(message)),
          new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(undefined), ackTimeoutMs);
          }),
        ]);
      } catch (_) {
        response = undefined;
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }

      if (response && response.ok === true) return true;
      if (attempt < maxAttempts) await wait(retryDelayMs);
    }

    return false;
  }

  class ResponseCycleTracker {
    constructor(options) {
      if (!options || typeof options.readGenerating !== 'function') {
        throw new TypeError('readGenerating must be a function');
      }
      if (typeof options.readCompletionMarkerCount !== 'function') {
        throw new TypeError('readCompletionMarkerCount must be a function');
      }
      if (typeof options.readAway !== 'function') {
        throw new TypeError('readAway must be a function');
      }
      if (typeof options.onComplete !== 'function') {
        throw new TypeError('onComplete must be a function');
      }

      this.stabilizeMs = Number.isFinite(options.stabilizeMs) ? options.stabilizeMs : 800;
      this.setTimer = options.setTimer || setTimeout;
      this.clearTimer = options.clearTimer || clearTimeout;
      this.readGenerating = options.readGenerating;
      this.readCompletionMarkerCount = options.readCompletionMarkerCount;
      this.readAway = options.readAway;
      this.onComplete = options.onComplete;
      this.armed = false;
      this.sawGenerating = false;
      this.baselineCompletionCount = 0;
      this.pendingTimer = null;
      this.disposed = false;
    }

    arm() {
      if (this.disposed || this.armed) return false;
      this.armed = true;
      this.sawGenerating = Boolean(this.readGenerating());
      this.baselineCompletionCount = this.#readCompletionCount();
      this.#cancelPending();
      return true;
    }

    observe() {
      if (this.disposed || !this.armed) return;

      const generating = Boolean(this.readGenerating());
      if (generating) {
        this.sawGenerating = true;
        this.#cancelPending();
        return;
      }

      const hasNewCompletionMarker = this.#readCompletionCount() > this.baselineCompletionCount;
      if (!this.sawGenerating && !hasNewCompletionMarker) return;
      if (this.pendingTimer !== null) return;

      this.pendingTimer = this.setTimer(() => {
        this.pendingTimer = null;
        if (this.disposed || !this.armed) return;

        if (this.readGenerating()) {
          this.sawGenerating = true;
          return;
        }

        const confirmed = this.sawGenerating
          || this.#readCompletionCount() > this.baselineCompletionCount;
        if (!confirmed) return;

        this.armed = false;
        this.sawGenerating = false;
        if (this.readAway()) this.onComplete();
      }, this.stabilizeMs);
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.#cancelPending();
      this.armed = false;
    }

    #readCompletionCount() {
      const value = Number(this.readCompletionMarkerCount());
      return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    #cancelPending() {
      if (this.pendingTimer === null) return;
      this.clearTimer(this.pendingTimer);
      this.pendingTimer = null;
    }
  }

  class GenerationTracker {
    constructor(options) {
      if (!options || typeof options.readGenerating !== 'function') {
        throw new TypeError('readGenerating must be a function');
      }
      if (typeof options.readAway !== 'function') {
        throw new TypeError('readAway must be a function');
      }
      if (typeof options.onComplete !== 'function') {
        throw new TypeError('onComplete must be a function');
      }

      this.stabilizeMs = Number.isFinite(options.stabilizeMs) ? options.stabilizeMs : 800;
      this.setTimer = options.setTimer || setTimeout;
      this.clearTimer = options.clearTimer || clearTimeout;
      this.readGenerating = options.readGenerating;
      this.readAway = options.readAway;
      this.onComplete = options.onComplete;
      this.initialized = false;
      this.wasGenerating = false;
      this.pendingTimer = null;
      this.idleBeganAway = false;
      this.disposed = false;
    }

    initialize() {
      if (this.disposed || this.initialized) return;
      this.initialized = true;
      this.wasGenerating = Boolean(this.readGenerating());
    }

    observe() {
      if (this.disposed) return;
      if (!this.initialized) this.initialize();

      const generating = Boolean(this.readGenerating());
      if (generating) {
        this.wasGenerating = true;
        this.#cancelPending();
        return;
      }

      if (!this.wasGenerating || this.pendingTimer !== null) return;

      this.idleBeganAway = Boolean(this.readAway());
      this.pendingTimer = this.setTimer(() => {
        this.pendingTimer = null;
        if (this.disposed) return;

        if (this.readGenerating()) {
          this.wasGenerating = true;
          return;
        }

        if (!this.wasGenerating) return;
        this.wasGenerating = false;

        if (this.idleBeganAway && this.readAway()) this.onComplete();
        this.idleBeganAway = false;
      }, this.stabilizeMs);
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.#cancelPending();
    }

    #cancelPending() {
      if (this.pendingTimer === null) return;
      this.clearTimer(this.pendingTimer);
      this.pendingTimer = null;
      this.idleBeganAway = false;
    }
  }

  return {
    isStopControlDescriptor,
    detectGeneratingFromDescriptors,
    isElementVisible,
    deliverCompletionWithRetry,
    ResponseCycleTracker,
    GenerationTracker,
  };
});
