# Podkop Curator OpenWrt API

Router-side API used by the Podkop Manager browser extension.

## Files

- `podkop-curator.cgi` — router HTTP API endpoint
- `install.sh` — one-command installer
- `uninstall.sh` — one-command uninstaller

## Install

Replace `OWNER/REPO` with your GitHub repo:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/OWNER/REPO/main/openwrt/install.sh)"
```

If `wget` is unavailable:

```sh
sh -c "$(uclient-fetch -qO- https://raw.githubusercontent.com/OWNER/REPO/main/openwrt/install.sh)"
```

The installer prints the generated token. Copy it into the browser extension settings.

## Uninstall

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/OWNER/REPO/main/openwrt/uninstall.sh)"
```

Uninstall removes only:

```text
/www/cgi-bin/podkop-curator
/etc/podkop-curator.token
/tmp/podkop-curator.lock
```

It does not remove Podkop and does not change Podkop UCI config.
