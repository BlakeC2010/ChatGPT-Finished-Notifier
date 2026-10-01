'use strict';

const core = globalThis.ChatGPTNotifierBackgroundCore;
const params = new URLSearchParams(location.search);
const tabId = core.parseTargetTabId(params.get('tab'));
const toast = document.querySelector('#toast');
const openButton = document.querySelector('#open-chat');
const dismissButton = document.querySelector('#dismiss');

function openChat() {
  if (tabId === null) {
    window.close();
    return;
  }

  chrome.runtime.sendMessage({ type: 'OPEN_CHAT', tabId }, () => {
    window.close();
  });
}

if (toast) toast.addEventListener('click', openChat);
if (openButton) {
  openButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openChat();
  });
}
if (dismissButton) {
  dismissButton.addEventListener('click', (event) => {
    event.stopPropagation();
    window.close();
  });
}

setTimeout(() => window.close(), 7000);
