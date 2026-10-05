'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../background-core.js');
const test = require('node:test');

function buildHarness({
  mode = 'auto',
  windows = [{ id: 1, left: 0, top: 0, width: 1200, height: 800, focused: true }],
  tabMessageFails = false,
  deferOverlayInjection = false,
  deferNotificationClear = false,
  sourceTab = { id: 42, windowId: 1, active: false, url: 'https://chatgpt.com/c/source-chat' },
} = {}) {
  const listeners = { message: null, installed: null, clicked: null, buttonClicked: null };
  const calls = {
    tabsCreated: [],
    notifications: [],
    tabsUpdated: [],
    tabsMessages: [],
    windowsUpdated: [],
    cleared: [],
    scriptsInjected: [],
  };
  const sessionStore = {};
  const overlayCallbacks = [];
  const clearCallbacks = [];

  const context = {
    globalThis: null,
    ChatGPTNotifierBackgroundCore: core,
    importScripts(...paths) {
      for (const path of paths) vm.runInNewContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
    },
    URL,
    Date,
    console,
    chrome: {
      runtime: {
        lastError: null,
        getURL(path) { return `chrome-extension://test/${path}`; },
        onMessage: { addListener(fn) { listeners.message = fn; } },
        onInstalled: { addListener(fn) { listeners.installed = fn; } },
      },
      storage: {
        sync: {
          get(defaults, cb) { cb({ ...defaults, notificationMode: mode }); },
        },
        session: {
          set(value, cb) { Object.assign(sessionStore, value); cb?.(); },
          get(key, cb) {
            if (typeof key === 'string') cb({ [key]: sessionStore[key] });
            else cb({ ...sessionStore });
          },
          remove(key, cb) { delete sessionStore[key]; cb?.(); },
        },
      },
      scripting: {
        executeScript(opts, cb) {
          calls.scriptsInjected.push(opts);
          if (deferOverlayInjection && opts.files.includes('overlay.js')) {
            overlayCallbacks.push(cb);
            return;
          }
          cb?.([]);
        },
      },
      windows: {
        getAll(_opts, cb) { cb(windows); },
        update(id, opts, cb) {
          calls.windowsUpdated.push([id, opts]);
          cb?.({ id, ...opts });
        },
      },
      tabs: {
        get(id, cb) {
          if (!sourceTab) {
            context.chrome.runtime.lastError = { message: 'No tab with id: ' + id };
            cb(undefined);
            context.chrome.runtime.lastError = null;
            return;
          }
          context.chrome.runtime.lastError = null;
          cb({ ...sourceTab, id });
        },
        create(opts, cb) { calls.tabsCreated.push(opts); cb?.({ id: 77 }); },
        query(_opts, cb) { cb?.([{ id: 77, windowId: 1 }]); },
        sendMessage(id, message, cb) {
          calls.tabsMessages.push([id, message]);
          if (tabMessageFails) {
            context.chrome.runtime.lastError = { message: 'cannot access page' };
            cb?.(undefined);
            context.chrome.runtime.lastError = null;
            return;
          }
          cb?.({ ok: true });
        },
        update(id, opts, cb) {
          calls.tabsUpdated.push([id, opts]);
          cb?.({ id, windowId: 5 });
        },
      },
      notifications: {
        create(id, opts, cb) {
          calls.notifications.push([id, opts]);
          context.chrome.runtime.lastError = null;
          cb?.(id);
        },
        clear(id, cb) {
          calls.cleared.push(id);
          if (deferNotificationClear) clearCallbacks.push(cb);
          else cb?.(true);
        },
        onClicked: { addListener(fn) { listeners.clicked = fn; } },
        onButtonClicked: { addListener(fn) { listeners.buttonClicked = fn; } },
      },
    },
  };

  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('background.js', 'utf8'), context, { filename: 'background.js' });
  return {
    listeners, calls, sessionStore,
    setSourceTab(value) { sourceTab = value; },
    flushOverlayInjection() { for (const cb of overlayCallbacks.splice(0)) cb?.([]); },
    flushNotificationClear() { for (const cb of clearCallbacks.splice(0)) cb?.(true); },
  };
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
    assert.equal(h.calls.scriptsInjected.length, 2);
    assert.deepEqual(Array.from(h.calls.scriptsInjected[0].files), ['stream-bridge.js']);
    assert.equal(h.calls.scriptsInjected[0].world, 'MAIN');
    assert.deepEqual(Array.from(h.calls.scriptsInjected[1].files), ['providers.js', 'content-core.js', 'content.js']);

    h.listeners.installed({ reason: 'install' });
    assert.equal(h.calls.tabsCreated.length, 1);
    assert.equal(h.calls.tabsCreated[0].url, 'chrome-extension://test/welcome.html');
    console.log('PASS reinjects stream and DOM detectors into open supported tabs');
  }

  {
    const h = buildHarness({
      mode: 'auto',
      windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: true }],
    });

    const response = await send(h, {
      type: 'CHATGPT_RESPONSE_COMPLETE',
      completionId: 'done-1',
      provider: 'ChatGPT',
      chatTitle: 'My project chat',
      snippet: 'A short preview of the finished response.',
      sourceTheme: 'dark',
      sourceUrl: 'https://chatgpt.com/c/source-chat',
    });

    assert.equal(response?.ok, true);
    assert.equal(h.calls.scriptsInjected.length, 3);
    assert.deepEqual(Array.from(h.calls.scriptsInjected[2].files), ['overlay.js']);
    assert.equal(h.calls.tabsMessages.length, 1);
    assert.equal(h.calls.tabsMessages[0][0], 77);

    const message = h.calls.tabsMessages[0][1];
    assert.equal(message.type, 'SHOW_INLINE_TOAST');
    assert.equal(message.sourceTabId, 42);
    assert.equal(message.chatTitle, 'My project chat');
    assert.equal(message.snippet, 'A short preview of the finished response.');
    assert.equal(message.sourceTheme, 'dark');
    assert.equal(message.sourceUrl, 'https://chatgpt.com/c/source-chat');
    assert.equal(h.calls.notifications.length, 0);
    console.log('PASS auto shows contextual in-page alert in the active Chrome tab');
  }

  {
    const h = buildHarness({
      mode: 'auto',
      windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: false }],
    });

    const response = await send(h, {
      type: 'CHATGPT_RESPONSE_COMPLETE',
      completionId: 'done-2',
      provider: 'Claude',
      chatTitle: 'Essay outline',
      snippet: 'Here is a concise outline for your essay.',
      sourceUrl: 'https://claude.ai/chat/source-chat',
    });

    assert.equal(response?.ok, true);
    assert.equal(h.calls.tabsMessages.length, 0);
    assert.equal(h.calls.notifications.length, 1);

    const [notificationId, options] = h.calls.notifications[0];
    assert.equal(options.title, 'Essay outline');
    assert.equal(options.message, 'Here is a concise outline for your essay.');
    assert.match(options.contextMessage, /Claude/);
    assert.match(options.iconUrl, /^data:image\/svg\+xml/);
    assert.equal(options.buttons?.[0]?.title, 'Open chat');

    h.listeners.clicked(notificationId);
    assert.equal(h.calls.tabsUpdated.at(-1)[0], 42);
    assert.equal(h.calls.tabsUpdated.at(-1)[1].url, 'https://claude.ai/chat/source-chat');
    console.log('PASS system alert uses provider icon and returns to the original chat URL');
  }

  {
    const h = buildHarness({
      mode: 'auto',
      tabMessageFails: true,
      windows: [{ id: 1, left: 10, top: 20, width: 1200, height: 800, focused: true }],
    });
    const response = await send(h, {
      type: 'CHATGPT_RESPONSE_COMPLETE',
      completionId: 'done-fallback',
      provider: 'Gemini',
    });

    assert.equal(response?.ok, true);
    assert.equal(h.calls.tabsMessages.length, 1);
    assert.equal(h.calls.notifications.length, 1);
    console.log('PASS browser mode falls back to a system notification on restricted pages');
  }

  {
    const h = buildHarness({ mode: 'system' });
    const response = await send(h, { type: 'TEST_NOTIFICATION', mode: 'system' }, {});
    assert.equal(response?.ok, true);
    assert.equal(h.calls.notifications.length, 1);
    assert.equal(h.calls.notifications[0][0], 'chatgpt-done:77:test');
    assert.ok(h.calls.cleared.includes('chatgpt-done:77:test'));
    console.log('PASS test notifications reuse one system notification id');
  }
})();

