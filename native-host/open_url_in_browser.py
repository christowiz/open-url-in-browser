#!/usr/bin/env python3
"""
Native Messaging host for the Open URL In Browser Chrome extension.

Protocol: 4-byte little-endian length-prefixed JSON on stdin/stdout.
Install path: /usr/local/lib/open-url-in-browser/open_url_in_browser.py

Actions
-------
ping
    → {"status": "ok", "version": "1.0.0"}

open_urls  {"bundleId": str, "urls": [str, ...]}
    → {"results": [{"url": str, "success": bool, "error": str|null}, ...]}

discover_browsers
    → {"browsers": [{"id": str, "name": str, "bundleId": str, "appPath": str}, ...]}

inspect_app  {"appPath": str}
    → {"bundleId": str, "appName": str, "nmhSubdir": str}
      nmhSubdir is the path under ~/Library/Application Support/ where
      NativeMessagingHosts/ should be registered for this browser.
"""

import json
import os
import plistlib
import struct
import subprocess
import sys

VERSION = "1.0.0"

# Strategy for opening a new window per browser family.
# chromium : open -b <id> --args --new-window <urls>
# firefox  : open -b <id> --args -new-window <urls>  (single dash, Firefox CLI)
# safari   : osascript (only reliable way to open a new Safari window with tabs)
# default  : regular open -b, no new-window flag
WINDOW_STRATEGY = {
    "com.google.Chrome":          "chromium",
    "com.google.Chrome.beta":     "chromium",
    "com.google.Chrome.canary":   "chromium",
    "com.brave.Browser":          "chromium",
    "com.microsoft.edgemac":      "chromium",
    "com.vivaldi.Vivaldi":        "chromium",
    "com.operasoftware.Opera":    "chromium",
    "net.imput.helium":           "chromium",
    "net.zen-browser.app":        "chromium",
    "org.mozilla.firefox":        "firefox",
    "com.apple.Safari":           "safari",
}

# Maps bundle ID → Application Support subdirectory that contains NativeMessagingHosts/.
# Chromium browsers don't follow a consistent naming convention, so we maintain
# an explicit mapping. Unknown bundle IDs fall back to the bundle ID itself.
NMH_SUBDIR_MAP = {
    "com.google.Chrome":          "Google/Chrome",
    "com.google.Chrome.beta":     "Google/Chrome Beta",
    "com.google.Chrome.canary":   "Google/Chrome Canary",
    "com.brave.Browser":          "BraveSoftware/Brave-Browser",
    "com.microsoft.edgemac":      "Microsoft Edge",
    "com.vivaldi.Vivaldi":        "Vivaldi",
    "com.operasoftware.Opera":    "com.operasoftware.Opera",
    "net.imput.helium":           "net.imput.helium",
    "net.zen-browser.app":        "net.zen-browser.app",
}

# Known browsers: (id, human name, bundle ID, candidate app paths)
KNOWN_BROWSERS = [
    ("safari",   "Safari",           "com.apple.Safari",
     ["/Applications/Safari.app"]),
    ("chrome",   "Google Chrome",    "com.google.Chrome",
     ["/Applications/Google Chrome.app"]),
    ("brave",    "Brave",            "com.brave.Browser",
     ["/Applications/Brave Browser.app"]),
    ("firefox",  "Firefox",          "org.mozilla.firefox",
     ["/Applications/Firefox.app"]),
    ("edge",     "Microsoft Edge",   "com.microsoft.edgemac",
     ["/Applications/Microsoft Edge.app"]),
    ("helium",   "Helium",           "net.imput.helium",
     ["/Applications/Helium.app"]),
    ("vivaldi",  "Vivaldi",          "com.vivaldi.Vivaldi",
     ["/Applications/Vivaldi.app"]),
    ("opera",    "Opera",            "com.operasoftware.Opera",
     ["/Applications/Opera.app"]),
    ("zen",      "Zen Browser",      "net.zen-browser.app",
     ["/Applications/Zen Browser.app"]),
    ("canary",   "Chrome Canary",    "com.google.Chrome.canary",
     ["/Applications/Google Chrome Canary.app"]),
]


# ---------------------------------------------------------------------------
# Native Messaging framing
# ---------------------------------------------------------------------------

