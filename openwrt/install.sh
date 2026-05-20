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
warn() { printf '%s\n' "${C2}! $*${C0}"; }
die() { printf '%s\n' "${CE}✕ ERROR:${C0} $*" >&2; exit 1; }

banner() {
  line
  say "${C1}Podkop Manager${C0} ${C2}· OpenWrt router API${C0}"
  say "${C2}yakcom/podkop-manager${C0}"
  line
}

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
    ok "Existing API backed up: $CGI_PATH.bak.$ts"
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

install_api() {
  banner
  need_root
  ok "Running as root"

  step "Preparing OpenWrt paths"
  [ -d /www/cgi-bin ] || mkdir -p /www/cgi-bin || die "failed to create /www/cgi-bin"
  [ -d "$CONFIG_DIR" ] || mkdir -p "$CONFIG_DIR" || die "failed to create $CONFIG_DIR"
  ok "Paths ready"

  step "Preparing API token"
  token="$(make_token)"
  umask 077
  printf '%s\n' "$token" > "$TOKEN_PATH" || die "failed to write token file"
  chmod 600 "$TOKEN_PATH" || true
  ok "Token stored: $TOKEN_PATH"

  tmp="/tmp/$APP_NAME.cgi.$$"
  step "Fetching router API from GitHub"
  fetch_to_stdout "$CGI_URL" > "$tmp" || { rm -f "$tmp"; die "download failed: $CGI_URL"; }
  ok "Downloaded: $CGI_URL"

  step "Verifying payload"
  grep -q "podkop-curator" "$tmp" 2>/dev/null || {
    rm -f "$tmp"
    die "downloaded file does not look like podkop-curator.cgi"
  }
  sh -n "$tmp" || { rm -f "$tmp"; die "downloaded CGI has shell syntax errors"; }
  ok "Shell syntax OK"

  step "Installing router API"
  backup_existing
  mv "$tmp" "$CGI_PATH" || { rm -f "$tmp"; die "failed to install CGI"; }
  chmod 755 "$CGI_PATH" || die "failed to chmod CGI"
  rm -rf "$LOCK_PATH" 2>/dev/null || true
  ok "Installed: $CGI_PATH"

  line
  say "${C1}Installation complete.${C0}"
  say "${C2}Use this token in Podkop Manager:${C0}"
  say ""
  say "${C3}$token${C0}"
  say ""
  say "${C2}API endpoint:${C0} http://ROUTER_IP/cgi-bin/podkop-curator"
  line
}

install_api
