'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.name, 'AI Chat Notifications');
assert.equal(manifest.version, '1.3.0');
assert.equal(manifest.description, 'Get notified when supported AI chats finish responding.');
assert.ok(manifest.permissions.includes('notifications'));
assert.ok(manifest.permissions.includes('storage'));
assert.equal(manifest.options_ui.page, 'welcome.html');
assert.equal(manifest.options_ui.open_in_tab, true);

const matches = manifest.content_scripts.flatMap((entry) => entry.matches || []);
for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'grok.com', 'kimi.com', 'meta.ai']) {
  assert.ok(matches.some((pattern) => pattern.includes(host)), `missing ${host}`);
}
assert.ok(manifest.content_scripts[0].js.includes('providers.js'));
console.log('PASS manifest exposes v1.3.0 multi-provider access and settings');

const welcome = fs.readFileSync('welcome.html', 'utf8');
for (const mode of ['auto', 'browser', 'system']) {
  assert.match(welcome, new RegExp(`value=["']${mode}["']`));
}
for (const provider of ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'Kimi', 'Meta AI']) {
  assert.match(welcome, new RegExp(provider));
}
assert.match(welcome, /id=["']test-notification["']/);
assert.match(welcome, /src=["']background-core\.js["']/);
assert.match(welcome, /src=["']welcome\.js["']/);
console.log('PASS welcome page offers all notification modes and supported providers');

const toast = fs.readFileSync('toast.html', 'utf8');
assert.match(toast, /AI Chat Notifications/);
assert.match(toast, /id=["']toast["']/);
assert.match(toast, /id=["']open-chat["']/);
assert.match(toast, /id=["']dismiss["']/);
assert.match(toast, /src=["']background-core\.js["']/);
assert.match(toast, /src=["']toast\.js["']/);
console.log('PASS browser toast uses AI Chat Notifications branding');
