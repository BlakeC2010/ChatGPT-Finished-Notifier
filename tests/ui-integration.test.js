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
  const version = makeElement();
  const writes = [];
  const messages = [];
  const timers = [];

  const document = {
    querySelectorAll(selector) { return selector === 'input[name="notificationMode"]' ? radios : []; },
    querySelector(selector) {
      if (selector === '#test-notification') return testButton;
      if (selector === '#status') return status;
      if (selector === '#version') return version;
      return null;
    },
  };

  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    document,
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; },
    chrome: {
      runtime: {
        lastError: null,
        getManifest() { return { version: '1.4.0' }; },
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
  return { radios, testButton, status, version, writes, messages, timers };
}

function runPopupHarness() {
  const radios = ['auto', 'browser', 'system'].map((value) => makeElement({ value, checked: false }));
  const testButton = makeElement();
  const settingsButton = makeElement();
  const status = makeElement();
  const version = makeElement();
  const writes = [];
  const messages = [];
  const timers = [];
  let optionsOpened = 0;

  const document = {
    querySelectorAll(selector) { return selector === 'input[name="notificationMode"]' ? radios : []; },
    querySelector(selector) {
      if (selector === '#popup-test') return testButton;
      if (selector === '#open-settings') return settingsButton;
      if (selector === '#popup-status') return status;
      if (selector === '#popup-version') return version;
      return null;
    },
  };

  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    document,
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; },
    chrome: {
      runtime: {
        lastError: null,
        getManifest() { return { version: '1.4.0' }; },
        sendMessage(message, cb) { messages.push(message); cb?.({ ok: true }); },
        openOptionsPage() { optionsOpened += 1; },
      },
      storage: {
        sync: {
          get(_defaults, cb) { cb({ notificationMode: 'auto' }); },
          set(value, cb) { writes.push(value); cb?.(); },
        },
      },
    },
    console,
  };

  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('popup.js', 'utf8'), context, { filename: 'popup.js' });
  return {
    radios,
    testButton,
    settingsButton,
    status,
    version,
    writes,
    messages,
    timers,
    get optionsOpened() { return optionsOpened; },
  };
}

{
  const h = runWelcomeHarness();
  assert.equal(h.version.textContent, 'v1.4.0');
  assert.equal(h.radios.find((r) => r.value === 'browser').checked, true);

  for (const radio of h.radios) radio.checked = radio.value === 'system';
  h.radios.find((r) => r.value === 'system').trigger('change');
  assert.equal(h.writes.at(-1).notificationMode, 'system');

  h.testButton.trigger('click');
  assert.equal(h.messages.at(-1).type, 'TEST_NOTIFICATION');
  assert.equal(h.messages.at(-1).mode, 'system');
  assert.match(h.status.textContent, /test notification/i);
  assert.equal(h.testButton.disabled, true);

  const messageCount = h.messages.length;
  h.testButton.trigger('click');
  assert.equal(h.messages.length, messageCount);
  assert.equal(h.timers.at(-1)[1], 1400);
  console.log('PASS onboarding shows live version and rate-limits test notifications');
}

{
  const h = runPopupHarness();
  assert.equal(h.version.textContent, 'v1.4.0');
  assert.equal(h.radios.find((r) => r.value === 'auto').checked, true);

  for (const radio of h.radios) radio.checked = radio.value === 'browser';
  h.radios.find((r) => r.value === 'browser').trigger('change');
  assert.equal(h.writes.at(-1).notificationMode, 'browser');

  h.testButton.trigger('click');
  assert.equal(h.messages.at(-1).type, 'TEST_NOTIFICATION');
  assert.equal(h.messages.at(-1).mode, 'browser');

  h.settingsButton.trigger('click');
  assert.equal(h.optionsOpened, 1);
  console.log('PASS toolbar popup changes notification mode and opens full settings');
}
