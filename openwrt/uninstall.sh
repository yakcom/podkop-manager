#!/bin/sh
set -eu

REPO_OWNER="yakcom"
REPO_NAME="podkop-manager"

CGI_PATH="/www/cgi-bin/podkop-curator"
CONFIG_DIR="/etc/podkop-curator"
TOKEN_PATH="/etc/podkop-curator/token"
LEGACY_TOKEN_PATH="/etc/podkop-curator.token"
LOCK_PATH="/tmp/podkop-curator.lock"

if [ -t 1 ]; then
  C0="$(printf '\033[0m')"
  C1="$(printf '\033[1;37m')"
  C2="$(printf '\033[2;37m')"
  C3="$(printf '\033[1;36m')"
  C4="$(printf '\033[1;32m')"
  CE="$(printf '\033[1;31m')"
else
  C0=""; C1=""; C2=""; C3=""; C4=""; CE=""
fi

say() { printf '%s\n' "$*"; }
line() { printf '%s\n' "${C2}────────────────────────────────────────${C0}"; }
step() { printf '%s\n' "${C3}›${C0} $*"; }
ok() { printf '%s\n' "${C4}✓${C0} $*"; }
skip() { printf '%s\n' "${C2}· $*${C0}"; }
die() { printf '%s\n' "${CE}✕ ERROR:${C0} $*" >&2; exit 1; }

banner() {
  line
  say "${C1}Podkop Manager${C0} ${C2}· OpenWrt router API removal${C0}"
  say "${C2}$REPO_OWNER/$REPO_NAME${C0}"
  line
}

[ "$(id -u)" = "0" ] || die "run this command as root on OpenWrt"

banner
removed=0

step "Removing router API endpoint"
if [ -f "$CGI_PATH" ]; then
  rm -f "$CGI_PATH" || die "failed to remove $CGI_PATH"
  removed=1
  ok "Removed: $CGI_PATH"
else
  skip "Endpoint was not installed"
fi

step "Removing API token"
if [ -f "$TOKEN_PATH" ]; then
  rm -f "$TOKEN_PATH" || die "failed to remove $TOKEN_PATH"
  removed=1
  ok "Removed: $TOKEN_PATH"
else
  skip "Token file was not present"
fi

if [ -f "$LEGACY_TOKEN_PATH" ]; then
  rm -f "$LEGACY_TOKEN_PATH" || die "failed to remove $LEGACY_TOKEN_PATH"
  removed=1
  ok "Removed legacy token: $LEGACY_TOKEN_PATH"
fi

if [ -d "$CONFIG_DIR" ]; then
  rmdir "$CONFIG_DIR" 2>/dev/null || true
fi

step "Cleaning runtime lock"
if [ -d "$LOCK_PATH" ]; then
  rm -rf "$LOCK_PATH" || true
  ok "Removed stale lock: $LOCK_PATH"
else
  skip "No runtime lock"
fi

line
if [ "$removed" = "0" ]; then
  say "${C2}Nothing to remove. Router API was not installed.${C0}"
else
  say "${C1}Uninstall complete.${C0}"
fi
say "${C2}Podkop itself and its UCI configuration were not changed.${C0}"
line
