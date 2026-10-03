'use strict';

const core = globalThis.ChatGPTNotifierBackgroundCore;
const radios = [...document.querySelectorAll('input[name="notificationMode"]')];
const testButton = document.querySelector('#popup-test');
const settingsButton = document.querySelector('#open-settings');
const status = document.querySelector('#popup-status');
const version = document.querySelector('#popup-version');
const COOLDOWN_MS = 1400;

let locked = false;

function setStatus(text) {
  if (status) status.textContent = text;
}

function selectedMode() {
  return core.normalizeNotificationMode(radios.find((radio) => radio.checked)?.value);
}

if (version) version.textContent = 'v' + chrome.runtime.getManifest().version;

chrome.storage.sync.get({ notificationMode: 'auto' }, (settings) => {
  const mode = core.normalizeNotificationMode(settings.notificationMode);
  for (const radio of radios) radio.checked = radio.value === mode;
});

for (const radio of radios) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    chrome.storage.sync.set({ notificationMode: radio.value }, () => {
      setStatus(chrome.runtime.lastError ? 'Could not save.' : 'Saved.');
    });
  });
}

testButton?.addEventListener('click', () => {
  if (locked) return;
  locked = true;
  testButton.disabled = true;
  setStatus('Sending…');

  chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION', mode: selectedMode() }, (response) => {
    setStatus(!chrome.runtime.lastError && response?.ok ? 'Test sent.' : 'Could not show test.');
    setTimeout(() => {
      locked = false;
      testButton.disabled = false;
    }, COOLDOWN_MS);
  });
});

settingsButton?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
