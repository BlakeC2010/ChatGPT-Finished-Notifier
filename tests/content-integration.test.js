'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../content-core.js');

function buildHarness() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timerTasks = new Map();
  let nextTimer = 1;
  let mutationCallback = null;
  const state = {
    generating: false,
    completionMarkers: 0,
    hidden: false,
    focused: true,
    sends: [],
  };

  const sendButton = {
    disabled: false,
    hidden: false,
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

  const document = {
    documentElement: {},
    get hidden() { return state.hidden; },
    hasFocus() { return state.focused; },
    querySelector(selector) {
      if (selector.includes('stop-button') || selector.includes('aria-label="Stop"')) {
        return state.generating ? {} : null;
      }
      if (selector.includes('send-button') || selector.includes('Send prompt') || selector.includes('Send message')) {
        return sendButton;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('copy-turn-action-button')) {
        return Array.from({ length: state.completionMarkers }, () => ({}));
      }
      if (selector === 'button, [role="button"]') return [];
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

  vm.runInNewContext(fs.readFileSync('content.js', 'utf8'), context, { filename: 'content.js' });

  return {
    state,
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

run('clicking Send arms before a fast response and notifies after completion marker appears', () => {
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
});

run('pressing Enter in the prompt editor also arms the response cycle', () => {
  const h = buildHarness();
  assert.ok(h.documentListeners.has('keydown'), 'content script must capture prompt Enter');

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
  h.state.focused = false;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();

  assert.equal(h.state.sends.length, 1);
});
