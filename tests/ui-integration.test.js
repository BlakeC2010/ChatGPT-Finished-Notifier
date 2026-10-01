'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../background-core.js');

function makeElement(extra = {}) {
  const listeners = new Map();
  return {
    textContent: '',
    disabled: false,
    dataset: {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    trigger(type, event = {}) { listeners.get(type)?.({ stopPropagation() {}, ...event }); },
    ...extra,
  };
}

function runWelcomeHarness() {
  const radios = ['auto', 'browser', 'system'].map((value) => makeElement({ value, checked: false }));
  const testButton = makeElement();
  const status = makeElement();
  const writes = [];
  const messages = [];
  const document = {
    querySelectorAll(selector) { return selector === 'input[name="notificationMode"]' ? radios : []; },
    querySelector(selector) {
      if (selector === '#test-notification') return testButton;
      if (selector === '#status') return status;
      return null;
    },
  };
  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    document,
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, cb) { messages.push(message); cb?.({ ok: true }); },
      },
      storage: {
        sync: {
          get(_defaults, cb) { cb({ notificationMode: 'browser' }); },
          set(value, cb) { writes.push(value); cb?.(); },
        },
      },
    },
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('welcome.js', 'utf8'), context, { filename: 'welcome.js' });
  return { radios, testButton, status, writes, messages };
}

function runToastHarness() {
  const toast = makeElement();
  const openButton = makeElement();
  const dismiss = makeElement();
  let closes = 0;
  const messages = [];
  const timers = [];
  const document = {
    querySelector(selector) {
      if (selector === '#toast') return toast;
      if (selector === '#open-chat') return openButton;
      if (selector === '#dismiss') return dismiss;
      return null;
    },
  };
  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    document,
    location: { search: '?tab=42' },
    window: { close() { closes += 1; } },
    URLSearchParams,
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; },
    chrome: {
      runtime: {
        sendMessage(message, cb) { messages.push(message); cb?.({ ok: true }); },
      },
    },
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('toast.js', 'utf8'), context, { filename: 'toast.js' });
  return { toast, openButton, dismiss, messages, timers, get closes() { return closes; } };
}

{
  const h = runWelcomeHarness();
  assert.equal(h.radios.find((r) => r.value === 'browser').checked, true);
  for (const radio of h.radios) radio.checked = radio.value === 'system';
  h.radios.find((r) => r.value === 'system').trigger('change');
  assert.equal(h.writes.at(-1).notificationMode, 'system');
  h.testButton.trigger('click');
  assert.equal(h.messages.at(-1).type, 'TEST_NOTIFICATION');
  assert.equal(h.messages.at(-1).mode, 'system');
  assert.match(h.status.textContent, /test notification/i);
  console.log('PASS onboarding loads, saves, and tests notification preferences');
}

{
  const h = runToastHarness();
  h.toast.trigger('click');
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].type, 'OPEN_CHAT');
  assert.equal(h.messages[0].tabId, 42);
  assert.equal(h.closes, 1);
  assert.equal(h.timers[0][1], 7000);
  console.log('PASS custom browser toast opens the originating chat and auto-dismisses');
}
