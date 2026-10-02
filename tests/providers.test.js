'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { globalThis: null, self: null };
context.globalThis = context;
context.self = context;
vm.runInNewContext(fs.readFileSync('providers.js', 'utf8'), context, { filename: 'providers.js' });

const providers = context.AIChatProviderProfiles;
assert.ok(providers);

const expected = new Map([
  ['chatgpt.com', 'ChatGPT'],
  ['claude.ai', 'Claude'],
  ['gemini.google.com', 'Gemini'],
  ['grok.com', 'Grok'],
  ['www.kimi.com', 'Kimi'],
  ['meta.ai', 'Meta AI'],
]);

for (const [host, provider] of expected) {
  assert.equal(providers.getProfile(host)?.provider, provider);
}
assert.equal(providers.getProfile('example.com'), null);
assert.equal(providers.isSendControlDescriptor({ ariaLabel: 'Send message' }), true);
assert.equal(providers.isCompletionMarkerDescriptor({ ariaLabel: 'Copy response' }), true);
assert.equal(providers.isCompletionMarkerDescriptor({ ariaLabel: 'Copy link' }), false);

console.log('PASS provider profiles map supported AI chat sites and generic controls');
