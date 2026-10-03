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

  function removeExisting() {
    document.getElementById(HOST_ID)?.remove();
  }

  function showToast(message = {}) {
    const sourceTabId = Number(message.sourceTabId);
    const canOpenSource = Number.isInteger(sourceTabId);
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
      'width:min(356px,calc(100vw - 32px))',
      'pointer-events:auto'
    ].join(';');

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }

        .toast {
          --bg: #202123;
          --surface: #2a2b2e;
          --border: rgba(255,255,255,.10);
          --text: #f7f7f8;
          --muted: #b6b8be;
          --accent: #aeb2bb;
          --accent-soft: rgba(174,178,187,.13);
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 13px 14px 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg);
          color: var(--text);
          box-shadow: 0 12px 32px rgba(0,0,0,.32);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          animation: enter .16s ease-out;
        }

        .toast.light {
          --bg: #ffffff;
          --surface: #f3f4f6;
          --border: rgba(17,24,39,.12);
          --text: #202123;
          --muted: #6b7280;
          box-shadow: 0 12px 28px rgba(0,0,0,.16);
        }

        .toast.chatgpt {
          --accent: #10a37f;
          --accent-soft: rgba(16,163,127,.13);
        }

        .toast.claude {
          --bg: #26221f;
          --surface: #332d28;
          --text: #f4eee8;
          --muted: #c0b6ad;
          --accent: #d97757;
          --accent-soft: rgba(217,119,87,.14);
        }
        .toast.claude.light {
          --bg: #f7f3ee;
          --surface: #eee7df;
          --text: #2b2520;
          --muted: #776b61;
        }

        .toast.gemini {
          --bg: #202124;
          --surface: #2b2c31;
          --text: #f1f3f4;
          --muted: #bdc1c6;
          --accent: #8ab4f8;
          --accent-soft: rgba(138,180,248,.15);
        }
        .toast.gemini.light {
          --bg: #ffffff;
          --surface: #f1f3f4;
          --text: #202124;
          --muted: #5f6368;
        }

        .top {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 7px;
        }

        .dot {
          width: 7px;
          height: 7px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: var(--accent);
          box-shadow: 0 0 0 4px var(--accent-soft);
        }

        .provider {
          flex: 1;
          min-width: 0;
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
        }

        .dismiss {
          appearance: none;
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          margin: -5px -5px -5px 0;
          padding: 0;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          font: 400 17px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          cursor: pointer;
        }

        .dismiss:hover { background: var(--surface); color: var(--text); }

        .title {
          margin: 0;
          overflow: hidden;
          color: var(--text);
          font-size: 14px;
          font-weight: 650;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .snippet {
          display: -webkit-box;
          margin: 5px 0 0;
          overflow: hidden;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.45;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .open {
          appearance: none;
          margin-top: 10px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--accent);
          font: 650 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          cursor: pointer;
        }

        .timer {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          height: 2px;
          transform-origin: left;
          background: var(--accent);
          animation: countdown ${AUTO_DISMISS_MS}ms linear forwards;
        }

        @keyframes enter {
          from { opacity: 0; transform: translateY(-7px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes countdown {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      </style>

      <section class="toast ${brand} ${theme}" role="status" aria-live="polite">
        <div class="top">
          <span class="dot" aria-hidden="true"></span>
          <span class="provider"></span>
          <button class="dismiss" type="button" aria-label="Dismiss notification">×</button>
        </div>
        <p class="title"></p>
        <p class="snippet"></p>
        <button class="open" type="button">Open chat →</button>
        <div class="timer" aria-hidden="true"></div>
      </section>
    `;

    shadow.querySelector('.provider').textContent = provider || 'AI Chat Notifications';
    shadow.querySelector('.title').textContent = title;
    shadow.querySelector('.snippet').textContent = snippet;

    const openButton = shadow.querySelector('.open');
    if (!canOpenSource) openButton.hidden = true;

    const timer = setTimeout(() => host.remove(), AUTO_DISMISS_MS);

    function dismiss() {
      clearTimeout(timer);
      host.remove();
    }

    shadow.querySelector('.dismiss').addEventListener('click', dismiss);

    if (canOpenSource) {
      openButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_CHAT', tabId: sourceTabId }, () => {
          void chrome.runtime.lastError;
          dismiss();
        });
      });
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
