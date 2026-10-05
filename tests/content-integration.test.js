'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../content-core.js');
const test = require('node:test');

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
    assistantContainers: 0,
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
      if (selector === 'form') return composerForm;
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
      if (selector === 'form') return composerForm;
      return null;
    },
  };

  const composerForm = {
    querySelector(selector) {
      if (selector.includes('prompt-textarea') || selector.includes('textarea')) return editor;
      if (selector.includes('send-button')) return sendButton;
      return null;
    },
  };

  const stopButton = {
    disabled: false,
    hidden: false,
    textContent: '',
    getAttribute(name) { return name === 'data-testid' ? 'stop-button' : null; },
    closest(selector) {
      return selector.includes('stop-button') || selector === 'button, [role="button"]' ? this : null;
    },
  };

  const copyButton = {
    disabled: false,
    hidden: false,
    getAttribute(name) { return name === 'data-testid' ? 'copy-turn-action-button' : null; },
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
      if (selector.includes('stop-button') || selector.includes('aria-label="Stop"')) {
        return state.generating ? [stopButton] : [];
      }
      if (selector.includes('copy-turn-action-button')) {
        return [...(state.completionMarkers ? [copyButton] : []), ...(selector.includes('data-message-author-role') && state.assistantContainers ? [responseElement] : [])];
      }
      if (
        selector.includes('data-message-author-role')
        || selector.includes('copy-turn-action-button')
        || selector.includes('data-turn="assistant"')
      ) {
        return state.completionMarkers || state.assistantContainers ? [responseElement] : [];
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
      windowListeners.get('message')?.({ source: window, data: message });
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
    URL,
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
    stopButton,
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
    installStreamBridge(response) {
      window.fetch = async () => response;
      vm.runInNewContext(fs.readFileSync('stream-bridge.js', 'utf8'), context, { filename: 'stream-bridge.js' });
      return (...args) => window.fetch(...args);
    },
    streamEvent(type, cycleId) {
      const raw = attributes.get('data-ai-chat-notifier-cycle');
      assert.ok(raw || cycleId, 'response cycle attribute should exist');
      const cycle = raw ? JSON.parse(raw) : { cycleId };
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

function unrelatedDialog(ariaLabel = '') {
  const hasSelector = (selector, token) => selector.split(',').map(x => x.trim()).includes(token);
  const editor = {
    value: 'Feedback about this chat',
    closest(selector) {
      if (selector === 'form') return form;
      return hasSelector(selector, 'textarea') ? this : null;
    },
  };
  const button = {
    disabled: false, textContent: 'Submit feedback',
    getAttribute: name => name === 'aria-label' ? ariaLabel : null,
    closest(selector) {
      if (selector === 'form') return form;
      return hasSelector(selector, 'button[type="submit"]') || hasSelector(selector, 'button')
        || hasSelector(selector, 'button[aria-label="' + ariaLabel + '"]') ? this : null;
    },
  };
  const form = {
    querySelector(selector) {
      if (hasSelector(selector, 'textarea')) return editor;
      if (hasSelector(selector, 'button[type="submit"]')) return button;
      return null;
    },
  };
  return { editor, button, form };
}

for (const action of ['click', 'submit', 'keydown']) {
  test('an unrelated nonempty dialog editor cannot arm a response through ' + action, () => {
    const h = buildHarness();
    const dialog = unrelatedDialog();
    const target = action === 'click' ? dialog.button : action === 'submit' ? dialog.form : dialog.editor;
    h.documentListeners.get(action)({ target, key: 'Enter' });
    assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false);
  });
}

for (const label of ['Send', 'Send message', 'Send prompt']) {
  test('a dialog button labelled ' + label + ' is not a chat submission', () => {
    const h = buildHarness();
    h.documentListeners.get('click')({ target: unrelatedDialog(label).button });
    assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false);
  });
}

test('a Send label fallback within the real composer still detects a response', () => {
  const h = buildHarness();
  const button = {
    disabled: false, textContent: '',
    getAttribute: name => name === 'aria-label' ? 'Send' : null,
    closest(selector) {
      if (selector === 'form') return { querySelector: s => s.includes('prompt-textarea') ? h.editor : null };
      return selector.split(',').map(s => s.trim()).includes('button[aria-label="Send"]') ? this : null;
    },
  };
  h.documentListeners.get('click')({ target: button });
  h.state.hidden = true;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();
  assert.equal(h.state.sends.length, 1);
});

for (const starter of ['/g/project-id/project', '/g/custom-gpt']) {
  test('a visible new chat adopts its assigned conversation from ' + starter, () => {
    const h = buildHarness({ pathname: starter, href: 'https://chatgpt.com' + starter });
    h.documentListeners.get('click')({ target: h.sendButton });
    h.streamEvent('STREAM_TRACKING');
    const prefix = starter.replace(/\/project$/, '');
    h.location.pathname = prefix + '/c/new-assigned';
    h.location.href = 'https://chatgpt.com' + h.location.pathname;
    h.mutate();
    h.state.completionMarkers = 1;
    h.streamEvent('STREAM_DONE');
    h.flushTimers();
    assert.equal(h.state.sends.length, 0);
  });

  test('navigating to an existing chat from ' + starter + ' keeps tracking the original response', () => {
    const h = buildHarness({ pathname: starter, href: 'https://chatgpt.com' + starter });
    h.documentListeners.get('click')({ target: h.sendButton });
    h.streamEvent('STREAM_TRACKING');
    const destination = starter.replace(/\/project$/, '') + '/c/other-chat';
    const link = { href: 'https://chatgpt.com' + destination };
    h.documentListeners.get('click')({ target: {
      closest: selector => selector === 'a[href]' ? link : null,
    } });
    h.location.pathname = destination;
    h.location.href = link.href;
    h.mutate();
    h.streamEvent('STREAM_DONE');
    h.flushTimers();
    assert.equal(h.state.sends.length, 1);
    assert.equal(h.state.sends[0].sourceUrl, 'https://chatgpt.com' + starter);
  });
}

for (const action of [
  { name: 'Ctrl-click', ctrlKey: true },
  { name: 'Cmd-click', metaKey: true },
  { name: 'Shift-click', shiftKey: true },
  { name: 'middle-click', button: 1 },
  { name: 'a new-tab link', target: '_blank' },
  { name: 'a download link', download: true },
  { name: 'an external link', href: 'https://example.test/' },
]) {
  test(action.name + ' cannot prevent a new project chat adopting its assigned address', () => {
    const h = buildHarness({ pathname: '/g/project-id/project', href: 'https://chatgpt.com/g/project-id/project' });
    h.documentListeners.get('click')({ target: h.sendButton });
    h.streamEvent('STREAM_TRACKING');
    const link = {
      href: action.href || 'https://chatgpt.com/g/project-id/c/other-chat',
      getAttribute: name => name === 'target' ? action.target || '' : null,
      hasAttribute: name => name === 'download' && Boolean(action.download),
    };
    h.documentListeners.get('click')({ ...action, target: {
      closest: selector => selector === 'a[href]' ? link : null,
    } });
    h.location.pathname = '/g/project-id/c/new-assigned';
    h.location.href = 'https://chatgpt.com/g/project-id/c/new-assigned';
    h.mutate();
    h.streamEvent('STREAM_DONE');
    h.flushTimers();
    assert.equal(h.state.sends.length, 0);
  });
}

test('stopping the source response cancels even when the native cloned stream closes normally', async () => {
  const h = buildHarness();
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
  const fetch = h.installStreamBridge(response);
  h.documentListeners.get('click')({ target: h.sendButton });
  const result = await fetch('https://chatgpt.com/backend-api/conversation', { method: 'POST' });
  assert.ok(h.state.postedMessages.some(x => x.type === 'STREAM_TRACKING'));
  h.state.generating = true;
  h.documentListeners.get('click')({ target: h.stopButton });
  void result.body.getReader().cancel('user clicked Stop');
  h.mutate();
  assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false, 'remaining Stop control must not re-arm');
  h.state.hidden = true;
  h.state.generating = false;
  controller.close();
  await new Promise(resolve => setImmediate(resolve));
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
});

