#!/usr/bin/env bash
# install.sh — Install the Open URL In Browser native messaging host.
#
# Usage: ./installer/install.sh [extension-id]
#
# If extension-id is omitted, the ID baked in at build time is used.
# Run from the repo root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- Configuration ---------------------------------------------------------

BAKED_EXTENSION_ID="jmgamfcdphkcadknmiekecdpdmgcgakk"
EXTENSION_ID="${1:-$BAKED_EXTENSION_ID}"

HOST_NAME="com.open_url_in_browser"
INSTALL_DIR="/usr/local/lib/open-url-in-browser"
SCRIPT_SRC="$REPO_ROOT/native-host/open_url_in_browser.py"
SCRIPT_DEST="$INSTALL_DIR/open_url_in_browser.py"
MANIFEST_NAME="${HOST_NAME}.json"

# Chromium-family NativeMessagingHosts directories (user-level, no sudo needed)
NMH_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
    "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
    "$HOME/Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts"
)

# ---- Install script --------------------------------------------------------

echo "Installing native host script to $INSTALL_DIR ..."
sudo mkdir -p "$INSTALL_DIR"
sudo cp "$SCRIPT_SRC" "$SCRIPT_DEST"
sudo chmod +x "$SCRIPT_DEST"
# Remove macOS quarantine flag that would prevent execution
sudo xattr -d com.apple.quarantine "$SCRIPT_DEST" 2>/dev/null || true
echo "  Installed: $SCRIPT_DEST"

# ---- Write host manifest ---------------------------------------------------

MANIFEST_JSON=$(cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Opens URLs in other browsers via the macOS open command",
  "path": "${SCRIPT_DEST}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF
)

echo ""
echo "Registering host manifest (extension ID: $EXTENSION_ID) ..."
REGISTERED=0

for dir in "${NMH_DIRS[@]}"; do
    if [ -d "$(dirname "$dir")" ]; then
        mkdir -p "$dir"
        echo "$MANIFEST_JSON" > "$dir/$MANIFEST_NAME"
        echo "  Registered: $dir/$MANIFEST_NAME"
        REGISTERED=$((REGISTERED + 1))
    fi
done

if [ "$REGISTERED" -eq 0 ]; then
    echo "  WARNING: No Chromium browser profile directories found."
    echo "  Open a Chromium-based browser at least once, then re-run this script."
    exit 1
fi

echo ""
echo "Done. Registered for $REGISTERED location(s)."
echo ""
echo "Next steps:"
echo "  1. Load the extension unpacked in Chrome (chrome://extensions → Load unpacked)"
echo "  2. Confirm the extension ID is: $EXTENSION_ID"
echo "  3. Open the extension options page → click 'Verify connection'"
