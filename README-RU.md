# Podkop Manager Router API

Эта сборка работает без Native Messaging. Расширение отправляет изменения напрямую на OpenWrt через локальный HTTP CGI endpoint.

Версия 1.3.16 оставляет Router API без изменений относительно 1.3.16, но расширение больше не отправляет IPv6 в список пользовательских подсетей. В подсети отправляются только IPv4.

## Схема

```text
Расширение браузера → http://192.168.0.1/cgi-bin/podkop-curator → uci → restart podkop
```

## Что делает расширение

- Base: добавляет текущий сайт в пользовательские списки Podkop.
- Deep: добавляет Base и дополнительно собирает сторонние домены ресурсов открытой вкладки.
- Direct: удаляет из пользовательских списков то, что ранее добавляло расширение для этого origin.
- Scope `domains + ips`: добавляет домены и публичные DNS A/AAAA IP.
- Scope `domains`: добавляет только домены.
- Scope `ips`: добавляет только публичные DNS A/AAAA IP.

IP сохраняются без `/32` и `/128`.

На роутере используются UCI-поля:

```sh
podkop.main.user_domain_list_type='text'
podkop.main.user_domains_text='...'
podkop.main.user_subnet_list_type='text'   # только если реально добавляется IP/подсеть
podkop.main.user_subnets_text='...'        # одиночные IP сохраняются без /32 и /128
```

После изменения выполняется:

```sh
uci commit podkop
/etc/init.d/podkop restart
```

## Установка CGI endpoint на OpenWrt

Скопируйте папку `openwrt` на роутер или создайте файлы вручную.

Вариант через `scp`:

```sh
scp -r openwrt root@192.168.0.1:/tmp/podkop-curator
ssh root@192.168.0.1
cd /tmp/podkop-curator
./install-openwrt.sh
```

Скрипт установит `uhttpd`, положит CGI-файл сюда:

```sh
/www/cgi-bin/podkop-curator
```

и создаст токен:

```sh
/etc/podkop-curator/token
```

Показать токен позже можно так:

```sh
cat /etc/podkop-curator/token
```

## Проверка API с компьютера

Замените `TOKEN` на значение из `/etc/podkop-curator/token`:

```sh
curl -X POST "http://192.168.0.1/cgi-bin/podkop-curator" \
  -d "action=test" \
  -d "token=TOKEN"
```

Ожидаемый ответ:

```json
{"ok":true,"message":"Router API OK"}
```

## Установка расширения

1. Распаковать архив.
2. Открыть `chrome://extensions`.
3. Включить Developer mode.
4. Нажать Load unpacked.
5. Выбрать папку расширения.
6. Нажать на иконку расширения.
7. Указать прямо во всплывающем окне:

```text
URL API роутера: http://192.168.0.1/cgi-bin/podkop-curator
Токен API: значение из /etc/podkop-curator/token
```

8. Нажать «Connect». Кнопка сначала проверяет Router API и токен; при ошибке настройка не сохраняется.

## Проверка списков на роутере

После добавления сайта:

```sh
uci get podkop.main.user_domains_text
uci -q get podkop.main.user_subnets_text
```

## Безопасность

Endpoint доступен из локальной сети по HTTP и защищён токеном. Не пробрасывайте этот URL в интернет. Лучше держать его только в LAN.


## Очистка ошибочно добавленных /32 и /128 из версии 1.3.0

Если в LuCI поле пользовательских подсетей стало красным из-за автоматически добавленных IP, можно временно очистить список подсетей:

```sh
uci set podkop.main.user_subnet_list_type='disabled'
uci -q delete podkop.main.user_subnets_text
uci commit podkop
/etc/init.d/podkop restart
```

Если в списке есть нужные подсети, не используйте эту очистку вслепую: сначала сохраните вывод `uci -q get podkop.main.user_subnets_text`.


## IPv6

OpenWrt-часть в этой сборке оставлена как в 1.3.16. Фильтрация IPv6 выполняется только в расширении: DNS resolve запрашивает только A-записи, а IPv6-адреса не отправляются в Router API.


## Изменения 1.3.16

- Popup больше не опирается на локальную память расширения для определения Direct/Base/Deep.
- При открытии сайта расширение читает текущие списки Podkop через Router API action=status.
- Deep дополнительно собирает текущие resource-запросы страницы через performance/resource harvest и webRequest.
- В список IP по-прежнему отправляются только IPv4. IPv6 не отправляются.

## Изменения 1.3.24

- Переписана механика переключения `Direct / Base / Deep` и `domains + ips / domains / ips`.
- Локальное состояние расширения теперь является основным источником для вычисления diff: что было записано, что нужно добавить, что нужно удалить.
- При смене scope расширение удаляет лишние записи из OpenWrt и добавляет недостающие без полной пересборки UI-логики.
- При переходе `Base → Deep`, `Deep → Base`, `Deep/Base → Direct` применяются только необходимые изменения списков.
- Deep-сессия обновляет локально записанные домены/IP после фонового сбора ресурсов, чтобы следующие переключения работали предсказуемо.
