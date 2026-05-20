#!/bin/sh
set -eu

CGI_PATH="/www/cgi-bin/podkop-curator"
CONFIG_DIR="/etc/podkop-curator"
TOKEN_PATH="/etc/podkop-curator/token"
LEGACY_TOKEN_PATH="/etc/podkop-curator.token"
LOCK_PATH="/tmp/podkop-curator.lock"

if [ -t 1 ]; then
  C0="$(printf '\033[0m')"
  C_NAME="$(printf '\033[1;37m')"
  C_OK="$(printf '\033[1;32m')"
  C_ERR="$(printf '\033[1;31m')"
else
  C0=""; C_NAME=""; C_OK=""; C_ERR=""
fi

die() { printf '%s\n' "${C_ERR}Podkop Manager: error${C0}" >&2; printf '%s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run as root on OpenWrt"

rm -f "$CGI_PATH" "$TOKEN_PATH" "$LEGACY_TOKEN_PATH" 2>/dev/null || true
rm -rf "$LOCK_PATH" 2>/dev/null || true
[ -d "$CONFIG_DIR" ] && rmdir "$CONFIG_DIR" 2>/dev/null || true

printf '%s%s:%s %sremoved%s\n' "$C_NAME" "Podkop Manager" "$C0" "$C_OK" "$C0"
