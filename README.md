<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Browser extension for Podkop routing control on OpenWrt**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Overview

**Podkop Manager** is a browser extension for managing **Podkop** routing directly from the current tab.

It detects the active site, shows related domains and public IPv4 addresses, and syncs selected routing entries to OpenWrt.

| Part | Role |
|---|---|
| **Browser extension** | UI, site detection, routing modes, local state, sync. |
| **OpenWrt API** | Token-protected router endpoint for writing Podkop routing lists. |

<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 10px;">
    <img src="https://github.com/yakcom/podkop-manager/blob/main/icons/screen_0.png" >
    <img src="https://github.com/yakcom/podkop-manager/blob/main/icons/screen_5.png" >
</div>

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

Copy the token. You will need it in the extension setup screen.

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

### Tab-aware control

Podkop Manager works with the active tab and can use:

- main origin;
- current hostname;
- public IPv4 addresses;
- request domains;
- manually added entries.

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

### Global exclusions

Any domain or IP can be excluded globally. Excluded entries are shown as inactive and are not synced to proxied lists.

### Overview

The **Overview** screen includes:

- proxied sites;
- direct exclusions;
- domain/IP counters;
- expandable site cards;
- manual Direct entries;
- import/export;
- router list editor.

### Router lists

Read and edit the final OpenWrt lists:

- domain list;
- IPv4/subnet list.

Useful for verification, recovery, and manual control.
