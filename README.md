# AI Chat Notifications

A lightweight Chrome extension that notifies you when a supported AI chat finishes responding while that tab is hidden.

## Supported AI chats

- ChatGPT
- Claude
- Gemini

## What it does

- Detects when a supported AI response finishes without reading your prompt or response text.
- Stays quiet while the AI chat tab is still visible, including on another monitor.
- Returns you to the exact tab when you click a notification.
- Lets you choose between Auto, Browser toast, and System notification modes.

## Install locally

1. Extract the extension ZIP to a folder.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted extension folder.
6. Refresh any supported AI chat tabs that were already open.

## Privacy

The extension runs locally. It does not save or transmit prompts or responses, use analytics, call an external server, or require API keys. It only watches interface state on supported AI chat sites and stores your notification-mode preference in Chrome Sync.

## Reliability

Version 1.3.3 shows browser alerts inside the currently active webpage instead of opening a separate popup window. It keeps the v1.3.2 detector reinjection and completion reliability fixes. Claude and Gemini use provider-specific prompt, send, stop/streaming, and completion selectors with generic fallbacks. The hidden-tab behavior, delivery retries, notification modes, and exact-tab return behavior are preserved.
