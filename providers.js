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
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send"]',
      ],
      completion: ['[data-testid="copy-turn-action-button"]'],
      prompt: [
        '#prompt-textarea',
        '[data-testid="prompt-textarea"]',
        'textarea',
        '[contenteditable="true"]',
      ],
    },
    {
      provider: 'Claude',
      hosts: ['claude.ai'],
      generating: [
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
        '[data-testid="action-bar-copy"]',
        'button[aria-label="Copy"]',
        'button[aria-label*="Copy" i]',
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
        'model-response button[aria-label="Copy"]',
        'model-response button[aria-label*="Copy" i]',
        'button[aria-label="Copy"]',
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
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
