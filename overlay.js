(() => {
  'use strict';

  if (globalThis.__AI_CHAT_NOTIFICATIONS_OVERLAY_LOADED__) return;
  globalThis.__AI_CHAT_NOTIFICATIONS_OVERLAY_LOADED__ = true;

  const HOST_ID = 'ai-chat-notifications-overlay-host';
  const AUTO_DISMISS_MS = 7000;

  function cleanText(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1).trimEnd() + '…';
  }

  function providerKey(provider) {
    const value = String(provider || '').toLowerCase();
    if (value === 'chatgpt') return 'chatgpt';
    if (value === 'claude') return 'claude';
    if (value === 'gemini') return 'gemini';
    return 'generic';
  }

  function providerLogoMarkup(provider) {
    const key = providerKey(provider);

    if (key === 'chatgpt') {
      return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#10a37f"/><g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M16 7.1c3.8 0 6.6 2.8 6.6 6.5 3.3 1.9 4.2 6.1 2.3 9.2-1.9 3.2-6.2 4.5-9.5 2.5-3.3 2-7.6.7-9.5-2.5-1.9-3.1-1-7.3 2.3-9.2C8.2 9.9 11 7.1 16 7.1Z"/><path d="m11.6 10.7 9 5-5 8.5-8-5 4-8.5Zm9 5 4 8.2m-9 0-8.8-.5"/></g></svg>';
    }

    if (key === 'claude') {
      return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#d97757"/><g stroke="#fff8f1" stroke-width="2.6" stroke-linecap="round"><path d="M16 7v18M7 16h18M9.7 9.7l12.6 12.6M22.3 9.7 9.7 22.3"/></g></svg>';
    }

    if (key === 'gemini') {
      return '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="gemini-notifier-gradient" x1="5" y1="27" x2="27" y2="5"><stop stop-color="#4e8cff"/><stop offset=".52" stop-color="#8b6cf6"/><stop offset="1" stop-color="#d96bd8"/></linearGradient></defs><circle cx="16" cy="16" r="15" fill="#202124"/><path fill="url(#gemini-notifier-gradient)" d="M16 5c1.3 6.3 4.7 9.7 11 11-6.3 1.3-9.7 4.7-11 11-1.3-6.3-4.7-9.7-11-11 6.3-1.3 9.7-4.7 11-11Z"/></svg>';
    }

    return '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#6b7280"/><path fill="#fff" d="M10 15h12v2H10z"/></svg>';
  }

  function removeExisting() {
    document.getElementById(HOST_ID)?.remove();
  }

  function showToast(message = {}) {
    const sourceTabId = Number(message.sourceTabId);
    const canOpenSource = Number.isInteger(sourceTabId);
    const sourceUrl = String(message.sourceUrl || '');
    const provider = cleanText(message.provider, 30);
    const title = cleanText(message.chatTitle, 90)
      || (provider ? provider + ' response ready' : 'Response ready');
    const snippet = cleanText(message.snippet, 180)
      || (provider ? provider + ' finished responding.' : 'Your AI chat finished responding.');
    const theme = message.sourceTheme === 'light' ? 'light' : 'dark';
    const brand = providerKey(provider);

    removeExisting();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = [
      'all:initial',
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:2147483647',
      'width:min(360px,calc(100vw - 32px))',
      'pointer-events:auto'
    ].join(';');

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = [
      '<style>',
      ':host{all:initial}*{box-sizing:border-box}',
      '.toast{--bg:#202123;--surface:#2a2b2e;--border:rgba(255,255,255,.10);--text:#f7f7f8;--muted:#b6b8be;--accent:#10a37f;position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) 24px;gap:10px;align-items:start;width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text);box-shadow:0 12px 32px rgba(0,0,0,.32);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;cursor:pointer;animation:enter .16s ease-out}',
      '.toast.light{--bg:#fff;--surface:#f3f4f6;--border:rgba(17,24,39,.12);--text:#202123;--muted:#6b7280;box-shadow:0 12px 28px rgba(0,0,0,.16)}',
      '.toast.claude{--bg:#26221f;--surface:#332d28;--text:#f4eee8;--muted:#c0b6ad;--accent:#d97757}.toast.claude.light{--bg:#f7f3ee;--surface:#eee7df;--text:#2b2520;--muted:#776b61}',
      '.toast.gemini{--bg:#202124;--surface:#2b2c31;--text:#f1f3f4;--muted:#bdc1c6;--accent:#8ab4f8}.toast.gemini.light{--bg:#fff;--surface:#f1f3f4;--text:#202124;--muted:#5f6368}',
      '.logo,.logo svg{width:32px;height:32px;display:block}.copy{min-width:0;padding-top:1px}',
      '.provider{margin:0 0 3px;color:var(--muted);font-size:10.5px;font-weight:600;line-height:1.2}',
      '.title{margin:0;overflow:hidden;color:var(--text);font-size:13.5px;font-weight:650;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}',
      '.snippet{display:-webkit-box;margin:4px 0 0;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.42;-webkit-box-orient:vertical;-webkit-line-clamp:2}',
      '.dismiss{appearance:none;display:grid;place-items:center;width:24px;height:24px;margin:-4px -4px 0 0;padding:0;border:0;border-radius:7px;background:transparent;color:var(--muted);font:400 17px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;cursor:pointer}',
      '.dismiss:hover{background:var(--surface);color:var(--text)}',
      '.timer{position:absolute;right:0;bottom:0;left:0;height:2px;transform-origin:left;background:var(--accent);animation:countdown ' + AUTO_DISMISS_MS + 'ms linear forwards}',
      '@keyframes enter{from{opacity:0;transform:translateY(-7px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes countdown{from{transform:scaleX(1)}to{transform:scaleX(0)}}',
      '</style>',
      '<section class="toast ' + brand + ' ' + theme + '" role="button" tabindex="0" aria-label="Open finished AI chat">',
      '<span class="logo"></span>',
      '<div class="copy"><p class="provider"></p><p class="title"></p><p class="snippet"></p></div>',
      '<button class="dismiss" type="button" aria-label="Dismiss notification">×</button>',
      '<div class="timer" aria-hidden="true"></div>',
      '</section>'
    ].join('');

    shadow.querySelector('.logo').innerHTML = providerLogoMarkup(provider);
    shadow.querySelector('.provider').textContent = provider || 'AI Chat Notifications';
    shadow.querySelector('.title').textContent = title;
    shadow.querySelector('.snippet').textContent = snippet;

    const toast = shadow.querySelector('.toast');
    const dismissButton = shadow.querySelector('.dismiss');
    const timer = setTimeout(() => host.remove(), AUTO_DISMISS_MS);

    function dismiss() {
      clearTimeout(timer);
      host.remove();
    }

    function openSource() {
      if (!canOpenSource) return;
      chrome.runtime.sendMessage({
        type: 'OPEN_CHAT',
        tabId: sourceTabId,
        sourceUrl,
      }, () => {
        void chrome.runtime.lastError;
        dismiss();
      });
    }

    dismissButton.addEventListener('click', (event) => {
      event.stopPropagation();
      dismiss();
    });

    if (canOpenSource) {
      toast.addEventListener('click', openSource);
      toast.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openSource();
        }
      });
    } else {
      toast.style.cursor = 'default';
    }

    document.documentElement.appendChild(host);
    return true;
  }

  globalThis.AIChatNotificationsOverlay = { showToast };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'SHOW_INLINE_TOAST') return false;

    try {
      sendResponse({ ok: showToast(message) });
    } catch (_) {
      sendResponse({ ok: false });
    }
    return false;
  });
})();
