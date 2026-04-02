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
"""

import json
import os
import struct
import subprocess
import sys

VERSION = "1.0.0"

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
    ("helium",   "Helium",           "com.helium.app",
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

    if not bundle_id:
        return {"results": [{"url": u, "success": False, "error": "missing bundleId"} for u in urls]}

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
                })
                break
    return {"browsers": found}


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
        else:
            write_message({"error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
