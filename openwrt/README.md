# Podkop Manager · OpenWrt API

Router-side API for **Podkop Manager**.

Repository:

```text
yakcom/podkop-manager
```

## Install

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

Alternative:

```sh
sh -c "$(uclient-fetch -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

The installer prints the API token. Copy it into the extension settings.

## Uninstall

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Uninstall removes only the router API endpoint, token, and runtime lock. Podkop and its UCI configuration are not changed.
