#!/usr/bin/env bash
# uninstall.sh — Remove the Open URL In Browser native messaging host.
#
# Usage: ./installer/uninstall.sh

set -euo pipefail

HOST_NAME="com.christowiz.open_url_in_browser"
INSTALL_DIR="/usr/local/lib/open-url-in-browser"
MANIFEST_NAME="${HOST_NAME}.json"

NMH_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
    "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
    "$HOME/Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts"
    "$HOME/Library/Application Support/net.imput.helium/NativeMessagingHosts"
)

echo "Removing host manifests ..."
for dir in "${NMH_DIRS[@]}"; do
    manifest="$dir/$MANIFEST_NAME"
    if [ -f "$manifest" ]; then
        rm "$manifest"
        echo "  Removed: $manifest"
    fi
done

echo ""
echo "Removing installed script ..."
if [ -d "$INSTALL_DIR" ]; then
    sudo rm -rf "$INSTALL_DIR"
    echo "  Removed: $INSTALL_DIR"
else
    echo "  Not found: $INSTALL_DIR (already removed?)"
fi

echo ""
echo "Uninstall complete."
