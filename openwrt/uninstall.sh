#!/bin/sh
set -eu

CGI_PATH="/www/cgi-bin/podkop-curator"
TOKEN_PATH="/etc/podkop-curator.token"
LOCK_PATH="/tmp/podkop-curator.lock"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "run this command as root on OpenWrt"

removed=0

if [ -f "$CGI_PATH" ]; then
  rm -f "$CGI_PATH" || die "failed to remove $CGI_PATH"
  removed=1
  say "Removed: $CGI_PATH"
fi

if [ -f "$TOKEN_PATH" ]; then
  rm -f "$TOKEN_PATH" || die "failed to remove $TOKEN_PATH"
  removed=1
  say "Removed: $TOKEN_PATH"
fi

if [ -d "$LOCK_PATH" ]; then
  rm -rf "$LOCK_PATH" || true
  say "Removed stale lock: $LOCK_PATH"
fi

if [ "$removed" = "0" ]; then
  say "Podkop Curator router API was not installed."
else
  say "Podkop Curator router API uninstalled."
fi

say "Podkop itself and your Podkop UCI config were not changed."
