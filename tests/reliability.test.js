'use strict';

const assert = require('node:assert/strict');
const contentCore = require('../content-core.js');
const backgroundCore = require('../background-core.js');

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

(async () => {
  await run('completion delivery retries a missing acknowledgement and stops on success', async () => {
    let attempts = 0;
    const result = await contentCore.deliverCompletionWithRetry({
      completionId: 'abc',
      maxAttempts: 4,
      retryDelayMs: 0,
      ackTimeoutMs: 5,
      wait: () => Promise.resolve(),
      send: () => {
        attempts += 1;
        return Promise.resolve(attempts === 2 ? { ok: true } : undefined);
      },
    });

    assert.equal(result, true);
    assert.equal(attempts, 2);
  });

  await run('notification id retains the source tab id', async () => {
    const id = backgroundCore.makeNotificationId(42, 'completion-1');
    assert.deepEqual(backgroundCore.parseNotificationId(id), { tabId: 42 });
  });
})();
