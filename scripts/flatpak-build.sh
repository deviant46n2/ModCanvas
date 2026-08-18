#!/usr/bin/env bash
# flatpak-build.sh — build + verify a shareable ModCanvas .flatpak bundle (P0-DISTRIB).
#
# The flatpak pipeline is the s61 wrap manifest (flatpak/com.modcanvas.app.yml):
# GNOME 50 runtime (47 was EOL + crashed webkit on this box — verified s55),
# companion jar bundled (the .deb does NOT carry it — the docs' deb-extraction
# route would silently lose companion deployment), libbz2 from the host,
# Prism filesystem doors + flatpak-spawn + secrets already worked out.
#
# The loop (s61 + s55 lessons, in order):
#   1. REBUILD the release binary — a stale wrap silently serves old behavior
#      (stale-binary discipline; the manifest wraps src-tauri/target/release/modcanvas).
#   2. WRAP via flatpak-builder (user install, so `flatpak run` works immediately).
#   3. EXPORT a shareable bundle from the build repo.
#   4. INSTALL the exported bundle (user install).
#   5. VERIFY the installed binary + companion jar are THIS wrap's artifacts.
#      md5 is a trap here — flatpak-builder strips with slightly different
#      flags than a local `strip`, so raw hashes never match. The reliable
#      invariant is the GNU build-id: identical iff the same compiled artifact.
#
# Usage: ./scripts/flatpak-build.sh [--skip-build]
#   --skip-build  reuse the current release binary (only if you just built it)
#
# Prereqs: flatpak + flatpak-builder installed; org.gnome.Platform//50 present:
#   flatpak install flathub org.gnome.Platform//50

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
APP_ID="com.modcanvas.app"
BUNDLE_NAME="ModCanvas_${VERSION}_amd64.flatpak"
BIN="src-tauri/target/release/modcanvas"
INSTALLED_BIN="$HOME/.local/share/flatpak/app/$APP_ID/x86_64/master/active/files/bin/modcanvas"

# 1. Rebuild the release binary (stale-binary discipline — the wrap copies it).
if [ "${1:-}" = "--skip-build" ]; then
  echo "==> [1/5] Skipping rebuild (--skip-build). Binary MUST be fresh."
else
  echo "==> [1/5] Rebuilding release binary (NO_STRIP=1 — linuxdeploy/CachyOS .relr.dyn)"
  NO_STRIP=1 pnpm build
fi

# Freshness check: binary newer than the newest tracked source change.
NEWEST_SRC="$(git log -1 --format='%ci' -- src-tauri/src frontend/src)"
BIN_MTIME="$(date -r "$BIN" '+%Y-%m-%d %H:%M:%S')"
echo "    binary mtime: $BIN_MTIME | newest src commit: $NEWEST_SRC"

# 2. Wrap (force-clean so the wrap reflects the current tree).
echo "==> [2/5] Wrapping into flatpak (GNOME 50, user install)"
flatpak-builder --force-clean --user --disable-cache \
  --repo=flatpak/build-repo flatpak/build-out flatpak/com.modcanvas.app.yml

# 3. Export the shareable bundle.
echo "==> [3/5] Exporting $BUNDLE_NAME"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  flatpak/build-repo "$BUNDLE_NAME" "$APP_ID" master

# 4. Install the exported bundle (user install). First install = new; a
#    rebuild of the same wrap = "already installed". Either is fine — step 5
#    is the real gate.
echo "==> [4/5] Installing $BUNDLE_NAME"
flatpak install -y --user "$BUNDLE_NAME"

# 5. Verify: installed binary + companion jar == this wrap's artifacts.
echo "==> [5/5] Verifying installed artifacts (build-id)"
FRESH_ID="$(readelf -n "$BIN" | awk '/Build ID/{print $3; exit}')"
INSTALLED_ID="$(readelf -n "$INSTALLED_BIN" | awk '/Build ID/{print $3; exit}')"
echo "    fresh build-id:     $FRESH_ID"
echo "    installed build-id: $INSTALLED_ID"
if [ "$FRESH_ID" != "$INSTALLED_ID" ]; then
  echo "!! Build-ids differ — the wrap served a stale binary. Clear the"
  echo "   flatpak-builder cache (flatpak/.flatpak-builder) and re-run."
  echo "   The cache is keyed on the MANIFEST, not on the path: sources it"
  echo "   wraps — a changed binary is invisible to it."
  exit 1
fi

COMP_SRC="workbench-companion-neoforge-1.21/build/libs/workbench-companion-1.0.0.jar"
COMP_INST="$HOME/.local/share/flatpak/app/$APP_ID/x86_64/master/active/files/share/modcanvas/companion/workbench-companion-1.0.0.jar"
if ! cmp -s "$COMP_SRC" "$COMP_INST"; then
  echo "!! Companion jar mismatch — re-wrap (or ./gradlew build first)."
  exit 1
fi
echo "    companion jar: match"

echo "==> Bundle verified: $BUNDLE_NAME ($(stat -c%s "$BUNDLE_NAME") bytes)"
echo "    Run it: flatpak run $APP_ID"