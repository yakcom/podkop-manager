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
  SPINNER=1
else
  C0=""; C1=""; C2=""; C3=""; C4=""; CE=""
  SPINNER=0
fi

die() { printf '\n%s\n' "${CE}error:${C0} $*" >&2; exit 1; }

title() {
  printf '%s\n' "${C1}Podkop Manager${C0} ${C2}router API removal${C0}"
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

remove_api() {
  [ -f "$CGI_PATH" ] && rm -f "$CGI_PATH"
  [ -f "$TOKEN_PATH" ] && rm -f "$TOKEN_PATH"
  [ -f "$LEGACY_TOKEN_PATH" ] && rm -f "$LEGACY_TOKEN_PATH"
  [ -d "$LOCK_PATH" ] && rm -rf "$LOCK_PATH"
  [ -d "$CONFIG_DIR" ] && rmdir "$CONFIG_DIR" 2>/dev/null || true
  return 0
}

[ "$(id -u)" = "0" ] || die "run as root on OpenWrt"

title
spin_run "Removing router endpoint" remove_api || die "removal failed"

printf '\n%s\n' "${C1}Removed.${C0}"
printf '%s\n' "${C2}Podkop and its UCI configuration were not changed.${C0}"
