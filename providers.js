(function (root) {
  'use strict';

  const PROFILES = [
    {
      provider: 'ChatGPT',
      hosts: ['chatgpt.com'],
      generating: [
        '[data-testid="stop-button"]',
        'button[aria-label="Stop"]',
        '[role="button"][aria-label="Stop"]',
      ],
      send: [
        '#composer-submit-button',
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send"]',
      ],
      completion: [
        '[data-testid="copy-turn-action-button"]',
      ],
      responseText: [
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"] .prose',
        '[data-turn="assistant"] .markdown',
        '[data-turn="assistant"] .prose',
        '[data-testid^="conversation-turn-"] [data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"]',
        '[data-turn="assistant"]',
      ],
      prompt: [
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
      ],
    },
    {
      provider: 'Claude',
      hosts: ['claude.ai'],
      generating: [
        'div[data-is-streaming="true"]',
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
        '[role="button"][aria-label*="Stop" i]',
      ],
      send: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send" i]',
        'fieldset button[type="submit"]',
      ],
      completion: [
        '.font-claude-response',
        'div[data-is-streaming]',
        '[data-testid="action-bar-copy"]',
        'button[aria-label="Copy"]',
        'button[aria-label*="Copy" i]',
      ],
      responseText: [
        '.font-claude-response',
        '[data-is-streaming] .font-claude-response',
      ],
      prompt: [
        'div[contenteditable="true"].ProseMirror',
        'fieldset div[contenteditable="true"]',
        '[contenteditable="true"][aria-label*="prompt" i]',
        'div[contenteditable="true"]',
      ],
    },
    {
      provider: 'Gemini',
      hosts: ['gemini.google.com'],
      generating: [
        'button[aria-label*="Stop" i]',
        '[role="button"][aria-label*="Stop" i]',
        'model-response[aria-busy="true"]',
        'message-content[aria-busy="true"]',
      ],
      send: [
        'button[aria-label="Send message"]',
        'button[aria-label*="Send" i]',
        '.send-button',
        'button.send-button',
      ],
      completion: [
        'model-response',
        'message-content',
        '.model-response-text',
        '.markdown-main-panel',
        '.response-content',
        '[aria-label="Gemini response"]',
        '[data-message-author-role="model"]',
        'model-response button[aria-label="Copy"]',
        'model-response button[aria-label*="Copy" i]',
        'button[aria-label="Copy"]',
      ],
      responseText: [
        'model-response .model-response-text',
        'model-response .markdown-main-panel',
        'model-response .response-content',
        'model-response message-content .markdown-main-panel',
        'model-response message-content',
        '.last-response .response-content-markdown',
        '[aria-label="Gemini response"] .markdown-main-panel',
        '[data-message-author-role="model"] .markdown-main-panel',
        '.markdown-main-panel',
        '.model-response-text',
        '.response-content',
        'message-content',
        'model-response',
      ],
      prompt: [
        'div.ql-editor',
        'rich-textarea [contenteditable="true"]',
        '[aria-label="Enter a prompt here"]',
        '[contenteditable="true"][role="textbox"]',
      ],
    },
  ];

  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getProfile(hostname) {
    const host = normalize(hostname).replace(/\.$/, '');
    return PROFILES.find((profile) => profile.hosts.includes(host)) || null;
  }

  function conversationKeyFromUrl(value) {
    try {
      const url = new URL(String(value || ''));
      const path = url.pathname.replace(/\/+$/, '');
      if (url.hostname === 'chatgpt.com') {
        const conversation = path.match(/\/c\/([^/]+)(?:\/|$)/);
        if (conversation) return url.origin + '/c/' + conversation[1];
      }
      return url.origin + path;
    } catch (_) {
      return '';
    }
  }

  function descriptorText(descriptor = {}) {
    return [descriptor.testId, descriptor.ariaLabel, descriptor.title, descriptor.text]
      .map(normalize)
      .filter(Boolean)
      .join(' | ');
  }

  function isSendControlDescriptor(descriptor = {}) {
    const testId = normalize(descriptor.testId);
    if (/(^|[-_])(send|submit)([-_]|$)/.test(testId)) return true;

    const text = descriptorText(descriptor);
    if (!text || /\b(feedback|invite|share)\b/.test(text)) return false;
    return /\b(send|submit)(\s+(message|prompt|query|chat))?\b/.test(text);
  }

  function isCompletionMarkerDescriptor(descriptor = {}) {
    const testId = normalize(descriptor.testId);
    if (/(^|[-_])copy([-_]|$)/.test(testId)) return true;

    const text = descriptorText(descriptor);
    if (!text || /\bcopy\s+(link|url)\b/.test(text)) return false;
    return /\bcopy(\s+(response|answer|message|text))?\b/.test(text);
  }

  root.AIChatProviderProfiles = {
    PROFILES,
    getProfile,
    isSendControlDescriptor,
    isCompletionMarkerDescriptor,
    conversationKeyFromUrl,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
