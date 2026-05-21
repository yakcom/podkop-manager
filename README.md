<p align="center"><img  width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Browser extension for Podkop routing control for OpenWrt.**

</div>


## Overview

**Podkop Manager** is a browser-side control panel for **Podkop on OpenWrt**. It detects the active website, resolves related hosts and public IPv4 addresses, collects request domains from the current tab, and lets you decide how that traffic should be handled by Podkop.

The project has two parts:

| Part | Role |
|---|---|
| **Browser extension** | Detects the current site, manages routing modes, stores local state, and synchronizes routing lists. |
| **OpenWrt router API** | A small token-protected CGI endpoint that writes Podkop UCI lists and applies changes on the router. |

The extension treats OpenWrt routing lists as a projection of its local state: it builds clean final domain/IP lists, removes duplicates, applies global exclusions, and sends the resulting lists to the router safely.

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
7. Enter your OpenWrt gateway and the installer token.
8. Click **Connect**.

Default router API endpoint:

```text
http://192.168.0.1/cgi-bin/podkop-curator
```

### 3. Uninstall the router API

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Expected output:

```text
Podkop Manager: removed
```

Uninstall removes only the extension API endpoint, token, and runtime lock. It does **not** remove Podkop and does **not** modify your Podkop configuration.

---

## Features

### Tab-aware routing

Podkop Manager works from the active browser tab. It identifies the current website and builds routing entries from:

- the main origin;
- the current hostname;
- resolved public IPv4 addresses;
- domains observed in page requests;
- request-related IP addresses;
- manually added routing entries.

### Routing modes

| Mode | Description |
|---|---|
| **Direct** | Excludes the site or entry from proxy routing. |
| **Base** | Adds the core site entries to Podkop routing lists. |
| **Deep** | Adds the site plus related request domains/IPs for more complete routing coverage. |

### Routing scope

| Scope | Description |
|---|---|
| **domains** | Sync only domain entries. |
| **ips** | Sync only public IPv4 entries. |
| **domains + ips** | Sync both domains and public IPv4 entries. |

### Global exclusions

Any domain or IP can be excluded globally. Excluded entries are shown as inactive in the UI and are removed from the final proxied routing lists.

### Overview

The **Overview** screen provides a clean routing library:

- proxied sites;
- direct exclusions;
- domain and IP counters;
- expandable site cards;
- manual Direct entries;
- import/export workflow;
- router list editor.

### Router lists

The extension can read and edit the final lists stored on OpenWrt:

- domain list;
- IPv4/subnet list.

This is useful for verification, recovery, and advanced manual control.

### Safe synchronization

During synchronization:

- the popup is softly locked;
- repeated actions are blocked;
- a lightweight animated cursor indicator is shown;
- router updates are queued to avoid parallel writes;
- the OpenWrt endpoint uses a runtime lock while applying changes.

---

## How It Works

```text
Browser tab
   ↓
Podkop Manager extension
   ↓
Local state + request/DNS analysis
   ↓
Final domain/IP routing lists
   ↓
OpenWrt router API
   ↓
Podkop UCI config
   ↓
Podkop restart/apply
```

The extension does not require native messaging. It communicates directly with the OpenWrt router API over the local network.

---

## OpenWrt API

Router endpoint:

```text
/www/cgi-bin/podkop-curator
```

Token path:

```text
/etc/podkop-curator/token
```

The API is a small POSIX shell CGI script designed for OpenWrt/BusyBox environments. It accepts `POST` requests, validates the token, reads/writes Podkop UCI values, and returns JSON responses.

Supported high-level operations include:

- connection test;
- status read;
- authoritative list replacement;
- Podkop control actions;
- global diagnostics;
- safe restart handling.

---

## Security Notes

- The router API is intended for **trusted LAN use only**.
- Do not expose `/cgi-bin/podkop-curator` to the public internet.
- The API is protected with a local token stored at `/etc/podkop-curator/token`.
- The installer writes the token with restrictive permissions when possible.
- The browser extension stores the token locally in extension storage.

---

## Project Structure

```text
podkop-manager/
├── manifest.json
├── service-worker-loader.js
├── src/
│   └── popup/
│       └── index.html
├── assets/
│   ├── popup-*.js
│   └── popup-*.css
├── icons/
├── openwrt/
│   ├── podkop-curator.cgi
│   ├── install.sh
│   ├── uninstall.sh
│   └── install-openwrt.sh
└── README.md
```

---

## Troubleshooting

### `OpenWrt API is not installed`

The extension reached the router, but the API endpoint is missing. Install the router API again:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

### `Invalid token`

The token entered in the extension does not match the token stored on the router.

Show the router token:

```sh
cat /etc/podkop-curator/token
```

### `OpenWrt not found`

Check that the router address is correct and reachable from the browser machine.

Default address:

```text
http://192.168.0.1/cgi-bin/podkop-curator
```

### Check API manually

```sh
curl -X POST "http://192.168.0.1/cgi-bin/podkop-curator" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=<token>&action=test"
```

Expected response:

```json
{"ok":true,"message":"Router API OK"}
```

---

## Release

**Podkop Manager 1.0** is the first production-level release of the project.
