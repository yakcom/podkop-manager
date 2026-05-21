#!/bin/sh
set -eu

REPO_OWNER="yakcom"
REPO_NAME="podkop-manager"
BRANCH="${BRANCH:-main}"

APP_NAME="podkop-curator"
CGI_PATH="/www/cgi-bin/podkop-curator"
CONFIG_DIR="/etc/podkop-curator"
TOKEN_PATH="/etc/podkop-curator/token"
LOCK_PATH="/tmp/podkop-curator.lock"

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAME/$BRANCH/openwrt}"
CGI_URL="${CGI_URL:-$BASE_URL/podkop-curator.cgi}"

if [ -t 1 ]; then
  C0="$(printf '\033[0m')"
  C_DIM="$(printf '\033[2;37m')"
  C_NAME="$(printf '\033[1;37m')"
  C_OK="$(printf '\033[1;32m')"
  C_TOKEN="$(printf '\033[1;36m')"
  C_ERR="$(printf '\033[1;31m')"
else
  C0=""; C_DIM=""; C_NAME=""; C_OK=""; C_TOKEN=""; C_ERR=""
fi

die() {
  printf '%s\n' "${C_ERR}Podkop Manager: error${C0}" >&2
  printf '%s\n' "$*" >&2
  exit 1
}

fetch_to_file() {
  url="$1"
  out="$2"
  if command -v uclient-fetch >/dev/null 2>&1; then
    uclient-fetch -qO "$out" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
  elif command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$out"
  else
    die "no downloader found"
  fi
}

make_token() {
  if [ -s "$TOKEN_PATH" ]; then
    cat "$TOKEN_PATH"
    return 0
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  elif [ -r /dev/urandom ] && command -v hexdump >/dev/null 2>&1; then
    dd if=/dev/urandom bs=24 count=1 2>/dev/null | hexdump -v -e '/1 "%02x"'
  else
    date +%s | awk '{print "podkop-" $1 "-change-me"}'
  fi
}

[ "$(id -u)" = "0" ] || die "run as root on OpenWrt"

[ -d /www/cgi-bin ] || mkdir -p /www/cgi-bin || die "cannot create /www/cgi-bin"
[ -d "$CONFIG_DIR" ] || mkdir -p "$CONFIG_DIR" || die "cannot create $CONFIG_DIR"

token="$(make_token)"
umask 077
printf '%s\n' "$token" > "$TOKEN_PATH" || die "cannot write token"
chmod 600 "$TOKEN_PATH" 2>/dev/null || true

tmp="/tmp/$APP_NAME.cgi.$$"
fetch_to_file "$CGI_URL" "$tmp" || { rm -f "$tmp"; die "download failed"; }
grep -q "podkop-curator" "$tmp" 2>/dev/null || { rm -f "$tmp"; die "invalid payload"; }
sh -n "$tmp" || { rm -f "$tmp"; die "invalid shell syntax"; }

if [ -f "$CGI_PATH" ]; then
  ts="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo now)"
  cp "$CGI_PATH" "$CGI_PATH.bak.$ts" 2>/dev/null || true
fi

mv "$tmp" "$CGI_PATH" || { rm -f "$tmp"; die "install failed"; }
chmod 755 "$CGI_PATH" || die "chmod failed"
rm -rf "$LOCK_PATH" 2>/dev/null || true

printf '%s%s:%s %sinstalled%s\n' "$C_NAME" "Podkop Manager" "$C0" "$C_OK" "$C0"
printf '%sToken:%s %s%s%s\n' "$C_DIM" "$C0" "$C_TOKEN" "$token" "$C0"
