'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function buildBridgeHarness({ provider, requestUrl }) {
  const posted = [];
  const listeners = new Map();
  const cycle = JSON.stringify({ cycleId: 'cycle-1', provider, armedAt: Date.now() });

  const response = {
    clone() {
      return {
        text() {
          return Promise.resolve('stream finished');
        },
      };
    },
  };

  const context = {
    globalThis: null,
    URL,
    Date,
    Promise,
    console,
    location: { href: 'https://example.test/' },
    document: {
      documentElement: {
        getAttribute(name) {
          return name === 'data-ai-chat-notifier-cycle' ? cycle : null;
        },
      },
    },
    window: null,
  };

  context.window = context;
  context.window.addEventListener = (type, fn) => listeners.set(type, fn);
  context.window.postMessage = (message) => posted.push(message);
  context.window.fetch = async () => response;
  context.globalThis = context;

  vm.runInNewContext(fs.readFileSync('stream-bridge.js', 'utf8'), context, { filename: 'stream-bridge.js' });

  return {
    context,
    posted,
    async run() {
      await context.window.fetch(requestUrl, { method: 'POST' });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

(async () => {
  const cases = [
    ['ChatGPT', 'https://chatgpt.com/backend-api/conversation'],
    ['Claude', 'https://claude.ai/api/organizations/a/chat_conversations/b/completion'],
    ['Gemini', 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'],
  ];

  for (const [provider, url] of cases) {
    const h = buildBridgeHarness({ provider, requestUrl: url });
    await h.run();

    assert.equal(h.posted[0].type, 'STREAM_TRACKING');
    assert.equal(h.posted[1].type, 'STREAM_DONE');
    assert.equal(h.posted[0].cycleId, 'cycle-1');
    assert.equal(h.posted[1].cycleId, 'cycle-1');
  }

  {
    const h = buildBridgeHarness({
      provider: 'Gemini',
      requestUrl: 'https://gemini.google.com/_/BardChatUi/data/batchexecute',
    });
    await h.run();
    assert.equal(h.posted[0].type, 'STREAM_TRACKING');
    assert.equal(h.posted[1].type, 'STREAM_DONE');
  }

  console.log('PASS stream bridge follows ChatGPT Claude and Gemini response requests to completion');
})();
