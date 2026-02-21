#!/usr/bin/env sh
set -eu

REPO="${ZEN_BACKUP_REPO:-prometheas/zen-browser-profile-snapshots}"
VERSION="${ZEN_BACKUP_VERSION:-latest}"
INSTALL_DIR="${ZEN_BACKUP_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="zen-backup"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) OS_TARGET="apple-darwin" ;;
  linux) OS_TARGET="unknown-linux-gnu" ;;
  *)
    echo "unsupported operating system: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH_TARGET="aarch64" ;;
  x86_64|amd64) ARCH_TARGET="x86_64" ;;
  *)
    echo "unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

ASSET="${BINARY_NAME}-${ARCH_TARGET}-${OS_TARGET}"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM
TMP_BIN="$TMP_DIR/$BINARY_NAME"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP_BIN"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP_BIN" "$DOWNLOAD_URL"
else
  echo "curl or wget is required" >&2
  exit 1
fi

chmod +x "$TMP_BIN"

TARGET_PATH="$INSTALL_DIR/$BINARY_NAME"
if [ -w "$INSTALL_DIR" ]; then
  install -m 0755 "$TMP_BIN" "$TARGET_PATH"
else
  sudo install -m 0755 "$TMP_BIN" "$TARGET_PATH"
fi

echo "installed $BINARY_NAME to $TARGET_PATH"
"$TARGET_PATH" status || true