for (const mode of ['auto', 'browser', 'system']) {
  test(mode + ' suppresses a late completion after returning to the visible source chat', async () => {
    const h = buildHarness({ mode, sourceTab: {
      id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/source-chat',
    } });
    const response = await send(h, {
      type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'late', provider: 'ChatGPT',
      sourceUrl: 'https://chatgpt.com/c/source-chat',
    });
    assert.equal(response.ok, true, 'suppression must acknowledge the cycle to prevent retries');
    assert.equal(h.calls.notifications.length, 0);
    assert.equal(h.calls.tabsMessages.length, 0);
  });
}

test('a source chat still visible on an unfocused monitor stays quiet', async () => {
  const h = buildHarness({ mode: 'system', windows: [{ id: 1, focused: false, state: 'normal' }],
    sourceTab: { id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/source-chat' } });
  await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'visible', provider: 'ChatGPT',
    sourceUrl: 'https://chatgpt.com/c/source-chat' });
  assert.equal(h.calls.notifications.length, 0);
});

test('switching conversations in the same active tab still allows the original completion alert', async () => {
  const h = buildHarness({ mode: 'system', sourceTab: {
    id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/other-chat',
  } });
  await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'other-chat', provider: 'ChatGPT',
    sourceUrl: 'https://chatgpt.com/c/source-chat' });
  assert.equal(h.calls.notifications.length, 1);
});

