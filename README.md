# ChatGPT Finished Notifier

A small Chrome extension that sends a desktop notification when ChatGPT finishes generating a response while you are looking at another tab or window.

## Install

1. Extract `ChatGPT-Finished-Notifier.zip` to a folder.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the extracted extension folder.
6. Refresh any ChatGPT tabs that were already open.

## Use

Send a message on `https://chatgpt.com/`, then switch to another tab or window. When the response finishes, Chrome will show **ChatGPT finished responding — Your response is ready.**

Click the notification to return to the exact ChatGPT tab that produced it.

The extension intentionally does not notify when you are already looking at that ChatGPT tab.

## Privacy

The extension runs locally. It does not save or transmit prompts or responses, use analytics, call an external server, or require an OpenAI API key. It checks ChatGPT's response-generation controls, not the contents of your conversation.

## If notifications do not appear

Make sure Chrome is allowed to display system notifications. On Windows 11, check **Settings > System > Notifications > Google Chrome**.

## Files

- `manifest.json` — Manifest V3 configuration.
- `content-core.js` — prompt-to-completion state machine and reliable delivery helper.
- `content.js` — ChatGPT page observer.
- `background-core.js` — notification routing helpers.
- `background.js` — Chrome notification and tab-focus handling.
- The notification icon is embedded directly in `background.js` so the extension has no binary asset dependency.

## Reliability

Chrome Manifest V3 service workers normally become inactive while idle. That is expected. Version 1.1.0 arms the response cycle at the moment you submit a prompt, then confirms completion from ChatGPT generation/completion controls. This avoids relying on catching a very short-lived generation state after the tab has already moved to the background. Acknowledged delivery with retries remains in place, so an idle Manifest V3 service worker is normal and does not need to be kept alive.
