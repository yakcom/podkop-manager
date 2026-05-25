<p align="center"><img width="200" src="https://github.com/yakcom/podkop-manager/blob/main/icons/icon.png"/></p>
<div align="center">

# Podkop Manager

**Браузерное расширение для управления маршрутами Podkop на OpenWrt**

</div>

<p align="center">
  <a href="README.md">English</a> · <a href="README.ru.md">Русский</a>
</p>

## Обзор

**Podkop Manager** помогает управлять тем, какие сайты идут через **Podkop**, а какие остаются напрямую, прямо из текущей вкладки браузера.

Расширение определяет активный сайт, связанные домены запросов и публичные IPv4-адреса, а затем синхронизирует выбранные записи со списками Podkop на OpenWrt.

**OpenWrt router API** — это небольшой локальный endpoint на роутере, защищенный токеном. Расширение использует его для проверки подключения и обновления списков доменов/IP в Podkop.

---
<p align="center">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_0.png" width="320">
  <img src="https://raw.githubusercontent.com/yakcom/podkop-manager/main/icons/screen_5.png" width="320">
</p>

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

### Маршрутизация с учетом вкладки

Podkop Manager может использовать origin и hostname активной вкладки, связанные домены запросов, публичные IPv4-адреса и записи, добавленные вручную.

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

### Обзор и списки роутера

Экран **Overview** показывает проксируемые сайты, прямые исключения, счетчики, раскрываемые карточки сайтов, ручные записи, импорт/экспорт и редактор списков роутера.

Списки роутера можно просматривать и редактировать напрямую для проверки, восстановления и ручного управления.
