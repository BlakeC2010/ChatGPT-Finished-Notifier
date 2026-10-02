'use strict';

const assert = require('node:assert/strict');
const core = require('../content-core.js');

function makeManualTimers() {
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimer(fn) {
      const id = nextId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimer(id) {
      tasks.delete(id);
    },
    flushAll() {
      const pending = [...tasks.entries()];
      tasks.clear();
      for (const [, fn] of pending) fn();
    },
    get size() {
      return tasks.size;
    },
  };
}

function makeTrackerState() {
  return {
    generating: false,
    completionMarkers: 0,
    away: true,
    completions: 0,
  };
}

function makeTracker(state, timers) {
  return new core.ResponseCycleTracker({
    stabilizeMs: 1,
    setTimer: (fn) => timers.setTimer(fn),
    clearTimer: (id) => timers.clearTimer(id),
    readGenerating: () => state.generating,
    readCompletionMarkerCount: () => state.completionMarkers,
    readAway: () => state.away,
    onComplete: () => { state.completions += 1; },
  });
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('recognizes aria-label Stop as an active stop control', () => {
  assert.equal(core.isStopControlDescriptor({ ariaLabel: 'Stop' }), true);
});

run('ignores controls that remain in the DOM but are visually hidden', () => {
  const hiddenByLayout = {
    hidden: false,
    getAttribute() { return null; },
    getClientRects() { return []; },
  };
  assert.equal(core.isElementVisible(hiddenByLayout), false);

  const hiddenByStyle = {
    hidden: false,
    getAttribute() { return null; },
    getClientRects() { return [{}]; },
  };
  assert.equal(core.isElementVisible(hiddenByStyle, () => ({ display: 'none', visibility: 'visible' })), false);

  const visible = {
    hidden: false,
    getAttribute() { return null; },
    getClientRects() { return [{}]; },
  };
  assert.equal(core.isElementVisible(visible, () => ({ display: 'block', visibility: 'visible' })), true);
});

run('fast response completes from a new completion marker even if generating was never observed', () => {
  const state = makeTrackerState();
  const timers = makeManualTimers();
  const tracker = makeTracker(state, timers);

  assert.equal(tracker.arm(), true);
  state.completionMarkers = 1;
  tracker.observe();
  assert.equal(timers.size, 1);
  timers.flushAll();

  assert.equal(state.completions, 1);
});

run('normal response completes after generation is observed and then stops', () => {
  const state = makeTrackerState();
  const timers = makeManualTimers();
  const tracker = makeTracker(state, timers);

  tracker.arm();
  state.generating = true;
  tracker.observe();
  state.generating = false;
  tracker.observe();
  timers.flushAll();

  assert.equal(state.completions, 1);
});

run('does not complete unless a submission cycle was armed', () => {
  const state = makeTrackerState();
  const timers = makeManualTimers();
  const tracker = makeTracker(state, timers);

  state.completionMarkers = 1;
  tracker.observe();
  timers.flushAll();

  assert.equal(state.completions, 0);
});

run('does not notify if user returned before completion', () => {
  const state = makeTrackerState();
  const timers = makeManualTimers();
  const tracker = makeTracker(state, timers);

  tracker.arm();
  state.generating = true;
  tracker.observe();
  state.generating = false;
  state.away = false;
  tracker.observe();
  timers.flushAll();

  assert.equal(state.completions, 0);
});

run('arming twice during the same submission does not reset the completion baseline', () => {
  const state = makeTrackerState();
  const timers = makeManualTimers();
  const tracker = makeTracker(state, timers);

  assert.equal(tracker.arm(), true);
  state.completionMarkers = 1;
  assert.equal(tracker.arm(), false);
  tracker.observe();
  timers.flushAll();

  assert.equal(state.completions, 1);
});
