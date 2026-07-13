#!/bin/sh
# Ether installer — puts the latest release in /Applications with zero
# Gatekeeper friction: curl downloads carry no com.apple.quarantine attribute,
# so the app opens immediately (no notarization, no xattr dance).
#
#   curl -fsSL https://raw.githubusercontent.com/bryndalski/lokowka/main/install.sh | sh
#
# Options: --open  launch Ether after installing.
set -eu

REPO="bryndalski/lokowka"
APP_DIR="/Applications"
APP_PATH="$APP_DIR/Ether.app"

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Ether is a macOS app — this installer only runs on macOS."
[ "$(uname -m)" = "arm64" ] || fail "prebuilt binaries are Apple Silicon (arm64) only for now — build from source on Intel: https://github.com/$REPO#development"

# Resolve the latest release tag and its .app tarball asset via the GitHub API.
api="https://api.github.com/repos/$REPO/releases/latest"
asset_url=$(curl -fsSL "$api" | grep -o '"browser_download_url": *"[^"]*\.app\.tar\.gz"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
[ -n "$asset_url" ] || fail "could not find an .app.tar.gz asset on the latest release of $REPO"

tag=$(printf '%s\n' "$asset_url" | sed 's|.*/download/\([^/]*\)/.*|\1|')
printf 'Installing Ether %s → %s\n' "$tag" "$APP_PATH"

workdir=$(mktemp -d /tmp/ether-install.XXXXXX)
trap 'rm -rf "$workdir"' EXIT

curl -fL --progress-bar "$asset_url" -o "$workdir/ether.app.tar.gz"
tar -xzf "$workdir/ether.app.tar.gz" -C "$workdir"
[ -d "$workdir/Ether.app" ] || fail "archive did not contain Ether.app"

# The bundle ships ad-hoc signed; verify integrity before touching /Applications.
codesign --verify --deep --strict "$workdir/Ether.app" || fail "signature verification failed on the downloaded bundle"

[ -w "$APP_DIR" ] || fail "$APP_DIR is not writable — rerun from an admin account"
rm -rf "$APP_PATH"
mv "$workdir/Ether.app" "$APP_PATH"

printf '✓ Ether %s installed. Launch it from Spotlight or:  open %s\n' "$tag" "$APP_PATH"
if [ "${1:-}" = "--open" ]; then
  open "$APP_PATH"
fi
