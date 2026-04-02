#!/bin/sh
set -e

REPO="zzbyy/openclaw-words-hunter"
FILE="words-hunter-openclaw.tgz"
URL="https://github.com/$REPO/releases/latest/download/$FILE"
TMP="$(mktemp /tmp/words-hunter-openclaw.XXXXXX.tgz)"

echo "Downloading $FILE..."
curl -fsSL -o "$TMP" "$URL"

echo "Installing..."
openclaw plugins install "$TMP"

rm -f "$TMP"
echo "Done. Restart the OpenClaw gateway to load the plugin."
