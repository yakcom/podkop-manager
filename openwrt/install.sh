#!/bin/sh
set -eu

APP_NAME="podkop-curator"
CGI_PATH="/www/cgi-bin/podkop-curator"
TOKEN_PATH="/etc/podkop-curator.token"
LOCK_PATH="/tmp/podkop-curator.lock"

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/OWNER/REPO/main/openwrt}"
CGI_URL="${CGI_URL:-$BASE_URL/podkop-curator.cgi}"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_root() {
  [ "$(id -u)" = "0" ] || die "run this command as root on OpenWrt"
}

fetch_to_stdout() {
  url="$1"
  if command -v uclient-fetch >/dev/null 2>&1; then
    uclient-fetch -qO- "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  elif command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
  else
    die "no downloader found: install uclient-fetch, wget or curl"
  fi
}

backup_existing() {
  if [ -f "$CGI_PATH" ]; then
    ts="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo now)"
    cp "$CGI_PATH" "$CGI_PATH.bak.$ts" || die "failed to backup existing CGI"
    say "Backup: $CGI_PATH.bak.$ts"
  fi
}

make_token() {
  if [ -s "$TOKEN_PATH" ]; then
    cat "$TOKEN_PATH"
    return 0
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  elif [ -r /dev/urandom ]; then
    dd if=/dev/urandom bs=24 count=1 2>/dev/null | hexdump -v -e '/1 "%02x"'
  else
    date +%s | awk '{print "podkop-" $1 "-change-me"}'
  fi
}

install_api() {
  need_root

  [ -d /www/cgi-bin ] || mkdir -p /www/cgi-bin || die "failed to create /www/cgi-bin"

  token="$(make_token)"
  umask 077
  printf '%s\n' "$token" > "$TOKEN_PATH" || die "failed to write token file"
  chmod 600 "$TOKEN_PATH" || true

  tmp="/tmp/$APP_NAME.cgi.$$"
  say "Downloading router API..."
  fetch_to_stdout "$CGI_URL" > "$tmp" || { rm -f "$tmp"; die "download failed: $CGI_URL"; }

  grep -q "podkop-curator" "$tmp" 2>/dev/null || {
    rm -f "$tmp"
    die "downloaded file does not look like podkop-curator.cgi"
  }

  sh -n "$tmp" || { rm -f "$tmp"; die "downloaded CGI has shell syntax errors"; }

  backup_existing
  mv "$tmp" "$CGI_PATH" || { rm -f "$tmp"; die "failed to install CGI"; }
  chmod 755 "$CGI_PATH" || die "failed to chmod CGI"
  rm -rf "$LOCK_PATH" 2>/dev/null || true

  say ""
  say "Podkop Curator router API installed."
  say "CGI:   $CGI_PATH"
  say "Token: $token"
  say ""
  say "Use this token in the browser extension settings."
  say ""
  say "Quick test from your PC:"
  say "curl -X POST \"http://ROUTER_IP/cgi-bin/podkop-curator\" -H \"Content-Type: application/x-www-form-urlencoded\" --data \"token=$token&action=test\""
}

install_api
