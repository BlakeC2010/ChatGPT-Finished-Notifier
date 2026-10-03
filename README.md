# AI Chat Notifications

A lightweight Chrome extension that notifies you when a supported AI chat finishes responding while that tab is hidden.

## Supported AI chats

- ChatGPT
- Claude
- Gemini

## What it does

- Detects when a supported AI response finishes and uses the chat title plus a short excerpt of the latest AI response in the notification.
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

The extension runs locally. It does not send prompts or responses to an external server, use analytics, or require API keys. To build a useful notification, it locally checks whether the prompt box is non-empty and reads the current chat title plus a short excerpt of the latest AI response. That preview is not saved; only your notification-mode preference is stored in Chrome Sync.

## Reliability

Version 1.3.4 injects browser alerts on demand into the currently active webpage, preventing stale tabs from falling back to system notifications. It also deduplicates test notifications, shows the chat title plus a short response preview, and themes in-page alerts for ChatGPT, Claude, and Gemini. It keeps the v1.3.2 detector reinjection and completion reliability fixes. Claude and Gemini use provider-specific prompt, send, stop/streaming, and completion selectors with generic fallbacks. The hidden-tab behavior, delivery retries, notification modes, and exact-tab return behavior are preserved.
