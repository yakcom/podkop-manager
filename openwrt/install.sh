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
  SPINNER=1
else
  C0=""; C1=""; C2=""; C3=""; C4=""; CE=""
  SPINNER=0
fi

say() { printf '%s\n' "$*"; }
die() { printf '\n%s\n' "${CE}error:${C0} $*" >&2; exit 1; }

title() {
  printf '%s\n' "${C1}Podkop Manager${C0} ${C2}router API${C0}"
}

spin_run() {
  label="$1"
  shift
  tmp="/tmp/podkop-curator-step.$$"
  if [ "$SPINNER" = "1" ]; then
    (
      i=0
      frames='|/-\'
      while :; do
        i=$(( (i + 1) % 4 ))
        ch="$(printf '%s' "$frames" | cut -c $((i + 1)))"
        printf '\r%s %s' "${C3}$ch${C0}" "$label"
        sleep 0.12
      done
    ) &
    spid="$!"
    if "$@" >"$tmp" 2>&1; then
      kill "$spid" >/dev/null 2>&1 || true
      wait "$spid" 2>/dev/null || true
      printf '\r%s %s\n' "${C4}✓${C0}" "$label"
      rm -f "$tmp"
      return 0
    fi
    kill "$spid" >/dev/null 2>&1 || true
    wait "$spid" 2>/dev/null || true
    printf '\r%s %s\n' "${CE}✕${C0}" "$label"
    cat "$tmp" >&2
    rm -f "$tmp"
    return 1
  fi

  printf '%s\n' "› $label"
  if "$@" >"$tmp" 2>&1; then
    rm -f "$tmp"
    return 0
  fi
  cat "$tmp" >&2
  rm -f "$tmp"
  return 1
}

need_root() {
  [ "$(id -u)" = "0" ] || die "run as root on OpenWrt"
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
    die "no downloader found: uclient-fetch, wget or curl required"
  fi
}

prepare_paths() {
  [ -d /www/cgi-bin ] || mkdir -p /www/cgi-bin
  [ -d "$CONFIG_DIR" ] || mkdir -p "$CONFIG_DIR"
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

prepare_token() {
  token="$(make_token)"
  umask 077
  printf '%s\n' "$token" > "$TOKEN_PATH"
  chmod 600 "$TOKEN_PATH" 2>/dev/null || true
}

download_api() {
  tmp="/tmp/$APP_NAME.cgi.$$"
  fetch_to_file "$CGI_URL" "$tmp"
  grep -q "podkop-curator" "$tmp"
  sh -n "$tmp"
}

install_api_file() {
  if [ -f "$CGI_PATH" ]; then
    ts="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo now)"
    cp "$CGI_PATH" "$CGI_PATH.bak.$ts"
  fi
  mv "$tmp" "$CGI_PATH"
  chmod 755 "$CGI_PATH"
  rm -rf "$LOCK_PATH" 2>/dev/null || true
}

need_root
title

spin_run "Preparing OpenWrt paths" prepare_paths || die "path preparation failed"
spin_run "Creating API token" prepare_token || die "token preparation failed"
spin_run "Fetching router endpoint" download_api || { rm -f "${tmp:-}" 2>/dev/null || true; die "download or verification failed"; }
spin_run "Installing endpoint" install_api_file || { rm -f "${tmp:-}" 2>/dev/null || true; die "installation failed"; }

printf '\n%s\n' "${C1}Installed.${C0}"
printf '%s\n' "${C2}Endpoint:${C0} http://ROUTER_IP/cgi-bin/podkop-curator"
printf '%s\n' "${C2}Token:${C0} ${C3}$token${C0}"
