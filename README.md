# ChatGPT Finished Notifier

A lightweight Chrome extension that notifies you when ChatGPT finishes a response while that chat is hidden.

## What it does

- Detects when a ChatGPT response finishes without reading your prompt or response text.
- Stays quiet while the ChatGPT tab is still visible, including on another monitor.
- Returns you to the exact ChatGPT tab when you click a notification.
- Opens a welcome/settings page after first install.
- Lets you choose between three notification modes:
  - **Auto (recommended):** custom Chrome toast while Chrome is active; system notification when Chrome is not active.
  - **Browser toast:** always use the custom Chrome notification window.
  - **System notification:** always use the normal Windows/macOS notification center.

## Install locally

1. Extract the extension ZIP to a folder.
2. Open `chrome://extensions` in Google Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted extension folder.
6. Refresh any ChatGPT tabs that were already open.

The welcome page opens automatically on a fresh install. You can reopen it later from the extension's **Options** page.

## Notification behavior

When a response finishes and the ChatGPT tab is hidden:

- **Auto** uses the custom browser toast if a normal Chrome window currently has focus. If Chrome is not focused, it uses a system notification.
- **Browser toast** opens a small extension-owned Chrome popup with **Open chat** and dismiss controls. It closes automatically after seven seconds.
- **System notification** uses Chrome's native notifications API with an **Open chat** action.

Windows Do Not Disturb can suppress system notifications. It does not suppress the custom browser toast.

## Privacy

The extension runs locally. It does not save or transmit prompts or responses, use analytics, call an external server, or require an OpenAI API key. It only watches ChatGPT's response-generation controls and stores your notification-mode preference in Chrome Sync.

## Files

- `manifest.json` — Manifest V3 configuration and permissions.
- `content-core.js` — prompt-to-completion state machine and reliable delivery helper.
- `content.js` — ChatGPT page observer.
- `background-core.js` — notification routing and validation helpers.
- `background.js` — notification delivery, install onboarding, and tab-focus handling.
- `welcome.html`, `welcome.css`, `welcome.js` — onboarding and notification preferences.
- `toast.html`, `toast.css`, `toast.js` — custom in-Chrome notification UI.
- `tests/` — state-machine, routing, UI, integration, and reliability checks.

## Reliability

Version 1.1.0 began arming the response cycle at prompt submission so very fast responses are not missed. Version 1.1.1 switched the "away" check to page visibility, allowing a ChatGPT tab visible on another monitor to stay quiet even when another window has focus. Version 1.2.0 adds persisted notification preferences, install onboarding, a custom browser toast, and automatic browser-versus-system routing while keeping the existing completion detection and delivery retry behavior.
