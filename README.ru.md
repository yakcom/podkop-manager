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

Оно определяет активный сайт, показывает связанные домены и публичные IPv4-адреса и синхронизирует выбранные записи с OpenWrt.

| Часть | Назначение |
|---|---|
| **Браузерное расширение** | Интерфейс, определение сайта, режимы маршрутизации, локальное состояние, синхронизация. |
| **OpenWrt API** | Защищённый token endpoint на роутере для записи routing lists Podkop. |

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

---

## Безопасность

- Рассчитано только на **доверенную локальную сеть**.
- Не публикуйте `/cgi-bin/podkop-curator` в интернет.
- API защищён локальным token.
- Расширение хранит token локально в extension storage.
