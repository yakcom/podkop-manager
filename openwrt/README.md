# Podkop Manager · OpenWrt API

Router-side API for **Podkop Manager**, published from:

```text
yakcom/podkop-manager
```

## Install

SSH into your OpenWrt router and run:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

If `wget` is unavailable:

```sh
sh -c "$(uclient-fetch -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

The installer downloads `podkop-curator.cgi`, installs it to:

```text
/www/cgi-bin/podkop-curator
```

and creates the API token at:

```text
/etc/podkop-curator/token
```

Copy the printed token into the browser extension settings.

## Uninstall

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Uninstall removes only the router API endpoint, token, and runtime lock. It does **not** remove Podkop and does **not** change Podkop UCI configuration.

## Files

```text
openwrt/
  podkop-curator.cgi
  install.sh
  uninstall.sh
```
