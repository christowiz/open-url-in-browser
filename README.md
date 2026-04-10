# Open URL In Browser

A Chrome/Chromium extension that lets you open the current tab, selected tabs, or all tabs in a different browser — Safari, Firefox, Brave, Edge, Helium, Vivaldi, Opera, Zen, or any Chromium-based browser installed on your Mac.

Built with a [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) host (a Python script) that invokes macOS's `open -b <bundleId>` to launch URLs in the target browser. Choose to open tabs in a new window or the topmost active window, with quick toggle via the Option key.

---

## Features

### Popup

- **Open current tab** in any configured browser
- **Open N selected tabs** — shown when you highlight multiple tabs with Shift/Cmd+click
- **Open all tabs** in the current window
- **Window preference** — choose to open in a new window or the topmost (active) window
- **Option key toggle** — hold Option while hovering over buttons to preview the opposite action (e.g., "Open current tab in topmost window"), and click while holding Option to use that setting
- **Close source tabs toggle** — closes the Chrome tabs after a successful open
- **Recovery banner** — if some tabs fail to open, a banner appears with a Retry button
- **Settings shortcut** — ⚙ button opens the Options page directly

### Options Page

- **Window preference** — set the default behavior (new window or topmost window)
- **Verify native host connection** — confirms the Python helper is installed and reachable
- **Copy install command** — one-click copy of the terminal command to install the native host
- **Add known browsers** — one-click addition of any of the 10 pre-listed browsers
- **Add by app path** — paste a `.app` path and the extension auto-detects the bundle ID and NMH registration directory
- **Add custom browser** — enter any name and bundle ID manually
- **Set default browser** — the default is used for the right-click context menu
- **Remove browsers** — remove any configured browser
- **Reset all settings** — clears all configured browsers and stored state

### Context Menu

Right-click any page or link and choose **"Open in \<default browser\>"** to open it in your configured default browser.

### Supported Browsers (pre-listed)

| ID | Name | Bundle ID |
|----|------|-----------|
| safari | Safari | com.apple.Safari |
| chrome | Google Chrome | com.google.Chrome |
| brave | Brave | com.brave.Browser |
| firefox | Firefox | org.mozilla.firefox |
| edge | Microsoft Edge | com.microsoft.edgemac |
| helium | Helium | net.imput.helium |
| vivaldi | Vivaldi | com.vivaldi.Vivaldi |
| opera | Opera | com.operasoftware.Opera |
| zen | Zen Browser | net.zen-browser.app |
| canary | Chrome Canary | com.google.Chrome.canary |

Any browser not in this list can be added manually via the Options page.

---

## Requirements

- macOS (uses `open -b`, `osascript`, and `mdfind`)
- Python 3 at `/usr/bin/env python3`
- A supported Chromium-based browser (Chrome, Brave, Edge, Vivaldi, etc.)

---

## Installation

### 1. Load the extension

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** and select the `extension/` folder from this repo

Note the extension ID shown on the card — you'll need it in the next step.

### 2. Install the native host

The native host is a Python script that the extension communicates with to open URLs in other browsers. It must be installed separately because Chrome's sandbox prevents extensions from launching processes directly.

Open the Options page (⚙ in the popup), then copy the install command and run it in Terminal:

```bash
bash /usr/local/lib/open-url-in-browser/install.sh <YOUR_EXTENSION_ID>
```

Or run the script from the repo before loading the extension (you can find your extension ID after loading it):

```bash
bash installer/install.sh <YOUR_EXTENSION_ID>
```

**What the installer does:**

1. Copies `open_url_in_browser.py` to `/usr/local/lib/open-url-in-browser/`
2. Copies `install.sh` itself there (so the Options page can show the absolute path)
3. Writes a Native Messaging Host manifest (`com.christowiz.open_url_in_browser.json`) into the `NativeMessagingHosts/` folder for each Chromium browser found on the system
4. The manifest registers the Python script as the handler for messages from your extension

**Registered NMH paths (if the browser is installed):**

| Browser | NMH path |
|---------|----------|
| Chrome | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |
| Chrome Beta | `~/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts/` |
| Chrome Canary | `~/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/` |
| Brave | `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/` |
| Edge | `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/` |
| Vivaldi | `~/Library/Application Support/Vivaldi/NativeMessagingHosts/` |
| Opera | `~/Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts/` |
| Helium | `~/Library/Application Support/net.imput.helium/NativeMessagingHosts/` |
| Zen | `~/Library/Application Support/net.zen-browser.app/NativeMessagingHosts/` |

After installing, click **Verify connection** in the Options page to confirm the host is reachable.

### 3. Configure browsers

Open the Options page and add the browsers you want to use:

- Click **Add** next to any browser in the "Known Browsers" list, or
- Use **Add by app path** — paste the `.app` path (e.g. `/Applications/Brave Browser.app`) and click Detect, then Confirm, or
- Use the **Add custom browser** form with a name and bundle ID

The first browser you add becomes the default (used by the context menu). You can change the default at any time.

### Uninstall

```bash
bash installer/uninstall.sh
```

