(function (root) {
  'use strict';

  const PROFILES = [
    {
      provider: 'ChatGPT',
      hosts: ['chatgpt.com'],
      stop: ['[data-testid="stop-button"]', 'button[aria-label="Stop"]', '[role="button"][aria-label="Stop"]'],
      send: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
      completion: ['[data-testid="copy-turn-action-button"]'],
      prompt: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea', '[contenteditable="true"]'],
    },
    {
      provider: 'Claude',
      hosts: ['claude.ai'],
      stop: ['button[aria-label^="Stop"]', '[role="button"][aria-label^="Stop"]', '[data-testid*="stop"]'],
      send: ['button[aria-label^="Send"]', 'button[type="submit"]', '[data-testid*="send"]'],
      completion: ['button[aria-label^="Copy"]', '[data-testid*="copy"]'],
      prompt: ['textarea', '[contenteditable="true"]'],
    },
    {
      provider: 'Gemini',
      hosts: ['gemini.google.com'],
      stop: ['button[aria-label^="Stop"]', '[role="button"][aria-label^="Stop"]', '[data-test-id*="stop"]'],
      send: ['button[aria-label^="Send"]', 'button[mattooltip^="Send"]', 'button[type="submit"]'],
      completion: ['button[aria-label^="Copy"]', '[data-test-id*="copy"]'],
      prompt: ['textarea', '.ql-editor[contenteditable="true"]', '[contenteditable="true"]'],
    },
    {
      provider: 'Grok',
      hosts: ['grok.com'],
      stop: ['button[aria-label^="Stop"]', '[role="button"][aria-label^="Stop"]', '[data-testid*="stop"]'],
      send: ['button[aria-label^="Send"]', 'button[aria-label^="Submit"]', 'button[type="submit"]'],
      completion: ['button[aria-label^="Copy"]', '[data-testid*="copy"]'],
      prompt: ['textarea', '[contenteditable="true"]'],
    },
    {
      provider: 'Kimi',
      hosts: ['kimi.com', 'www.kimi.com'],
      stop: ['button[aria-label^="Stop"]', '[role="button"][aria-label^="Stop"]', '[data-testid*="stop"]'],
      send: ['button[aria-label^="Send"]', 'button[aria-label^="Submit"]', 'button[type="submit"]'],
      completion: ['button[aria-label^="Copy"]', '[data-testid*="copy"]'],
      prompt: ['textarea', '[contenteditable="true"]'],
    },
    {
      provider: 'Meta AI',
      hosts: ['meta.ai', 'www.meta.ai'],
      stop: ['button[aria-label^="Stop"]', '[role="button"][aria-label^="Stop"]', '[data-testid*="stop"]'],
      send: ['button[aria-label^="Send"]', 'button[aria-label^="Submit"]', 'button[type="submit"]'],
      completion: ['button[aria-label^="Copy"]', '[data-testid*="copy"]'],
      prompt: ['textarea', '[contenteditable="true"]'],
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
