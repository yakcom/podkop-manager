<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Браузерное расширение для управления маршрутизацией Podkop на OpenWrt.**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Обзор

**Podkop Manager** — это браузерная панель управления для **Podkop на OpenWrt**. Расширение определяет активный сайт, резолвит связанные хосты и публичные IPv4-адреса, собирает домены запросов текущей вкладки и позволяет выбрать, как этот трафик должен обрабатываться Podkop.

Проект состоит из двух частей:

| Часть | Назначение |
|---|---|
| **Браузерное расширение** | Определяет текущий сайт, управляет режимами маршрутизации, хранит локальное состояние и синхронизирует routing lists. |
| **OpenWrt router API** | Небольшой token-protected CGI endpoint, который записывает Podkop UCI lists и применяет изменения на роутере. |

Расширение рассматривает списки маршрутизации OpenWrt как проекцию своего локального состояния: оно строит чистые итоговые списки доменов и IP, удаляет дубли, применяет глобальные исключения и безопасно отправляет результат на роутер.

---

## Быстрый старт

### 1. Установите OpenWrt router API

Подключитесь к роутеру по SSH и выполните:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

Если в вашей сборке OpenWrt нет `wget`, используйте:

```sh
sh -c "$(uclient-fetch -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

Ожидаемый вывод:

```text
Podkop Manager: installed
Token: <token>
```

Скопируйте token. Он понадобится на экране настройки расширения.

### 2. Установите браузерное расширение

1. Скачайте и распакуйте release-архив.
2. Откройте `chrome://extensions`.
3. Включите **Developer mode**.
4. Нажмите **Load unpacked**.
5. Выберите распакованную папку `podkop-manager`.
6. Откройте popup расширения.
7. Укажите OpenWrt gateway и token из installer.
8. Нажмите **Connect**.

Адрес router API по умолчанию:

```text
http://192.168.0.1/cgi-bin/podkop-curator
```

---

## Удаление

### Удалить router API

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Ожидаемый вывод:

```text
Podkop Manager: removed
```

Удаление затрагивает только API endpoint расширения, token и runtime lock. Оно **не удаляет Podkop** и **не изменяет конфигурацию Podkop**.

---

## Возможности

### Маршрутизация с учётом текущей вкладки

Podkop Manager работает от активной вкладки браузера. Он определяет текущий сайт и строит routing entries из:

- основного origin;
- текущего hostname;
- resolved public IPv4 addresses;
- доменов, замеченных в запросах страницы;
- IP-адресов, связанных с запросами;
- вручную добавленных routing entries.

### Режимы маршрутизации

| Режим | Описание |
|---|---|
| **Direct** | Исключает сайт или запись из proxy routing. |
| **Base** | Добавляет основные записи сайта в routing lists Podkop. |
| **Deep** | Добавляет сайт и связанные request domains/IPs для более полного покрытия маршрутизации. |

### Область маршрутизации

| Scope | Описание |
|---|---|
| **domains** | Синхронизировать только домены. |
| **ips** | Синхронизировать только публичные IPv4 entries. |
| **domains + ips** | Синхронизировать домены и публичные IPv4 entries. |

### Глобальные исключения

Любой домен или IP можно исключить глобально. Исключённые entries отображаются как неактивные в интерфейсе и удаляются из итоговых proxied routing lists.

### Overview

Экран **Overview** предоставляет аккуратную routing library:

- proxied sites;
- direct exclusions;
- счётчики доменов и IP;
- раскрываемые карточки сайтов;
- ручные Direct entries;
- import/export workflow;
- редактор router lists.

### Router lists

Расширение может читать и редактировать итоговые списки, сохранённые на OpenWrt:

- domain list;
- IPv4/subnet list.

Это полезно для проверки, восстановления и расширенного ручного управления.

### Безопасная синхронизация

Во время синхронизации:

- popup мягко блокируется;
- повторные действия недоступны;
- отображается лёгкий анимированный cursor indicator;
- обновления роутера ставятся в очередь, чтобы избежать параллельных записей;
- OpenWrt endpoint использует runtime lock при применении изменений.

---

## Как это работает

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

Расширение не требует native messaging. Оно напрямую общается с OpenWrt router API по локальной сети.

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

API — это небольшой POSIX shell CGI script, рассчитанный на OpenWrt/BusyBox. Он принимает `POST` requests, проверяет token, читает и записывает Podkop UCI values и возвращает JSON responses.

Поддерживаемые высокоуровневые операции:

- connection test;
- status read;
- authoritative list replacement;
- Podkop control actions;
- global diagnostics;
- safe restart handling.

---

## Безопасность

- Router API предназначен только для **доверенной локальной сети**.
- Не публикуйте `/cgi-bin/podkop-curator` в интернет.
- API защищён локальным token, который хранится в `/etc/podkop-curator/token`.
- Installer по возможности записывает token с ограниченными правами.
- Браузерное расширение хранит token локально в extension storage.

---

## Структура проекта

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
├── README.md
└── README.ru.md
```

---

## Диагностика

### `OpenWrt API is not installed`

Расширение дошло до роутера, но API endpoint отсутствует. Установите router API повторно:

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

### `Invalid token`

Token, указанный в расширении, не совпадает с token на роутере.

Показать token на роутере:

```sh
cat /etc/podkop-curator/token
```

### `OpenWrt not found`

Проверьте, что адрес роутера указан правильно и доступен с компьютера, где открыт браузер.

Адрес по умолчанию:

```text
http://192.168.0.1/cgi-bin/podkop-curator
```

### Проверить API вручную

```sh
curl -X POST "http://192.168.0.1/cgi-bin/podkop-curator" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=<token>&action=test"
```

Ожидаемый ответ:

```json
{"ok":true,"message":"Router API OK"}
```

---

## Релиз

**Podkop Manager 1.0** — первый production-level релиз проекта.
