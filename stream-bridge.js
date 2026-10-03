(() => {
  'use strict';

  if (globalThis.__AI_CHAT_NOTIFICATIONS_STREAM_BRIDGE__) return;
  globalThis.__AI_CHAT_NOTIFICATIONS_STREAM_BRIDGE__ = true;

  const SOURCE = 'ai-chat-notifications';
  let activeCycle = null;

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
      return value.includes('/backend-api/conversation')
        || value.includes('/backend-anon/conversation')
        || value.includes('/backend-api/f/conversation');
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

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE || data.type !== 'ARM_STREAM_TRACKER') return;

    const cycleId = String(data.cycleId || '');
    const provider = String(data.provider || '');
    if (!cycleId || !provider) return;

    activeCycle = {
      cycleId,
      provider,
      armedAt: Date.now(),
    };
  });

  const originalFetch = window.fetch;
  if (typeof originalFetch !== 'function') {
    globalThis.AIChatNotificationStreamBridge = { isLikelyResponseRequest };
    return;
  }

  window.fetch = async function (...args) {
    const cycle = activeCycle ? { ...activeCycle } : null;
    const url = urlOf(args[0]);
    const method = normalizeMethod(args[0], args[1]);
    const response = await originalFetch.apply(this, args);

    if (!cycle || !isLikelyResponseRequest(cycle.provider, url, method)) {
      return response;
    }

    post('STREAM_TRACKING', cycle.cycleId);

    try {
      const clone = response.clone();
      Promise.resolve(clone.text()).then(
        () => post('STREAM_DONE', cycle.cycleId),
        () => post('STREAM_DONE', cycle.cycleId),
      );
    } catch (_) {
      post('STREAM_DONE', cycle.cycleId);
    }

    return response;
  };

  globalThis.AIChatNotificationStreamBridge = { isLikelyResponseRequest };
})();
