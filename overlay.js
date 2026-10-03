(() => {
  'use strict';

  if (globalThis.__AI_CHAT_NOTIFICATIONS_OVERLAY_LOADED__) return;
  globalThis.__AI_CHAT_NOTIFICATIONS_OVERLAY_LOADED__ = true;

  const HOST_ID = 'ai-chat-notifications-overlay-host';
  const AUTO_DISMISS_MS = 7000;

  function removeExisting() {
    document.getElementById(HOST_ID)?.remove();
  }

  function showToast(message) {
    const sourceTabId = Number(message.sourceTabId);
    if (!Number.isInteger(sourceTabId)) return false;

    removeExisting();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = [
      'all:initial',
      'position:fixed',
      'top:18px',
      'right:18px',
      'z-index:2147483647',
      'width:min(360px,calc(100vw - 36px))',
      'pointer-events:auto'
    ].join(';');

    const shadow = host.attachShadow({ mode: 'closed' });
    const provider = String(message.provider || '').trim();
    const title = provider ? provider + ' response ready' : 'Response ready';
    const body = provider ? provider + ' finished responding.' : 'Your AI chat finished responding.';

    shadow.innerHTML = \`
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .toast {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: 34px minmax(0,1fr) 28px;
          gap: 11px;
          align-items: start;
          padding: 14px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px;
          background: #1c1d20;
          color: #f5f5f5;
          box-shadow: 0 12px 34px rgba(0,0,0,.34);
          font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
          animation: enter .16s ease-out;
        }
        .icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: #f5f5f5;
          color: #151619;
          font: 700 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
        }
        .copy { min-width: 0; padding-top: 1px; }
        .title {
          margin: 0;
          color: #fff;
          font-size: 14px;
          font-weight: 650;
          line-height: 1.25;
        }
        .body {
          margin: 4px 0 9px;
          color: #a8abb2;
          font-size: 12px;
          line-height: 1.4;
        }
        .open {
          appearance: none;
          padding: 0;
          border: 0;
          background: transparent;
          color: #d8ddff;
          font: 600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
          cursor: pointer;
        }
        .dismiss {
          appearance: none;
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #8f949c;
          font: 400 19px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
          cursor: pointer;
        }
        .dismiss:hover { background: rgba(255,255,255,.07); color: #fff; }
        .timer {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 2px;
          transform-origin: left;
          background: #8aa0ff;
          animation: timer \${AUTO_DISMISS_MS}ms linear forwards;
        }
        @keyframes enter {
          from { opacity: 0; transform: translateY(-8px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes timer {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @media (prefers-color-scheme: light) {
          .toast {
            border-color: rgba(0,0,0,.10);
            background: #fff;
            color: #17181b;
            box-shadow: 0 12px 34px rgba(0,0,0,.18);
          }
          .icon { background: #17181b; color: #fff; }
          .title { color: #17181b; }
          .body { color: #666b73; }
          .open { color: #5266ce; }
          .dismiss:hover { background: rgba(0,0,0,.05); color: #17181b; }
        }
      </style>
      <div class="toast" role="status" aria-live="polite">
        <div class="icon" aria-hidden="true">✓</div>
        <div class="copy">
          <p class="title"></p>
          <p class="body"></p>
          <button class="open" type="button">Open chat →</button>
        </div>
        <button class="dismiss" type="button" aria-label="Dismiss notification">×</button>
        <div class="timer" aria-hidden="true"></div>
      </div>
    \`;

    shadow.querySelector('.title').textContent = title;
    shadow.querySelector('.body').textContent = body;

    const timer = setTimeout(() => host.remove(), AUTO_DISMISS_MS);

    function dismiss() {
      clearTimeout(timer);
      host.remove();
    }

    shadow.querySelector('.dismiss').addEventListener('click', dismiss);
    shadow.querySelector('.open').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_CHAT', tabId: sourceTabId }, () => {
        void chrome.runtime.lastError;
        dismiss();
      });
    });

    document.documentElement.appendChild(host);
    return true;
  }

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