test('stopping another conversation does not cancel the original response', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.streamEvent('STREAM_TRACKING');
  h.location.pathname = '/c/other-chat';
  h.location.href = 'https://chatgpt.com/c/other-chat';
  h.documentListeners.get('click')({ target: h.stopButton });
  h.streamEvent('STREAM_DONE');
  h.flushTimers();
  assert.equal(h.state.sends.length, 1);
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

test('a delete dialog submit button does not arm a response cycle', () => {
  const h = buildHarness();
  const button = {
    textContent: 'Delete',
    disabled: false,
    getAttribute() { return null; },
    closest(selector) { return selector.includes('button[type="submit"]') ? this : null; },
  };
  h.documentListeners.get('click')({ target: button });
  assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false);
});

test('submitting a delete form does not arm a response cycle', () => {
  const h = buildHarness();
  const button = { disabled: false, getAttribute: () => null };
  h.documentListeners.get('submit')({ target: {
    querySelector: (selector) => selector.includes('button[type="submit"]') ? button : null,
  } });
  assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false);
});

test('an assistant container appearing at response start is not completion', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.state.hidden = true;
  h.state.assistantContainers = 1;
  h.mutate();
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
});

test('DOM changes cannot finish a response whose network stream is still running', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.streamEvent('STREAM_TRACKING');
  h.state.hidden = true;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
  h.streamEvent('STREAM_DONE');
  h.flushTimers();
  assert.equal(h.state.sends.length, 1);
});

test('a cancelled stream clears its cycle without alerting', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.streamEvent('STREAM_TRACKING');
  h.state.hidden = true;
  h.streamEvent('STREAM_CANCELLED');
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
  assert.equal(h.attributes.has('data-ai-chat-notifier-cycle'), false);
});

test('a visible chat stays quiet when ChatGPT moves it into a project route', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.streamEvent('STREAM_TRACKING');
  h.location.pathname = '/g/project-id/c/source-chat';
  h.location.href = 'https://chatgpt.com/g/project-id/c/source-chat';
  h.state.completionMarkers = 1;
  h.streamEvent('STREAM_DONE');
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
});

test('stream completion waits for the source chat to stop generating', () => {
  const h = buildHarness();
  h.documentListeners.get('click')({ target: h.sendButton });
  h.streamEvent('STREAM_TRACKING');
  h.state.hidden = true;
  h.state.generating = true;
  h.streamEvent('STREAM_DONE');
  h.flushTimers();
  assert.equal(h.state.sends.length, 0);
  h.state.generating = false;
  h.state.completionMarkers = 1;
  h.mutate();
  h.flushTimers();
  assert.equal(h.state.sends.length, 1);
});
