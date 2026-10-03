'use strict';

const core = globalThis.ChatGPTNotifierBackgroundCore;
const modeInputs = [...document.querySelectorAll('input[name="notificationMode"]')];
const testButton = document.querySelector('#test-notification');
const status = document.querySelector('#status');
const TEST_COOLDOWN_MS = 1400;

let testInFlight = false;
let testCooldownUntil = 0;

function selectedMode() {
  return core.normalizeNotificationMode(modeInputs.find((input) => input.checked)?.value);
}

function setStatus(message, state = '') {
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function saveMode(mode, callback) {
  const normalized = core.normalizeNotificationMode(mode);
  chrome.storage.sync.set({ notificationMode: normalized }, () => {
    const error = chrome.runtime.lastError;
    if (error) {
      setStatus('Could not save that setting.', 'error');
      callback?.(false);
      return;
    }
    setStatus('Preference saved.', 'success');
    callback?.(true);
  });
}

function startCooldown() {
  testInFlight = false;
  testCooldownUntil = Date.now() + TEST_COOLDOWN_MS;
  testButton.disabled = true;

  setTimeout(() => {
    testButton.disabled = false;
  }, TEST_COOLDOWN_MS);
}

function showLocalBrowserTest() {
  const overlay = globalThis.AIChatNotificationsOverlay;
  if (!overlay || typeof overlay.showToast !== 'function') return false;

  const prefersLight = typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-color-scheme: light)').matches;

  return overlay.showToast({
    provider: 'ChatGPT',
    chatTitle: 'Example chat',
    snippet: 'This is how an in-browser response notification will look.',
    sourceTheme: prefersLight ? 'light' : 'dark',
  });
}

chrome.storage.sync.get({ notificationMode: 'auto' }, (settings) => {
  const mode = core.normalizeNotificationMode(settings.notificationMode);
  for (const input of modeInputs) input.checked = input.value === mode;
});

for (const input of modeInputs) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    saveMode(input.value);
  });
}

if (testButton) {
  testButton.addEventListener('click', () => {
    const now = Date.now();
    if (testInFlight || now < testCooldownUntil) return;

    testInFlight = true;
    testButton.disabled = true;

    const mode = selectedMode();
    setStatus('Sending test notification…');

    saveMode(mode, (saved) => {
      if (!saved) {
        testInFlight = false;
        testButton.disabled = false;
        return;
      }

      if (mode !== 'system' && showLocalBrowserTest()) {
        setStatus('Test notification shown.', 'success');
        startCooldown();
        return;
      }

      chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION', mode }, (response) => {
        if (chrome.runtime.lastError || !response || response.ok !== true) {
          testInFlight = false;
          testButton.disabled = false;
          setStatus('Test notification could not be shown.', 'error');
          return;
        }

        setStatus('Test notification sent.', 'success');
        startCooldown();
      });
    });
  });
}
