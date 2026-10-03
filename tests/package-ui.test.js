'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.name, 'AI Chat Notifications');
assert.equal(manifest.version, '1.3.3');
assert.equal(manifest.description, 'Get notified when ChatGPT, Claude, or Gemini finishes responding.');
assert.ok(manifest.permissions.includes('notifications'));
assert.ok(manifest.permissions.includes('storage'));
assert.ok(manifest.permissions.includes('scripting'));
assert.equal(manifest.options_ui.page, 'welcome.html');
assert.equal(manifest.options_ui.open_in_tab, true);

const matches = manifest.content_scripts.flatMap((entry) => entry.matches || []);
const overlayEntry = manifest.content_scripts.find((entry) => (entry.js || []).includes('overlay.js'));
assert.ok(overlayEntry, 'overlay content script is missing');
assert.ok(overlayEntry.matches.includes('http://*/*'));
assert.ok(overlayEntry.matches.includes('https://*/*'));

for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com']) {
  assert.ok(matches.some((pattern) => pattern.includes(host)), `missing ${host}`);
  assert.ok((manifest.host_permissions || []).some((pattern) => pattern.includes(host)), `missing host permission for ${host}`);
}
for (const host of ['grok.com', 'kimi.com', 'meta.ai']) {
  assert.ok(!matches.some((pattern) => pattern.includes(host)), `unexpected ${host}`);
}
const detectorEntry = manifest.content_scripts.find((entry) => (entry.js || []).includes('providers.js'));
assert.ok(detectorEntry, 'AI response detector content script is missing');
console.log('PASS manifest exposes v1.3.3 provider detection plus in-page overlays');

const welcome = fs.readFileSync('welcome.html', 'utf8');
for (const mode of ['auto', 'browser', 'system']) {
  assert.match(welcome, new RegExp(`value=["']${mode}["']`));
}
for (const provider of ['ChatGPT', 'Claude', 'Gemini']) {
  assert.match(welcome, new RegExp(provider));
}
assert.match(welcome, /id=["']test-notification["']/);
assert.match(welcome, /src=["']background-core\.js["']/);
assert.match(welcome, /src=["']welcome\.js["']/);
console.log('PASS welcome page offers notification modes and current providers');

const overlay = fs.readFileSync('overlay.js', 'utf8');
assert.match(overlay, /SHOW_INLINE_TOAST/);
assert.match(overlay, /attachShadow/);
assert.match(overlay, /OPEN_CHAT/);
assert.doesNotMatch(overlay, /document\.body\.innerHTML\s*=/);
console.log('PASS browser notifications render as isolated in-page overlays');
