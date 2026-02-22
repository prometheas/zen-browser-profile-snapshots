#!/usr/bin/env sh
set -eu

REPO="${ZEN_BACKUP_REPO:-prometheas/zen-browser-profile-snapshots}"
VERSION="${ZEN_BACKUP_VERSION:-latest}"
INSTALL_DIR="${ZEN_BACKUP_INSTALL_DIR:-/usr/local/bin}"
ASSUME_YES="${ZEN_BACKUP_ASSUME_YES:-0}"
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

echo "Downloading ${BINARY_NAME} (${ARCH_TARGET}-${OS_TARGET}) from ${DOWNLOAD_URL}" >&2

if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar "$DOWNLOAD_URL" -o "$TMP_BIN"
elif command -v wget >/dev/null 2>&1; then
  wget --progress=bar:force "$DOWNLOAD_URL" -O "$TMP_BIN"
else
  echo "curl or wget is required" >&2
  exit 1
fi

chmod +x "$TMP_BIN"

TARGET_PATH="$INSTALL_DIR/$BINARY_NAME"
echo "Install destination: $TARGET_PATH" >&2

if mkdir -p "$INSTALL_DIR" 2>/dev/null && [ -w "$INSTALL_DIR" ]; then
  install -m 0755 "$TMP_BIN" "$TARGET_PATH"
else
  echo "Destination $INSTALL_DIR requires elevated privileges." >&2
  if [ "$ASSUME_YES" != "1" ]; then
    if [ -e /dev/tty ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
      if ! printf "Proceed with sudo install to %s? [y/N] " "$INSTALL_DIR" > /dev/tty; then
        echo "Cannot prompt for confirmation in non-interactive mode." >&2
        echo "Re-run interactively or set ZEN_BACKUP_INSTALL_DIR to a writable path." >&2
        exit 1
      fi
      IFS= read -r CONFIRM < /dev/tty || CONFIRM=""
      case "$CONFIRM" in
        y|Y|yes|YES) ;;
        *)
          echo "installation cancelled by user" >&2
          exit 1
          ;;
      esac
    else
      echo "Cannot prompt for confirmation in non-interactive mode." >&2
      echo "Re-run interactively or set ZEN_BACKUP_INSTALL_DIR to a writable path." >&2
      exit 1
    fi
  fi

  echo "Elevated privileges are required to install to $INSTALL_DIR." >&2
  echo "You may be prompted by sudo for your password." >&2
  sudo mkdir -p "$INSTALL_DIR"
  sudo install -m 0755 "$TMP_BIN" "$TARGET_PATH"
fi

echo "installed $BINARY_NAME to $TARGET_PATH"
"$TARGET_PATH" status || true
