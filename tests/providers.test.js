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

const chatgpt = providers.getProfile('chatgpt.com');
const claude = providers.getProfile('claude.ai');
const gemini = providers.getProfile('gemini.google.com');

assert.equal(chatgpt?.provider, 'ChatGPT');
assert.equal(claude?.provider, 'Claude');
assert.equal(gemini?.provider, 'Gemini');
assert.equal(providers.getProfile('grok.com'), null);
assert.equal(providers.getProfile('example.com'), null);

assert.ok(claude.prompt.some((selector) => selector.includes('ProseMirror')));
assert.ok(claude.send.some((selector) => selector.includes('send-button')));
assert.ok(claude.generating.some((selector) => selector.includes('stop-button')));
assert.ok(claude.completion.some((selector) => selector.includes('action-bar-copy')));

assert.ok(gemini.prompt.some((selector) => selector.includes('ql-editor')));
assert.ok(gemini.prompt.some((selector) => selector.includes('Enter a prompt here')));
assert.ok(gemini.send.some((selector) => selector.includes('Send message')));
assert.ok(gemini.generating.some((selector) => selector.includes('aria-busy')));
assert.ok(gemini.completion.some((selector) => selector.includes('Copy')));

assert.equal(providers.isSendControlDescriptor({ ariaLabel: 'Send message' }), true);
assert.equal(providers.isCompletionMarkerDescriptor({ ariaLabel: 'Copy response' }), true);
assert.equal(providers.isCompletionMarkerDescriptor({ ariaLabel: 'Copy link' }), false);

console.log('PASS Claude and Gemini provider profiles include current fallback selectors');