def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) < 4:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    return json.loads(data.decode("utf-8"))


def write_message(obj):
    data = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def handle_ping():
    return {"status": "ok", "version": VERSION}


def handle_open_urls(msg):
    bundle_id = msg.get("bundleId", "")
    urls = msg.get("urls", [])
    new_window = msg.get("newWindow", False)

    if not bundle_id:
        return {"results": [{"url": u, "success": False, "error": "missing bundleId"} for u in urls]}

    if new_window:
        return open_in_new_window(bundle_id, urls)

    # Attempt batch open first — one process for all URLs.
    try:
        result = subprocess.run(
            ["/usr/bin/open", "-b", bundle_id] + urls,
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0:
            return {"results": [{"url": u, "success": True, "error": None} for u in urls]}
    except Exception:
        pass  # fall through to per-URL

    # Per-URL fallback — gives granular success/failure.
    results = []
    for url in urls:
        try:
            r = subprocess.run(
                ["/usr/bin/open", "-b", bundle_id, url],
                capture_output=True,
                timeout=10,
            )
            if r.returncode == 0:
                results.append({"url": url, "success": True, "error": None})
            else:
                err = r.stderr.decode("utf-8", errors="replace").strip()
                results.append({"url": url, "success": False, "error": err or "non-zero exit"})
        except subprocess.TimeoutExpired:
            results.append({"url": url, "success": False, "error": "timeout"})
        except Exception as e:
            results.append({"url": url, "success": False, "error": str(e)})

    return {"results": results}


def open_in_new_window(bundle_id, urls):
    strategy = WINDOW_STRATEGY.get(bundle_id, "default")

    if strategy == "safari":
        return open_safari_new_window(urls)

    if strategy == "firefox":
        return open_firefox_new_window(bundle_id, urls)

    if strategy == "chromium":
        return open_chromium_new_window(bundle_id, urls)

    # No known new-window flag — fall back to regular open.
    cmd = ["/usr/bin/open", "-b", bundle_id] + urls
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=15)
        if result.returncode == 0:
            return {"results": [{"url": u, "success": True, "error": None} for u in urls]}
        err = result.stderr.decode("utf-8", errors="replace").strip()
        return {"results": [{"url": u, "success": False, "error": err or "non-zero exit"} for u in urls]}
    except Exception as e:
        return {"results": [{"url": u, "success": False, "error": str(e)} for u in urls]}


def open_firefox_new_window(bundle_id, urls):
    # Firefox requires calling its binary directly — `open --args` doesn't
    # reliably forward CLI flags like -new-window.
    binary = find_app_binary(bundle_id, "firefox")
    if not binary:
        return {"results": [{"url": u, "success": False, "error": "Firefox binary not found"} for u in urls]}

    # -new-window <url> opens the first URL in a new window.
    # Additional URLs use -new-tab so they land in the same new window.
    cmd = [binary, "-new-window", urls[0]]
    for u in urls[1:]:
        cmd += ["-new-tab", u]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=15)
        if result.returncode == 0:
            return {"results": [{"url": u, "success": True, "error": None} for u in urls]}
        err = result.stderr.decode("utf-8", errors="replace").strip()
        return {"results": [{"url": u, "success": False, "error": err or "non-zero exit"} for u in urls]}
    except Exception as e:
        return {"results": [{"url": u, "success": False, "error": str(e)} for u in urls]}


def open_chromium_new_window(bundle_id, urls):
    app_name = get_app_display_name(bundle_id)
    if app_name:
        cmd = ["/usr/bin/open", "--new", "-a", app_name, "--args", "--new-window"] + urls
    else:
        cmd = ["/usr/bin/open", "--new", "-b", bundle_id, "--args", "--new-window"] + urls
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=15)
        if result.returncode == 0:
            return {"results": [{"url": u, "success": True, "error": None} for u in urls]}
        err = result.stderr.decode("utf-8", errors="replace").strip()
        return {"results": [{"url": u, "success": False, "error": err or "non-zero exit"} for u in urls]}
    except Exception as e:
        return {"results": [{"url": u, "success": False, "error": str(e)} for u in urls]}