test('a minimized source window may still receive a completion notification', async () => {
  const h = buildHarness({ mode: 'system', windows: [{ id: 1, focused: false, state: 'minimized' }],
    sourceTab: { id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/source-chat' } });
  await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'minimized', provider: 'ChatGPT',
    sourceUrl: 'https://chatgpt.com/c/source-chat' });
  assert.equal(h.calls.notifications.length, 1);
});

test('a completion whose source tab has been closed is quietly acknowledged', async () => {
  const h = buildHarness({ mode: 'system', sourceTab: null });
  const response = await send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'closed', provider: 'ChatGPT',
    sourceUrl: 'https://chatgpt.com/c/source-chat' });
  assert.equal(response.ok, true);
  assert.equal(h.calls.notifications.length, 0);
});

for (const mode of ['auto', 'browser']) {
  test(mode + ' suppresses a completion when the source becomes visible during overlay injection', async () => {
    const h = buildHarness({ mode, deferOverlayInjection: true });
    const pending = send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'injection-race',
      provider: 'ChatGPT', sourceUrl: 'https://chatgpt.com/c/source-chat' });
    h.setSourceTab({ id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/source-chat' });
    h.flushOverlayInjection();
    assert.equal((await pending).ok, true);
    assert.equal(h.calls.tabsMessages.length, 0);
    assert.equal(h.calls.notifications.length, 0);
  });
}

test('system delivery suppresses a completion when the source becomes visible during notification setup', async () => {
  const h = buildHarness({ mode: 'system', deferNotificationClear: true });
  const pending = send(h, { type: 'CHATGPT_RESPONSE_COMPLETE', completionId: 'system-race',
    provider: 'ChatGPT', sourceUrl: 'https://chatgpt.com/c/source-chat' });
  h.setSourceTab({ id: 42, windowId: 1, active: true, url: 'https://chatgpt.com/c/source-chat' });
  h.flushNotificationClear();
  assert.equal((await pending).ok, true);
  assert.equal(h.calls.notifications.length, 0);
});
