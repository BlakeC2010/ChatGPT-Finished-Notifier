'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../content-core.js');

function buildHarness({
  hostname = 'chatgpt.com',
  pathname = '/c/source-chat',
  href = 'https://chatgpt.com/c/source-chat',
} = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timerTasks = new Map();
  const attributes = new Map();
  let nextTimer = 1;
  let mutationCallback = null;

  const state = {
    generating: false,
    completionMarkers: 0,
    hidden: false,
    focused: true,
    sends: [],
    postedMessages: [],
    responseText: 'Here is the finished AI response preview.',
  };

  const location = {
    hostname,
    origin: 'https://' + hostname,
    pathname,
    href,
  };

  const sendButton = {
    disabled: false,
    hidden: false,
    textContent: '',
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      if (name === 'data-testid') return 'send-button';
      return null;
    },
    closest(selector) {
      return selector.includes('send-button') ? this : null;
    },
  };

  const editor = {
    value: 'hello',
    textContent: 'hello',
    getAttribute(name) {
      if (name === 'data-testid') return 'prompt-textarea';
      return null;
    },
    closest(selector) {
      if (selector.includes('prompt-textarea') || selector.includes('textarea')) return this;
      if (selector === 'form') return null;
      return null;
    },
  };

  const responseElement = {
    get innerText() { return state.responseText; },
    get textContent() { return state.responseText; },
  };

  const documentElement = {
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };

  const document = {
    title: 'Geometry Homework - ChatGPT',
    body: null,
    documentElement,
    get hidden() { return state.hidden; },
    hasFocus() { return state.focused; },
    querySelector(selector) {
      if (selector.includes('stop-button') || selector.includes('aria-label="Stop"')) {
        return state.generating ? sendButton : null;
      }
      if (selector.includes('send-button') || selector.includes('Send prompt') || selector.includes('Send message')) {
        return sendButton;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button, [role="button"]') return [];
      if (
        selector.includes('data-message-author-role')
        || selector.includes('copy-turn-action-button')
        || selector.includes('data-turn="assistant"')
      ) {
        return state.completionMarkers ? [responseElement] : [];
      }
      return [];
    },
    addEventListener(type, fn) {
      documentListeners.set(type, fn);
    },
  };

  const window = {
    addEventListener(type, fn) {
      windowListeners.set(type, fn);
    },
    postMessage(message) {
      state.postedMessages.push(message);
    },
  };

  class MutationObserver {
    constructor(fn) { mutationCallback = fn; }
    observe() {}
    disconnect() {}
  }

  const context = {
    globalThis: null,
    ChatGPTNotifierCore: core,
    document,
    window,
    location,
    MutationObserver,
    chrome: {
      runtime: {
        sendMessage(message) {
          state.sends.push(message);
          return Promise.resolve({ ok: true });
        },
      },
    },
    crypto: { randomUUID: () => 'test-id' },
    Date,
    Math,
    Promise,
    console,
    setTimeout(fn) {
      const id = nextTimer++;
      timerTasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timerTasks.delete(id);
    },
  };
  context.globalThis = context;

  vm.runInNewContext(fs.readFileSync('providers.js', 'utf8'), context, { filename: 'providers.js' });
  vm.runInNewContext(fs.readFileSync('content.js', 'utf8'), context, { filename: 'content.js' });

  return {
    state,
    location,
    attributes,
    sendButton,
    editor,
    documentListeners,
    windowListeners,
    mutate() {
      assert.ok(mutationCallback, 'MutationObserver callback should exist');
      mutationCallback([]);
    },
    flushTimers() {
      while (timerTasks.size) {
        const tasks = [...timerTasks.values()];
        timerTasks.clear();
        for (const fn of tasks) fn();
      }
    },
    streamEvent(type) {
      const raw = attributes.get('data-ai-chat-notifier-cycle');
      assert.ok(raw, 'response cycle attribute should exist');
      const cycle = JSON.parse(raw);
      const listener = windowListeners.get('message');
      assert.ok(listener, 'stream message listener should exist');
      listener({
        source: window,
        data: {
          source: 'ai-chat-notifications',
          type,
          cycleId: cycle.cycleId,
        },
      });
    },
  };
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('clicking Send arms before a fast response and includes title preview and source URL', () => {
  const h = buildHarness();
  assert.ok(h.documentListeners.has('click'), 'content script must capture send clicks');

  h.documentListeners.get('click')({ target: h.sendButton });
  h.state.hidden = true;
  h.state.focused = false;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();

  assert.equal(h.state.sends.length, 1);
  assert.equal(h.state.sends[0].type, 'CHATGPT_RESPONSE_COMPLETE');
  assert.equal(h.state.sends[0].provider, 'ChatGPT');
  assert.equal(h.state.sends[0].chatTitle, 'Geometry Homework');
  assert.equal(h.state.sends[0].snippet, 'Here is the finished AI response preview.');
  assert.equal(h.state.sends[0].sourceUrl, 'https://chatgpt.com/c/source-chat');
});

run('pressing Enter in the prompt editor also arms the response cycle', () => {
  const h = buildHarness();

  h.documentListeners.get('keydown')({
    target: h.editor,
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
  });
  h.state.hidden = true;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();

  assert.equal(h.state.sends.length, 1);
});

run('switching to another chat waits for the original response stream and still notifies', () => {
  const h = buildHarness();
  h.state.generating = true;
  h.documentListeners.get('click')({ target: h.sendButton });
  h.mutate();

  assert.ok(h.state.postedMessages.some((message) => message.type === 'ARM_STREAM_TRACKER'));

  h.location.pathname = '/c/other-chat';
  h.location.href = 'https://chatgpt.com/c/other-chat';
  h.state.generating = false;
  h.state.responseText = 'Partial answer captured before leaving the chat.';
  h.mutate();
  h.flushTimers();

  assert.equal(h.state.sends.length, 0, 'route change must not be mistaken for response completion');

  h.streamEvent('STREAM_TRACKING');
  h.streamEvent('STREAM_DONE');
  h.flushTimers();

  assert.equal(h.state.sends.length, 1);
  assert.equal(h.state.sends[0].chatTitle, 'Geometry Homework');
  assert.equal(h.state.sends[0].sourceUrl, 'https://chatgpt.com/c/source-chat');
});

run('a newly created chat can adopt its assigned conversation URL during generation', () => {
  const h = buildHarness({ pathname: '/', href: 'https://chatgpt.com/' });
  h.state.generating = true;
  h.documentListeners.get('click')({ target: h.sendButton });

  h.location.pathname = '/c/newly-assigned';
  h.location.href = 'https://chatgpt.com/c/newly-assigned';
  h.mutate();

  h.state.hidden = true;
  h.state.generating = false;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();

  assert.equal(h.state.sends.length, 1);
  assert.equal(h.state.sends[0].sourceUrl, 'https://chatgpt.com/c/newly-assigned');
});
