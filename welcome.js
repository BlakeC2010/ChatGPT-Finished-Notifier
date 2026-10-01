'use strict';

const core = globalThis.ChatGPTNotifierBackgroundCore;
const modeInputs = [...document.querySelectorAll('input[name="notificationMode"]')];
const testButton = document.querySelector('#test-notification');
const status = document.querySelector('#status');

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
    const mode = selectedMode();
    testButton.disabled = true;
    setStatus('Sending test notification…');

    saveMode(mode, (saved) => {
      if (!saved) {
        testButton.disabled = false;
        return;
      }

      chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION', mode }, (response) => {
        testButton.disabled = false;
        if (chrome.runtime.lastError || !response || response.ok !== true) {
          setStatus('Test notification could not be shown.', 'error');
          return;
        }
        setStatus('Test notification sent.', 'success');
      });
    });
  });
}
