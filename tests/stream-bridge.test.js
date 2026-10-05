'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function buildBridgeHarness({
  provider = 'ChatGPT',
  requestUrl = 'https://chatgpt.com/backend-api/conversation',
  contentType = 'text/event-stream; charset=utf-8',
  status = 200,
  bodyFails = false,
} = {}) {
  const posted = [];
  let cycle = JSON.stringify({ cycleId: 'cycle-1', provider, armedAt: Date.now() });
  const response = {
    ok: status >= 200 && status < 300,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    clone() {
      return { text: () => bodyFails ? Promise.reject(new Error('aborted')) : Promise.resolve('data: [DONE]\n\n') };
    },
  };
  const context = {
    URL, Request, Date, Promise, console,
    location: { href: 'https://' + (provider === 'ChatGPT' ? 'chatgpt.com' : provider === 'Claude' ? 'claude.ai' : 'gemini.google.com') + '/' },
    document: { documentElement: { getAttribute: () => cycle } },
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  context.postMessage = (message) => posted.push(message);
  context.fetch = async () => response;
  vm.runInNewContext(fs.readFileSync('stream-bridge.js', 'utf8'), context, { filename: 'stream-bridge.js' });
  return {
    posted,
    clearCycle() { cycle = null; },
    async run() {
      await context.fetch(requestUrl, { method: 'POST' });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

for (const [provider, requestUrl] of [
  ['ChatGPT', 'https://chatgpt.com/backend-api/conversation'],
  ['ChatGPT', 'https://chatgpt.com/backend-api/f/conversation'],
  ['Claude', 'https://claude.ai/api/organizations/a/chat_conversations/b/completion'],
  ['Gemini', 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'],
  ['Gemini', 'https://gemini.google.com/_/BardChatUi/data/batchexecute'],
]) {
  test(provider + ' tracks its response stream to completion: ' + requestUrl, async () => {
    const h = buildBridgeHarness({ provider, requestUrl });
    await h.run();
    assert.deepEqual(h.posted.map(x => x.type), ['STREAM_TRACKING', 'STREAM_DONE']);
    assert.ok(h.posted.every(x => x.cycleId === 'cycle-1'));
  });
}

for (const path of [
  '/backend-api/conversation/init',
  '/backend-api/conversation/prepare',
  '/backend-api/f/conversation/prepare',
  '/backend-api/conversation/source-chat/delete',
  '/backend-api/conversation/source-chat/gen_title',
]) {
  test('ChatGPT management request is not a completed answer: ' + path, async () => {
    const h = buildBridgeHarness({ requestUrl: 'https://chatgpt.com' + path });
    await h.run();
    assert.equal(h.posted.length, 0);
  });
}

test('a JSON acknowledgement at the conversation endpoint is not a response stream', async () => {
  const h = buildBridgeHarness({ contentType: 'application/json' });
  await h.run();
  assert.equal(h.posted.length, 0);
});

test('a failed conversation request is not a completed answer', async () => {
  const h = buildBridgeHarness({ status: 500 });
  await h.run();
  assert.deepEqual(h.posted.map(x => x.type), ['STREAM_CANCELLED']);
});

test('a cancelled stream is not reported as a successfully finished answer', async () => {
  const h = buildBridgeHarness({ bodyFails: true });
  await h.run();
  assert.deepEqual(h.posted.map(x => x.type), ['STREAM_TRACKING', 'STREAM_CANCELLED']);
});

test('an unrelated host with a conversation-looking URL is ignored', async () => {
  const h = buildBridgeHarness({ requestUrl: 'https://example.test/backend-api/conversation' });
  await h.run();
  assert.equal(h.posted.length, 0);
});

test('a cleared response cycle cannot claim a later response request', async () => {
  const h = buildBridgeHarness();
  h.clearCycle();
  await h.run();
  assert.equal(h.posted.length, 0);
});
