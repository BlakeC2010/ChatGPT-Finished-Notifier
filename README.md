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

Version 1.4.1 fixes early and unwanted ChatGPT alerts. Setup and management requests are excluded from response-stream tracking, unrelated dialog submissions do not arm the detector, stopped and cancelled responses are discarded, and delivery rechecks whether the original chat is visible immediately before display. New project and custom-GPT chats adopt their assigned conversation address. The detector waits for an owned stream to finish instead of treating an assistant container appearing as completion.

Version 1.4.0 adds toolbar popup settings, provider-branded notification icons, exact-chat return routing, stronger ChatGPT/Gemini response previews, and page-world stream tracking so Claude, Gemini, and ChatGPT can still notify after you switch to another chat while a response is generating. Claude and Gemini use provider-specific prompt, send, stop/streaming, and completion selectors with generic fallbacks. The hidden-tab behavior, delivery retries, notification modes, and exact-tab return behavior are preserved.

## Test and package

Run `node --test` for the full test suite. The reusable test and package workflows execute on the Windows Z-server runner through the existing `ChatGPT-Repo-Creator` control repository. The package job verifies the source before uploading the extension ZIP; it does not use a hosted build runner.
