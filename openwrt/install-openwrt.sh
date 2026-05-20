#!/bin/sh
# Compatibility wrapper. Prefer:
# sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
set -eu

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt}"
if command -v uclient-fetch >/dev/null 2>&1; then
  sh -c "$(uclient-fetch -qO- "$BASE_URL/install.sh")"
elif command -v wget >/dev/null 2>&1; then
  sh -c "$(wget -qO- "$BASE_URL/install.sh")"
elif command -v curl >/dev/null 2>&1; then
  sh -c "$(curl -fsSL "$BASE_URL/install.sh")"
else
  echo "ERROR: no downloader found: install uclient-fetch, wget or curl" >&2
  exit 1
fi
