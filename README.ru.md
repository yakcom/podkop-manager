<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Маршрутизация Podkop прямо из браузера**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Обзор

**Podkop Manager** — это браузерное расширение для управления маршрутизацией **Podkop** на OpenWrt с текущей страницы.

С его помощью можно отправить текущий сайт через Podkop, оставить его напрямую или добавить связанные домены и публичные IPv4-адреса, когда это нужно. Podkop Manager синхронизирует списки роутера, чтобы маршрутизация оставалась понятной и легко настраивалась.

---
<p align="center">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_0.png" width="320">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_5.png" width="320">
</p>

## Быстрый старт

### 1. Установите OpenWrt router API

Установочный скрипт добавляет на роутер API, защищенный токеном. Он только проверяет статус и обновляет списки доменов/IP в Podkop; он не заменяет Podkop и не меняет посторонние настройки OpenWrt.

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

### Удалите router API

```sh
sh -c "$(wget -qO- https://raw.githubusercontent.com/yakcom/podkop-manager/main/openwrt/uninstall.sh)"
```

Ожидаемый вывод:

```text
Podkop Manager: removed
```

Удаляются только API endpoint, токен и runtime lock. Podkop и его UCI-конфигурация остаются без изменений.

---

## Возможности

### Умное определение сайта

Podkop Manager может использовать origin и hostname активной вкладки, связанные домены запросов, публичные IPv4-адреса и записи, добавленные вручную.

### Режимы маршрутизации

| Режим | Описание |
|---|---|
| **Direct** | Оставить записи вне проксируемой маршрутизации. |
| **Base** | Маршрутизировать основные записи сайта. |
| **Deep** | Маршрутизировать сайт вместе со связанными доменами/IP-адресами. |

### Область маршрутизации

| Область | Описание |
|---|---|
| **domains** | Только домены. |
| **ips** | Только публичные IPv4-записи. |
| **domains + ips** | Домены и публичные IPv4-записи. |

### Библиотека и списки роутера

Экран **Overview** показывает маршрутизируемые сайты, прямые исключения, счетчики, раскрываемые карточки сайтов, ручные записи, импорт/экспорт и редактор списков роутера для проверки или восстановления.
