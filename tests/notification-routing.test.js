'use strict';

const assert = require('node:assert/strict');
const core = require('../background-core.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('defaults unknown notification modes to auto', () => {
  assert.equal(core.normalizeNotificationMode(undefined), 'auto');
  assert.equal(core.normalizeNotificationMode('weird'), 'auto');
  assert.equal(core.normalizeNotificationMode('browser'), 'browser');
  assert.equal(core.normalizeNotificationMode('system'), 'system');
});

run('auto uses browser toast while a normal Chrome window is focused', () => {
  assert.equal(core.chooseDeliveryMode('auto', true), 'browser');
});

run('auto uses system notification while Chrome is not focused', () => {
  assert.equal(core.chooseDeliveryMode('auto', false), 'system');
});

run('explicit modes override Chrome focus', () => {
  assert.equal(core.chooseDeliveryMode('browser', false), 'browser');
  assert.equal(core.chooseDeliveryMode('system', true), 'system');
});

run('toast is positioned inside the upper-right of its anchor window', () => {
  assert.deepEqual(
    core.computeToastBounds({ left: 100, top: 50, width: 1200, height: 800 }, 400, 150, 18),
    { left: 882, top: 68, width: 400, height: 150 },
  );
});

run('toast positioning tolerates missing window dimensions', () => {
  assert.deepEqual(
    core.computeToastBounds({}, 400, 150, 18),
    { width: 400, height: 150 },
  );
});

run('target tab ids are parsed defensively', () => {
  assert.equal(core.parseTargetTabId('42'), 42);
  assert.equal(core.parseTargetTabId('-1'), null);
  assert.equal(core.parseTargetTabId('abc'), null);
});