def get_app_display_name(bundle_id):
    """Return the .app display name (filename without .app) for a bundle ID."""
    try:
        result = subprocess.run(
            ["/usr/bin/mdfind", f'kMDItemCFBundleIdentifier == "{bundle_id}"'],
            capture_output=True, text=True, timeout=5,
        )
        for path in result.stdout.strip().splitlines():
            path = path.strip()
            if path.endswith(".app") and os.path.isdir(path):
                return os.path.basename(path)[:-4]  # strip .app
    except Exception:
        pass
    return None


def find_app_binary(bundle_id, binary_name):
    """Locate an app's binary using Spotlight, given its bundle ID."""
    try:
        result = subprocess.run(
            ["/usr/bin/mdfind", f'kMDItemCFBundleIdentifier == "{bundle_id}"'],
            capture_output=True, text=True, timeout=5,
        )
        for path in result.stdout.strip().splitlines():
            path = path.strip()
            if path.endswith(".app") and os.path.isdir(path):
                binary = os.path.join(path, "Contents", "MacOS", binary_name)
                if os.path.isfile(binary):
                    return binary
    except Exception:
        pass
    return None


def open_safari_new_window(urls):
    if not urls:
        return {"results": []}

    def esc(u):
        return u.replace("\\", "\\\\").replace('"', '\\"')

    # Open first URL in a new document, then add remaining URLs as tabs.
    # Script is piped via stdin — more reliable than -e for multi-line scripts.
    lines = [
        'tell application "Safari"',
        "    activate",
        "    make new document",
        f'    set URL of current tab of front window to "{esc(urls[0])}"',
        "    tell front window",
    ]
    for u in urls[1:]:
        lines += [
            f'        set newTab to make new tab with properties {{URL:"{esc(u)}"}}',
            "        set current tab to newTab",
        ]
    lines += [
        "    end tell",
        "end tell",
    ]

    script = "\n".join(lines)
    try:
        result = subprocess.run(
            ["/usr/bin/osascript"],
            input=script.encode("utf-8"),
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0:
            return {"results": [{"url": u, "success": True, "error": None} for u in urls]}
        err = result.stderr.decode("utf-8", errors="replace").strip()
        return {"results": [{"url": u, "success": False, "error": err or "osascript failed"} for u in urls]}
    except Exception as e:
        return {"results": [{"url": u, "success": False, "error": str(e)} for u in urls]}


def handle_discover_browsers():
    found = []
    for browser_id, name, bundle_id, paths in KNOWN_BROWSERS:
        for path in paths:
            if os.path.isdir(path):
                found.append({
                    "id": browser_id,
                    "name": name,
                    "bundleId": bundle_id,
                    "appPath": path,
                    "nmhSubdir": nmh_subdir_for(bundle_id),
                })
                break
    return {"browsers": found}


def handle_inspect_app(msg):
    app_path = msg.get("appPath", "").strip()

    if not app_path or not os.path.isdir(app_path):
        return {"error": f"Path not found: {app_path}"}

    plist_path = os.path.join(app_path, "Contents", "Info.plist")
    if not os.path.exists(plist_path):
        return {"error": "No Info.plist found — is this a valid .app bundle?"}

    try:
        with open(plist_path, "rb") as f:
            plist = plistlib.load(f)
    except Exception as e:
        return {"error": f"Could not parse Info.plist: {e}"}

    bundle_id = plist.get("CFBundleIdentifier", "")
    app_name = plist.get("CFBundleName") or plist.get("CFBundleDisplayName") or ""

    if not bundle_id:
        return {"error": "CFBundleIdentifier not found in Info.plist"}

    return {
        "bundleId": bundle_id,
        "appName": app_name,
        "nmhSubdir": nmh_subdir_for(bundle_id),
    }


def nmh_subdir_for(bundle_id):
    """Return the Application Support subdirectory for a browser's NMH folder."""
    return NMH_SUBDIR_MAP.get(bundle_id, bundle_id)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    while True:
        msg = read_message()
        if msg is None:
            break

        action = msg.get("action", "")

        if action == "ping":
            write_message(handle_ping())
        elif action == "open_urls":
            write_message(handle_open_urls(msg))
        elif action == "discover_browsers":
            write_message(handle_discover_browsers())
        elif action == "inspect_app":
            write_message(handle_inspect_app(msg))
        else:
            write_message({"error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