This removes the NMH manifests and the `/usr/local/lib/open-url-in-browser/` directory. Remove the extension from `chrome://extensions` separately.

---

## Usage

### Opening tabs

1. Click the extension icon to open the popup
2. Choose your window preference:
   - **New window** — opens tabs in a new browser window
   - **Topmost** — opens tabs in the topmost (currently active) browser window
3. Optionally toggle **Close source tabs** — closes the Chrome tabs after opening (only on full success)
4. Click the appropriate button next to the target browser:
   - **Open current tab** — sends just the active tab
   - **Open N selected** — shown when multiple tabs are highlighted (Shift/Cmd+click tabs)
   - **Open all N tabs** — sends every tab in the window

### Using the Option key toggle

For quick one-off choices, you can hold the **Option key** while clicking to use the opposite window setting without changing your preference:

1. Hold **Option** (Alt on Windows/Linux) — buttons update to show the opposite action
2. Click while still holding Option — tabs open in the opposite window setting
3. Release Option — preference stays the same for your next action

**Example:** If "New window" is selected and you want to open in the topmost window just this once, hold Option and click. The button will show "Open current tab in topmost window".

### Recovery

If some tabs fail to open, a yellow banner appears at the top of the popup showing how many failed. Click **Retry** to try again, or **Dismiss** to clear the state.

### Context menu

Right-click any page or link and choose **"Open in \<browser\>"** to open it in your default browser. The context menu entry updates automatically when you change your default browser in Options.

### Adding an unlisted browser

Any Chromium-based browser (or Firefox variant) can be added if you know its bundle ID:

1. Open Options → **Add by app path**
2. Paste the `.app` path (e.g. `/Applications/SomeBrowser.app`)
3. Click **Detect** — the extension reads the app's `Info.plist` and fills in the bundle ID and NMH registration path
4. Optionally edit the display name, then click **Confirm**

After adding a browser that isn't in the pre-registered NMH paths, you may need to re-run `install.sh` (or manually register the host manifest in that browser's `NativeMessagingHosts/` directory).

---

## Architecture

```
Extension (MV3)                    Native Host (Python)
─────────────────────────────      ──────────────────────────────────
popup.js                           open_url_in_browser.py
  → chrome.runtime.sendMessage
      ↓
service-worker.js                  Actions:
  → chrome.runtime.sendNativeMessage  ping
      ↓  (4-byte length-prefixed JSON)  open_urls  →  open -b <bundleId> <urls>
      ↑                                              →  osascript (Safari new window)
options.js                                          →  firefox binary (Firefox new window)
  → INSPECT_APP                      discover_browsers
  → PING_NATIVE                      inspect_app  →  plistlib (reads Info.plist)
```

**Extension ID stability:** The extension uses a fixed RSA key pair (`key` field in `manifest.json`) so its ID is always `jmgamfcdphkcadknmiekecdpdmgcgakk`. The native host manifest's `allowed_origins` is hard-coded to this ID, so reinstalling or reloading the extension doesn't break the native host connection.

**Internal URLs are filtered:** `chrome://`, `chrome-extension://`, `about:`, and `data:` URLs are skipped — they cannot be opened in another browser.

**Window opening strategies:**
- **New window:** Opens tabs in a new browser window
  - Chromium browsers: `open -b <id> --args --new-window <urls>`
  - Firefox: calls the `firefox` binary directly with `-new-window <url1> -new-tab <url2> ...`
  - Safari: uses `osascript` (AppleScript) to create a new document and add tabs
  - Other browsers: falls back to regular open
- **Topmost window:** Adds tabs to the currently active browser window
  - Chromium browsers: `open -b <id> <urls>` (adds tabs to the foremost window)
  - Firefox: `firefox <url1> <url2> ...` (adds tabs to the current window)
  - Safari: uses `osascript` to add tabs to the frontmost window
  - Other browsers: falls back to regular open

**Safari note:** Opening tabs in Safari requires the **Automation** permission. macOS will prompt for this the first time `osascript` targets Safari. You can manage this in **System Settings → Privacy & Security → Automation**.

---

## Development

The extension uses no build step — plain ES modules loaded directly by the browser.

```
extension/
  manifest.json
  shared/
    constants.js    # NATIVE_HOST_NAME, MSG_TYPES, KNOWN_BROWSERS, UNSENDABLE_SCHEMES
    storage.js      # typed chrome.storage.local wrappers
  background/
    service-worker.js
  popup/
    popup.html / popup.js / popup.css
  options/
    options.html / options.js / options.css
  icons/
    icon-16.png / icon-48.png / icon-128.png

native-host/
  open_url_in_browser.py
  com.christowiz.open_url_in_browser.json   # manifest template

installer/
  install.sh
  uninstall.sh
```

To regenerate the extension ID from a new key:

```bash
openssl genrsa -out key.pem 2048
# Derive the ID: SHA256 of DER public key, first 32 bytes mapped to a–p alphabet
```

`key.pem` is gitignored. The `key` field in `manifest.json` contains the base64-encoded public key.
