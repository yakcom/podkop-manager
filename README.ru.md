<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Браузерное расширение для управления маршрутизацией Podkop на OpenWrt**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Обзор

**Podkop Manager** — браузерное расширение для управления маршрутизацией **Podkop** прямо из текущей вкладки.

Оно определяет активный сайт, показывает связанные домены и публичные IPv4-адреса, а также синхронизирует выбранные записи маршрутизации с OpenWrt.

---
<p align="center">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_0.png" width="320">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_5.png" width="320">
</p>

---

## Быстрый старт

### 1. Установите API роутера OpenWrt

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

Скопируйте токен. Он понадобится на экране настройки расширения.

### 2. Установите браузерное расширение

1. Скачайте и распакуйте архив релиза.
2. Откройте `chrome://extensions`.
3. Включите **Developer mode**.
4. Нажмите **Load unpacked**.
5. Выберите распакованную папку `podkop-manager`.
6. Откройте всплывающее окно расширения.
7. Введите шлюз OpenWrt и токен.
8. Нажмите **Connect**.

---

## Удаление

### Удаление API роутера

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Ожидаемый вывод:

```text
Podkop Manager: removed
```

Это удаляет только конечную точку API, токен и runtime lock. Podkop и его UCI-конфигурация остаются без изменений.

---

## Возможности

### Управление с учетом вкладки

Podkop Manager работает с активной вкладкой и может использовать:

- основной origin;
- текущий hostname;
- публичные IPv4-адреса;
- домены запросов;
- записи, добавленные вручную.

### Режимы маршрутизации

| Режим | Описание |
|---|---|
| **Direct** | Исключить из проксируемой маршрутизации. |
| **Base** | Маршрутизировать основные записи сайта. |
| **Deep** | Маршрутизировать сайт вместе со связанными доменами запросов/IP-адресами. |

### Область маршрутизации

| Область | Описание |
|---|---|
| **domains** | Только домены. |
| **ips** | Только публичные IPv4-записи. |
| **domains + ips** | Домены и публичные IPv4-записи. |

### Глобальные исключения

Любой домен или IP-адрес можно исключить глобально. Исключенные записи отображаются как неактивные и не синхронизируются в проксируемые списки.

### Обзор

Экран **Overview** включает:

- проксируемые сайты;
- прямые исключения;
- счетчики доменов/IP;
- раскрываемые карточки сайтов;
- ручные Direct-записи;
- импорт/экспорт;
- редактор списков роутера.

### Списки роутера

Просматривайте и редактируйте итоговые списки OpenWrt:

- список доменов;
- список IPv4/подсетей.

Полезно для проверки, восстановления и ручного управления.
