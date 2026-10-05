'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.name, 'AI Chat Notifications');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.description, 'Get notified when ChatGPT, Claude, or Gemini finishes responding.');
assert.ok(manifest.permissions.includes('notifications'));
assert.ok(manifest.permissions.includes('storage'));
assert.ok(manifest.permissions.includes('scripting'));
assert.equal(manifest.options_ui.page, 'welcome.html');
assert.equal(manifest.options_ui.open_in_tab, true);
assert.equal(manifest.action.default_popup, 'popup.html');

const matches = manifest.content_scripts.flatMap((entry) => entry.matches || []);
const overlayEntry = manifest.content_scripts.find((entry) => (entry.js || []).includes('overlay.js'));
assert.equal(overlayEntry, undefined, 'overlay should be injected on demand, not into every page at startup');
assert.ok((manifest.host_permissions || []).includes('http://*/*'));
assert.ok((manifest.host_permissions || []).includes('https://*/*'));

for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com']) {
  assert.ok(matches.some((pattern) => pattern.includes(host)), `missing ${host}`);
}
for (const host of ['grok.com', 'kimi.com', 'meta.ai']) {
  assert.ok(!matches.some((pattern) => pattern.includes(host)), `unexpected ${host}`);
}
const streamEntry = manifest.content_scripts.find((entry) => (entry.js || []).includes('stream-bridge.js'));
assert.ok(streamEntry, 'page-world stream bridge is missing');
assert.equal(streamEntry.world, 'MAIN');
assert.equal(streamEntry.run_at, 'document_start');

const detectorEntry = manifest.content_scripts.find((entry) => (entry.js || []).includes('providers.js'));
assert.ok(detectorEntry, 'AI response detector content script is missing');
console.log('PASS manifest exposes v' + manifest.version + ' detection, stream tracking, popup settings, and on-demand overlays');

const welcome = fs.readFileSync('welcome.html', 'utf8');
for (const mode of ['auto', 'browser', 'system']) {
  assert.match(welcome, new RegExp(`value=["']${mode}["']`));
}
for (const provider of ['ChatGPT', 'Claude', 'Gemini']) {
  assert.match(welcome, new RegExp(provider));
}
assert.match(welcome, /id=["']test-notification["']/);
assert.match(welcome, /src=["']background-core\.js["']/);
assert.match(welcome, /src=["']overlay\.js["']/);
assert.match(welcome, /src=["']welcome\.js["']/);
assert.match(welcome, /id=["']version["']/);
console.log('PASS welcome page offers notification modes, providers, and dynamic version text');

const popup = fs.readFileSync('popup.html', 'utf8');
for (const mode of ['auto', 'browser', 'system']) {
  assert.match(popup, new RegExp(`value=["']${mode}["']`));
}
assert.match(popup, /id=["']popup-test["']/);
assert.match(popup, /id=["']open-settings["']/);
console.log('PASS toolbar popup exposes notification settings');

const overlay = fs.readFileSync('overlay.js', 'utf8');
assert.doesNotThrow(() => new Function(overlay), 'overlay.js must parse as valid JavaScript');
assert.match(overlay, /SHOW_INLINE_TOAST/);
assert.match(overlay, /attachShadow/);
assert.match(overlay, /OPEN_CHAT/);
assert.match(overlay, /chatgpt/);
assert.match(overlay, /claude/);
assert.match(overlay, /gemini/);
assert.match(overlay, /chatTitle/);
assert.match(overlay, /snippet/);
assert.doesNotMatch(overlay, /document\.body\.innerHTML\s*=/);
console.log('PASS browser notifications render as isolated in-page overlays');

const streamBridge = fs.readFileSync('stream-bridge.js', 'utf8');
assert.doesNotThrow(() => new Function(streamBridge), 'stream-bridge.js must parse as valid JavaScript');
assert.match(streamBridge, /StreamGenerate|streamgenerate/i);
assert.match(streamBridge, /completion/);
assert.match(streamBridge, /backend-api\/conversation/);
console.log('PASS stream bridge parses and includes ChatGPT Claude and Gemini response endpoints');

const popupJs = fs.readFileSync('popup.js', 'utf8');
assert.doesNotThrow(() => new Function(popupJs), 'popup.js must parse as valid JavaScript');
console.log('PASS popup script parses as valid JavaScript');
