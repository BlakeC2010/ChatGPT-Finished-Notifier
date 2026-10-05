(() => {
  'use strict';

  if (globalThis.__AI_CHAT_NOTIFICATIONS_STREAM_BRIDGE__) return;
  globalThis.__AI_CHAT_NOTIFICATIONS_STREAM_BRIDGE__ = true;

  const SOURCE = 'ai-chat-notifications';
  const CYCLE_ATTR = 'data-ai-chat-notifier-cycle';

  function readCycleFromDom() {
    try {
      const raw = document.documentElement?.getAttribute(CYCLE_ATTR);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const cycleId = String(parsed?.cycleId || '');
      const provider = String(parsed?.provider || '');
      if (!cycleId || !provider) return null;
      return { cycleId, provider, armedAt: Number(parsed.armedAt) || Date.now() };
    } catch (_) {
      return null;
    }
  }

  function normalizeMethod(input, init) {
    const method = init?.method
      || (typeof Request !== 'undefined' && input instanceof Request ? input.method : '')
      || 'GET';
    return String(method).toUpperCase();
  }

  function urlOf(input) {
    try {
      if (typeof input === 'string') return new URL(input, location.href).href;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return new URL(input.url, location.href).href;
    } catch (_) {}
    return '';
  }

  function isLikelyResponseRequest(provider, url, method) {
    if (!url || method !== 'POST') return false;
    const value = url.toLowerCase();

    if (provider === 'ChatGPT') {
      try {
        const request = new URL(url);
        const paths = new Set([
          '/backend-api/conversation',
          '/backend-anon/conversation',
          '/backend-api/f/conversation',
        ]);
        return request.hostname === 'chatgpt.com'
          && paths.has(request.pathname.replace(/\/$/, ''));
      } catch (_) {
        return false;
      }
    }

    if (provider === 'Claude') {
      return value.includes('/completion')
        || value.includes('/retry_completion')
        || value.includes('/chat_conversations/') && value.includes('completion');
    }

    if (provider === 'Gemini') {
      return value.includes('streamgenerate')
        || value.includes('bardfrontendservice')
        || value.includes('/batchexecute');
    }

    return false;
  }

  function post(type, cycleId) {
    window.postMessage({
      source: SOURCE,
      type,
      cycleId,
    }, '*');
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch !== 'function') {
    globalThis.AIChatNotificationStreamBridge = { isLikelyResponseRequest };
    return;
  }

  window.fetch = async function (...args) {
    const liveCycle = readCycleFromDom();
    const cycle = liveCycle ? { ...liveCycle } : null;
    const url = urlOf(args[0]);
    const method = normalizeMethod(args[0], args[1]);
    const trackedRequest = cycle && isLikelyResponseRequest(cycle.provider, url, method);
    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (error) {
      if (trackedRequest) post('STREAM_CANCELLED', cycle.cycleId);
      throw error;
    }

    if (!trackedRequest) {
      return response;
    }

    if (!response.ok) {
      post('STREAM_CANCELLED', cycle.cycleId);
      return response;
    }

    if (cycle.provider === 'ChatGPT') {
      const contentType = response.headers.get('content-type') || '';
      if (!/^text\/event-stream(?:\s*;|\s*$)/i.test(contentType)) return response;
    }

    post('STREAM_TRACKING', cycle.cycleId);

    try {
      const clone = response.clone();
      Promise.resolve(clone.text()).then(
        () => post('STREAM_DONE', cycle.cycleId),
        () => post('STREAM_CANCELLED', cycle.cycleId),
      );
    } catch (_) {
      post('STREAM_CANCELLED', cycle.cycleId);
    }

    return response;
  };

  globalThis.AIChatNotificationStreamBridge = { isLikelyResponseRequest };
})();
