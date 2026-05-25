<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Manage Podkop routing on OpenWrt, site by site**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Overview

**Podkop Manager** lets you choose which sites go through **Podkop** and which stay direct, right from the current browser tab.

It detects the active site, related request domains, and public IPv4 addresses, then syncs your choices to Podkop lists on OpenWrt.

The **OpenWrt router API** is a small local, token-protected endpoint installed on the router. The extension uses it to check the connection and update Podkop domain/IP lists.

---
<p align="center">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_0.png" width="320">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_5.png" width="320">
</p>

---

## Quick Start

### 1. Install the OpenWrt router API

SSH into your router and run:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

If your OpenWrt image does not include `wget`, use:

```sh
sh -c "$(uclient-fetch -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

Expected output:

```text
Podkop Manager: installed
Token: <token>
```

Copy the token. You will need it on the extension setup screen.

### 2. Install the browser extension

1. Download and unpack the release archive.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the unpacked `podkop-manager` folder.
6. Open the extension popup.
7. Enter your OpenWrt gateway and token.
8. Click **Connect**.

---

## Uninstall

### Remove the router API

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Expected output:

```text
Podkop Manager: removed
```

This removes only the API endpoint, token, and runtime lock. Podkop and its UCI configuration stay untouched.

---

## Features

### Tab-aware routing

Podkop Manager can use the active tab's origin, hostname, related request domains, public IPv4 addresses, and manually added entries.

### Routing modes

| Mode | Description |
|---|---|
| **Direct** | Exclude from proxy routing. |
| **Base** | Route the core site entries. |
| **Deep** | Route the site with related request domains/IPs. |

### Routing scope

| Scope | Description |
|---|---|
| **domains** | Domains only. |
| **ips** | Public IPv4 entries only. |
| **domains + ips** | Domains and public IPv4 entries. |

### Overview and router lists

The **Overview** screen shows proxied sites, direct exclusions, counters, expandable site cards, manual entries, import/export, and the router list editor.

Router lists can be viewed and edited directly for verification, recovery, and manual control.
