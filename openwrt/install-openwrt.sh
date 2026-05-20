#!/bin/sh
set -eu

opkg update
opkg install uhttpd

mkdir -p /www/cgi-bin /etc/podkop-curator
cp ./podkop-curator.cgi /www/cgi-bin/podkop-curator
chmod 755 /www/cgi-bin/podkop-curator

if [ ! -s /etc/podkop-curator/token ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24 > /etc/podkop-curator/token
  else
    dd if=/dev/urandom bs=24 count=1 2>/dev/null | hexdump -ve '1/1 "%02x"' > /etc/podkop-curator/token
  fi
  chmod 600 /etc/podkop-curator/token
fi

/etc/init.d/uhttpd enable >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart

echo "Installed: http://192.168.0.1/cgi-bin/podkop-curator"
echo "Token: $(cat /etc/podkop-curator/token)"
