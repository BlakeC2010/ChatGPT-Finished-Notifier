'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../background-core.js');

function buildHarness({ mode = 'auto', windows = [{ id: 1, left: 0, top: 0, width: 1200, height: 800, focused: true }], windowCreateFails = false } = {}) {
  const listeners = { message: null, installed: null, clicked: null, buttonClicked: null };
  const calls = { tabsCreated: [], windowsCreated: [], notifications: [], tabsUpdated: [], windowsUpdated: [], cleared: [] };
  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    importScripts() {},
    URLSearchParams,
    Date,
    console,
    chrome: {
      runtime: {
        lastError: null,
        getURL(path) { return `chrome-extension://test/${path}`; },
        onMessage: { addListener(fn) { listeners.message = fn; } },
        onInstalled: { addListener(fn) { listeners.installed = fn; } },
      },
      storage: { sync: { get(defaults, cb) { cb({ ...defaults, notificationMode: mode }); } } },
      windows: {
        getAll(_opts, cb) { cb(windows); },
        create(opts, cb) { calls.windowsCreated.push(opts); if (windowCreateFails) { context.chrome.runtime.lastError = { message: 'create failed' }; cb?.(undefined); context.chrome.runtime.lastError = null; return; } cb?.({ id: 99 }); },
        update(id, opts, cb) { calls.windowsUpdated.push([id, opts]); cb?.({ id, ...opts }); },
      },
      tabs: {
        create(opts, cb) { calls.tabsCreated.push(opts); cb?.({ id: 77 }); },
        update(id, opts, cb) { calls.tabsUpdated.push([id, opts]); cb?.({ id, windowId: 5 }); },
      },
      notifications: {
        create(id, opts, cb) { calls.notifications.push([id, opts]); context.chrome.runtime.lastError = null; cb?.(id); },
        clear(id, cb) { calls.cleared.push(id); cb?.(true); },
        onClicked: { addListener(fn) { listeners.clicked = fn; } },
        onButtonClicked: { addListener(fn) { listeners.buttonClicked = fn; } },
      },
    },
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('background.js', 'utf8'), context, { filename: 'background.js' });
  return { listeners, calls };
}

function send(h, message, sender = { tab: { id: 42 } }) {
  return new Promise((resolve) => {
    const keptOpen = h.listeners.message(message, sender, resolve);
    if (keptOpen !== true) resolve({ keptOpen });
  });
}

(async () => {
  {
    const h = buildHarness();
    assert.ok(h.listeners.installed, 'install listener should be registered');
    h.listeners.installed({ reason: 'install' });
    assert.equal(h.calls.tabsCreated.length, 1);
    assert.equal(h.calls.tabsCreated[0].url, 'chrome-extension://test/welcome.html');
    console.log('PASS opens welcome page after first install');
  }

  {
    const h = buildHarness({ mode: 'auto', windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: true }] });
    const response = await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'done-1' });
    assert.equal(response && response.ok, true);
    assert.equal(h.calls.windowsCreated.length, 1);
    assert.equal(h.calls.notifications.length, 0);
    assert.match(h.calls.windowsCreated[0].url, /toast\.html\?tab=42/);
    assert.equal(h.calls.windowsCreated[0].focused, false);
    console.log('PASS auto uses custom browser toast when Chrome is focused');
  }

  {
    const h = buildHarness({ mode: 'auto', windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: false }] });
    const response = await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'done-2' });
    assert.equal(response && response.ok, true);
    assert.equal(h.calls.windowsCreated.length, 0);
    assert.equal(h.calls.notifications.length, 1);
    assert.equal(h.calls.notifications[0][1].title, 'Response ready');
    assert.equal(h.calls.notifications[0][1].buttons?.[0]?.title, 'Open chat');
    console.log('PASS auto uses improved system notification outside Chrome');
  }

  {
    const h = buildHarness({
      mode: 'auto',
      windowCreateFails: true,
      windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: true }],
    });
    const response = await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'done-fallback' });
    assert.equal(response && response.ok, true);
    assert.equal(h.calls.windowsCreated.length, 1);
    assert.equal(h.calls.notifications.length, 1);
    console.log('PASS auto falls back to a system notification if browser toast creation fails');
  }

  {
    const h = buildHarness({ mode: 'system' });
    const response = await send(h, { type: 'TEST_NOTIFICATION', mode: 'system' }, { tab: { id: 77 } });
    assert.equal(response && response.ok, true);
    assert.equal(h.calls.notifications.length, 1);
    console.log('PASS welcome page can send a test notification');
  }
})();
