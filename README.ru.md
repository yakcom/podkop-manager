<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Браузерное расширение для управления маршрутизацией Podkop на OpenWrt.**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Обзор

**Podkop Manager** — браузерное расширение для управления маршрутизацией **Podkop** прямо из текущей вкладки.

Оно определяет активный сайт, показывает связанные домены и публичные IPv4-адреса и синхронизирует выбранные записи с OpenWrt через небольшой router-side API.

| Часть | Назначение |
|---|---|
| **Браузерное расширение** | Интерфейс, определение сайта, режимы маршрутизации, локальное состояние, синхронизация. |
| **OpenWrt API** | Token-protected CGI endpoint для записи Podkop UCI lists. |

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
7. Укажите OpenWrt gateway и token.
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

Удаляются только API endpoint, token и runtime lock. Podkop и его UCI-конфигурация не изменяются.

---

## Возможности

### Управление из текущей вкладки

Podkop Manager работает с активной вкладкой и может использовать:

- основной origin;
- текущий hostname;
- публичные IPv4-адреса;
- домены запросов;
- записи, добавленные вручную.

### Режимы маршрутизации

| Режим | Описание |
|---|---|
| **Direct** | Исключить из proxy routing. |
| **Base** | Маршрутизировать основные записи сайта. |
| **Deep** | Маршрутизировать сайт вместе со связанными request domains/IPs. |

### Область маршрутизации

| Scope | Описание |
|---|---|
| **domains** | Только домены. |
| **ips** | Только публичные IPv4 entries. |
| **domains + ips** | Домены и публичные IPv4 entries. |

### Глобальные исключения

Любой домен или IP можно исключить глобально. Такие записи отображаются как неактивные и не попадают в proxied lists.

### Overview

Экран **Overview** включает:

- proxied sites;
- direct exclusions;
- счётчики доменов и IP;
- раскрываемые карточки сайтов;
- ручные Direct entries;
- import/export;
- редактор router lists.

### Router lists

Просмотр и редактирование итоговых списков OpenWrt:

- domain list;
- IPv4/subnet list.

Полезно для проверки, восстановления и ручного управления.

### Безопасная синхронизация

Во время sync:

- popup блокируется;
- повторные действия недоступны;
- отображается лёгкий cursor indicator;
- записи на роутер идут через очередь;
- OpenWrt API использует runtime lock.

---

## Как это работает

```text
Browser tab
   ↓
Podkop Manager
   ↓
Domains / IPs / mode
   ↓
OpenWrt router API
   ↓
Podkop UCI lists
```

Native messaging не нужен. Расширение общается с router API напрямую по локальной сети.

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

API — небольшой POSIX shell CGI script для OpenWrt/BusyBox. Он принимает `POST` requests, проверяет token, обновляет Podkop UCI values и возвращает JSON.

Поддерживаемые операции:

- connection test;
- status read;
- list replacement;
- Podkop control actions;
- diagnostics;
- safe restart handling.

---

## Безопасность

- Рассчитано только на **доверенную локальную сеть**.
- Не публикуйте `/cgi-bin/podkop-curator` в интернет.
- API защищён локальным token.
- Расширение хранит token локально в extension storage.

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

Роутер доступен, но API endpoint отсутствует.

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/install.sh)"
```

### `Invalid token`

Token в расширении не совпадает с token на роутере.

```sh
cat /etc/podkop-curator/token
```

### `OpenWrt not found`

Проверьте адрес роутера и доступность локальной сети.

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

**Podkop Manager 1.0** — первый production-level релиз.
