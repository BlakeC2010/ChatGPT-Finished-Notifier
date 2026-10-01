'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(manifest.version, '1.2.0');
assert.ok(manifest.permissions.includes('notifications'));
assert.ok(manifest.permissions.includes('storage'));
assert.equal(manifest.options_ui.page, 'welcome.html');
assert.equal(manifest.options_ui.open_in_tab, true);
console.log('PASS manifest exposes storage-backed notification settings in v1.2.0');

const welcome = fs.readFileSync('welcome.html', 'utf8');
for (const mode of ['auto', 'browser', 'system']) {
  assert.match(welcome, new RegExp(`value=["']${mode}["']`));
}
assert.match(welcome, /id=["']test-notification["']/);
assert.match(welcome, /src=["']background-core\.js["']/);
assert.match(welcome, /src=["']welcome\.js["']/);
console.log('PASS welcome page offers all notification modes and a test action');

const toast = fs.readFileSync('toast.html', 'utf8');
assert.match(toast, /id=["']toast["']/);
assert.match(toast, /id=["']open-chat["']/);
assert.match(toast, /id=["']dismiss["']/);
assert.match(toast, /src=["']background-core\.js["']/);
assert.match(toast, /src=["']toast\.js["']/);
console.log('PASS browser toast page exposes open and dismiss actions');
