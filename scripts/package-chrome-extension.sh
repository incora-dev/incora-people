#!/usr/bin/env bash
set -euo pipefail

project_root="$(pwd)"
extension_dir="$project_root/apps/chrome-extension"
archive_dir="$project_root/public/downloads"
archive_path="$archive_dir/incora-people-time-extension.zip"

mkdir -p "$archive_dir"
rm -f "$archive_path"

# The package intentionally contains only the extension's public source files.
# OAuth client secrets, Cloudflare credentials and the deployed extension ID
# remain server-side and are never included in this archive.
(
  cd "$extension_dir"
  zip -q "$archive_path" \
    manifest.json \
    popup.html \
    popup.css \
    popup.js \
    auth.js \
    background.js \
    config.js \
    icons/icon-16.png \
    icons/icon-32.png \
    icons/icon-48.png \
    icons/icon-128.png \
    README.md
)

entries_file="$(mktemp)"
trap 'rm -f "$entries_file"' EXIT
unzip -Z1 "$archive_path" > "$entries_file"
grep -Fxq "icons/icon-16.png" "$entries_file"
if grep -Fxq "icon-16.png" "$entries_file"; then
  echo "Invalid Chrome extension package: icon paths were flattened." >&2
  exit 1
fi

echo "Chrome extension package created: $archive_path"
