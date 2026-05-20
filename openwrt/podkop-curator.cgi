#!/bin/sh

TOKEN_FILE="/etc/podkop-curator/token"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_ok() {
  msg="$(json_escape "$1")"
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n'
  printf '{"ok":true,"message":"%s"}\n' "$msg"
}

json_err() {
  code="$1"
  msg="$(json_escape "$2")"
  printf 'Status: %s\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n' "$code"
  printf '{"ok":false,"error":"%s"}\n' "$msg"
  exit 0
}

[ "$REQUEST_METHOD" = "OPTIONS" ] && json_ok "OK" && exit 0
[ "$REQUEST_METHOD" = "POST" ] || json_err "405 Method Not Allowed" "Only POST is allowed"
[ -r "$TOKEN_FILE" ] || json_err "500 Internal Server Error" "Token file is missing: $TOKEN_FILE"

read_body() {
  len="${CONTENT_LENGTH:-0}"
  [ "$len" -gt 0 ] 2>/dev/null || return 0
  dd bs=1 count="$len" 2>/dev/null
}

urldecode() {
  # Minimal form decoder for the characters this API receives.
  # BusyBox printf is not guaranteed to decode \xHH consistently, so keep it explicit.
  printf '%s' "$1" | sed \
    -e 's/+/ /g' \
    -e 's/%0[Dd]%0[Aa]/|/g' \
    -e 's/%0[Aa]/|/g' \
    -e 's/%0[Dd]/|/g' \
    -e 's/%3[Aa]/:/g' \
    -e 's/%2[Ff]/\//g' \
    -e 's/%7[Cc]/|/g' \
    -e 's/%20/ /g'
}

BODY="$(read_body)"

for pair in $(printf '%s' "$BODY" | tr '&' '\n'); do
  key="${pair%%=*}"
  val="${pair#*=}"
  val="$(urldecode "$val")"
  case "$key" in
    token) token="$val" ;;
    action) action="$val" ;;
    addDomains) addDomains="$val" ;;
    addSubnets) addSubnets="$val" ;;
    removeDomains) removeDomains="$val" ;;
    removeSubnets) removeSubnets="$val" ;;
    setDomains) setDomains="$val" ;;
    setSubnets) setSubnets="$val" ;;
  esac
done

EXPECTED="$(cat "$TOKEN_FILE" 2>/dev/null | tr -d '\r\n')"
[ -n "$EXPECTED" ] || json_err "500 Internal Server Error" "Token file is empty"
[ "$token" = "$EXPECTED" ] || json_err "403 Forbidden" "Invalid token"

[ -n "$action" ] || action="apply"

case "$action" in
  test)
    command -v uci >/dev/null 2>&1 || json_err "500 Internal Server Error" "uci command not found"
    uci -q show podkop >/dev/null 2>&1 || json_err "500 Internal Server Error" "UCI config podkop not found"
    json_ok "Router API OK"
    exit 0
    ;;
  apply|status|setLists|podkopStatus|restartPodkop|startPodkop|stopPodkop|enablePodkopAutostart|disablePodkopAutostart|globalCheck|rebootRouter) ;;
  *) json_err "400 Bad Request" "Unknown action" ;;
esac

is_domain() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?)+$'
}

is_ipv4() {
  printf '%s' "$1" | awk -F. '
    NF != 4 { exit 1 }
    {
      for (i = 1; i <= 4; i++) {
        if ($i !~ /^[0-9]+$/ || $i < 0 || $i > 255) exit 1
      }
      exit 0
    }'
}

is_ipv4_cidr() {
  ip="${1%/*}"
  p="${1#*/}"
  [ "$ip" != "$1" ] || return 1
  is_ipv4 "$ip" || return 1
  printf '%s' "$p" | grep -Eq '^[0-9]+$' || return 1
  [ "$p" -ge 0 ] 2>/dev/null && [ "$p" -le 32 ] 2>/dev/null
}

is_ipv6() {
  case "$1" in
    *:*) printf '%s' "$1" | grep -Eiq '^[0-9a-f:.]+$' ;;
    *) return 1 ;;
  esac
}

is_ipv6_cidr() {
  ip="${1%/*}"
  p="${1#*/}"
  [ "$ip" != "$1" ] || return 1
  is_ipv6 "$ip" || return 1
  printf '%s' "$p" | grep -Eq '^[0-9]+$' || return 1
  [ "$p" -ge 0 ] 2>/dev/null && [ "$p" -le 128 ] 2>/dev/null
}

normalize_subnet() {
  line="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
  case "$line" in
    */32)
      ip="${line%/32}"
      is_ipv4 "$ip" && { printf '%s\n' "$ip"; return 0; }
      ;;
    */128)
      ip="${line%/128}"
      is_ipv6 "$ip" && { printf '%s/128\n' "$ip"; return 0; }
      ;;
    */*)
      if is_ipv4_cidr "$line" || is_ipv6_cidr "$line"; then printf '%s\n' "$line"; return 0; fi
      ;;
    *)
      if is_ipv4 "$line"; then printf '%s\n' "$line"; return 0; fi
      if is_ipv6 "$line"; then printf '%s/128\n' "$line"; return 0; fi
      ;;
  esac
  return 1
}

clean_lines() {
  tr '\r\t |,' '\n\n\n\n\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | sed '/^$/d; /^#/d' | awk '{print tolower($1)}'
}

clean_domain_lines() {
  clean_lines | while IFS= read -r line; do
    is_domain "$line" && printf '%s\n' "$line"
  done | awk '!seen[$0]++'
}

clean_subnet_lines() {
  clean_lines | while IFS= read -r line; do
    normalize_subnet "$line"
  done | awk '!seen[$0]++'
}

json_array_from_lines() {
  first=1
  printf '['
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    esc="$(json_escape "$line")"
    if [ "$first" = 1 ]; then first=0; else printf ','; fi
    printf '"%s"' "$esc"
  done
  printf ']'
}

merge_domain_lines() {
  current="$1"
  additions="$2"
  {
    printf '%s\n' "$current" | clean_domain_lines
    printf '%s\n' "$additions" | clean_domain_lines
  } | awk '!seen[$0]++'
}

merge_subnet_lines() {
  current="$1"
  additions="$2"
  {
    printf '%s\n' "$current" | clean_subnet_lines
    printf '%s\n' "$additions" | clean_subnet_lines
  } | awk '!seen[$0]++'
}

remove_domain_lines() {
  current="$1"
  removals="$2"
  tmp="/tmp/podkop-curator-remove-domains.$$"
  printf '%s\n' "$removals" | clean_domain_lines > "$tmp"
  printf '%s\n' "$current" | clean_domain_lines | grep -vxFf "$tmp"
  rm -f "$tmp"
}

remove_subnet_lines() {
  current="$1"
  removals="$2"
  tmp="/tmp/podkop-curator-remove-subnets.$$"
  printf '%s\n' "$removals" | clean_subnet_lines > "$tmp"
  printf '%s\n' "$current" | clean_subnet_lines | grep -vxFf "$tmp"
  rm -f "$tmp"
}



read_podkop_text_option() {
  opt="$1"

  val="$(uci -q get "podkop.main.$opt" 2>/dev/null)"
  if [ -n "$val" ]; then
    printf '%s\n' "$val"
    return 0
  fi

  uci_line="$(uci -q show "podkop.main.$opt" 2>/dev/null | sed "s/^podkop\\.main\\.$opt=//")"
  if [ -n "$uci_line" ]; then
    printf '%s\n' "$uci_line" | sed "s/^'//; s/'$//; s/^\"//; s/\"$//"
    return 0
  fi

  awk -v opt="$opt" '
    function unquote_start(s,    q) {
      sub(/^[ \t]*/, "", s)
      q=substr(s,1,1)
      if (q=="\047" || q=="\"") return substr(s,2)
      return s
    }
    function strip_end_quote(s,    last) {
      last=substr(s,length(s),1)
      if (last=="\047" || last=="\"") return substr(s,1,length(s)-1)
      return s
    }
    function norm(s) {
      gsub(/^\047|\047$/, "", s)
      gsub(/^"|"$/, "", s)
      return s
    }
    BEGIN { inmain=0; capture=0; quote="" }
    $1=="config" {
      inmain = ($2=="section" && norm($3)=="main")
      capture = 0
      next
    }
    inmain && capture {
      line=$0
      if (quote != "" && substr(line,length(line),1)==quote) {
        print substr(line,1,length(line)-1)
        exit
      }
      print line
      next
    }
    inmain && $1=="option" && $2==opt {
      line=$0
      sub(/^[ \t]*option[ \t]+[^ \t]+[ \t]+/, "", line)
      sub(/^[ \t]*/, "", line)
      quote=substr(line,1,1)
      if (quote=="\047" || quote=="\"") {
        line=substr(line,2)
        if (substr(line,length(line),1)==quote) {
          print substr(line,1,length(line)-1)
          exit
        }
        print line
        capture=1
        next
      }
      print line
      exit
    }
  ' /etc/config/podkop 2>/dev/null
}

raw_lines() {
  sed 's/\r$//' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | sed '/^$/d; /^#/d'
}

currentDomains="$(read_podkop_text_option user_domains_text)"
currentSubnets="$(read_podkop_text_option user_subnets_text)"


LOCK_DIR="/tmp/podkop-curator.lock"

acquire_lock() {
  tries=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -ge 90 ] && json_err "503 Service Unavailable" "Podkop curator is busy"
    sleep 1
  done
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
}

release_lock() {
  rm -rf "$LOCK_DIR"
  trap - EXIT INT TERM
}

write_podkop_lists() {
  domains="$1"
  subnets="$2"

  if [ -n "$domains" ]; then
    uci set podkop.main.user_domain_list_type='text' || return 1
    uci set podkop.main.user_domains_text="$domains" || return 1
  else
    uci set podkop.main.user_domain_list_type='disabled' || return 1
    uci -q delete podkop.main.user_domains_text
  fi

  if [ -n "$subnets" ]; then
    uci set podkop.main.user_subnet_list_type='text' || return 1
    uci set podkop.main.user_subnets_text="$subnets" || return 1
  else
    uci set podkop.main.user_subnet_list_type='disabled' || return 1
    uci -q delete podkop.main.user_subnets_text
  fi

  uci commit podkop || return 1
  return 0
}

restart_podkop_once() {
  tmp="$1"
  /etc/init.d/podkop restart >"$tmp" 2>&1
}

apply_podkop_changes() {
  prevDomains="$1"
  prevSubnets="$2"
  tmp="/tmp/podkop-curator-apply.$$"

  # Safe path only: do not stop/start manually. Podkop owns its own restart logic.
  # If restart fails, restore the previous UCI lists and try to restart the previous config.
  if restart_podkop_once "$tmp"; then
    sleep 2
    rm -f "$tmp"
    return 0
  fi

  first_error="$(cat "$tmp" 2>/dev/null)"

  write_podkop_lists "$prevDomains" "$prevSubnets" >/dev/null 2>&1
  if restart_podkop_once "$tmp.rollback"; then
    sleep 2
    rollback_msg="previous config restored"
  else
    rollback_msg="rollback restart also failed: $(cat "$tmp.rollback" 2>/dev/null)"
  fi

  rm -f "$tmp" "$tmp.rollback"
  json_err "500 Internal Server Error" "Podkop restart failed; $rollback_msg. Original error: $first_error"
}


podkop_service_json() {
  running=0
  enabled=0
  status_text="unknown"
  podkop_status=""
  singbox_status=""
  artifact_status=""

  if /etc/init.d/podkop enabled >/dev/null 2>&1; then enabled=1; fi

  podkop_status="$(/etc/init.d/podkop status 2>&1)"
  status_text="$podkop_status"

  # 1) Runtime processes, when present.
  if [ -x /etc/init.d/sing-box ]; then
    singbox_status="$(/etc/init.d/sing-box status 2>&1)"
    if /etc/init.d/sing-box running >/dev/null 2>&1; then running=1; fi
  fi

  if [ "$running" = "0" ] && command -v ubus >/dev/null 2>&1; then
    if ubus call service list '{"name":"sing-box"}' 2>/dev/null | grep -q '"running"[[:space:]]*:[[:space:]]*true'; then
      running=1
    fi
  fi

  if [ "$running" = "0" ]; then
    if pgrep -x sing-box >/dev/null 2>&1 || pgrep -f '/sing-box ' >/dev/null 2>&1 || pgrep -f 'sing-box run' >/dev/null 2>&1; then
      running=1
    fi
  fi

  # 2) Podkop 0.7.x may not expose a useful daemon state. In LuCI the meaningful
  # "started" state is the applied routing/DNS state. Detect generated runtime
  # artifacts that podkop stop normally removes.
  if [ "$running" = "0" ]; then
    if [ -s /tmp/dnsmasq.d/podkop.conf ] || [ -s /tmp/dnsmasq.d/01-podkop.conf ] || [ -s /tmp/dnsmasq.d/podkop.dnsmasq ]; then
      running=1
      artifact_status="${artifact_status}dnsmasq "
    fi
  fi

  if [ "$running" = "0" ] && command -v nft >/dev/null 2>&1; then
    if nft list ruleset 2>/dev/null | grep -qi 'podkop\|sing-box\|podkop_mark\|podkop_proxy'; then
      running=1
      artifact_status="${artifact_status}nft "
    fi
  fi

  if [ "$running" = "0" ]; then
    if ip rule 2>/dev/null | grep -qi 'fwmark.*105\|fwmark.*0x69\|lookup.*podkop\|lookup.*105'; then
      running=1
      artifact_status="${artifact_status}ip-rule "
    fi
  fi

  if [ "$running" = "0" ]; then
    for f in /tmp/podkop* /var/run/podkop* /run/podkop*; do
      [ -e "$f" ] || continue
      case "$f" in
        *curator*) continue ;;
      esac
      running=1
      artifact_status="${artifact_status}tmp "
      break
    done
  fi

  # 3) Last fallback: parse podkop status text. Negative states must be checked
  # before positive states because "not running" contains "running".
  if [ "$running" = "0" ]; then
    case "$podkop_status" in
      *"not running"*|*"Not running"*|*"NOT running"*|*"inactive"*|*"Inactive"*|*"stopped"*|*"Stopped"*|*"dead"*)
        running=0
        ;;
      *"running"*|*"Running"*|*"active"*|*"Active"*|*"started"*|*"Started"*)
        running=1
        ;;
      *)
        if /etc/init.d/podkop running >/dev/null 2>&1; then running=1; else running=0; fi
        ;;
    esac
  fi

  if [ -n "$singbox_status" ]; then
    status_text="$podkop_status | sing-box: $singbox_status"
  fi
  if [ -n "$artifact_status" ]; then
    status_text="$status_text | artifacts: $artifact_status"
  fi

  status_text="$(json_escape "$status_text")"
  printf '{"ok":true,"running":%s,"enabled":%s,"status":"%s"}\n' "$running" "$enabled" "$status_text"
}

if [ "$action" = "podkopStatus" ]; then
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n'
  podkop_service_json
  exit 0
fi

if [ "$action" = "restartPodkop" ]; then
  if /etc/init.d/podkop restart >/tmp/podkop-curator-restart.$$ 2>&1; then
    sleep 2
    rm -f /tmp/podkop-curator-restart.$$
    json_ok "Podkop restarted"
  else
    msg="$(cat /tmp/podkop-curator-restart.$$ 2>/dev/null)"
    rm -f /tmp/podkop-curator-restart.$$
    json_err "500 Internal Server Error" "Podkop restart failed: $msg"
  fi
  exit 0
fi


if [ "$action" = "startPodkop" ]; then
  if /etc/init.d/podkop start >/tmp/podkop-curator-start.$$ 2>&1; then
    sleep 2
    rm -f /tmp/podkop-curator-start.$$
    json_ok "Podkop started"
  else
    if /etc/init.d/podkop restart >>/tmp/podkop-curator-start.$$ 2>&1; then
      sleep 2
      rm -f /tmp/podkop-curator-start.$$
      json_ok "Podkop started"
    else
      msg="$(cat /tmp/podkop-curator-start.$$ 2>/dev/null)"
      rm -f /tmp/podkop-curator-start.$$
      json_err "500 Internal Server Error" "Podkop start failed: $msg"
    fi
  fi
  exit 0
fi

if [ "$action" = "enablePodkopAutostart" ]; then
  if /etc/init.d/podkop enable >/tmp/podkop-curator-enable.$$ 2>&1; then
    sleep 1
    rm -f /tmp/podkop-curator-enable.$$
    json_ok "Podkop autostart enabled"
  else
    msg="$(cat /tmp/podkop-curator-enable.$$ 2>/dev/null)"
    rm -f /tmp/podkop-curator-enable.$$
    json_err "500 Internal Server Error" "Podkop autostart enable failed: $msg"
  fi
  exit 0
fi

if [ "$action" = "stopPodkop" ]; then
  if /etc/init.d/podkop stop >/tmp/podkop-curator-stop.$$ 2>&1; then
    sleep 2
    rm -f /tmp/podkop-curator-stop.$$
    json_ok "Podkop stopped"
  else
    msg="$(cat /tmp/podkop-curator-stop.$$ 2>/dev/null)"
    rm -f /tmp/podkop-curator-stop.$$
    json_err "500 Internal Server Error" "Podkop stop failed: $msg"
  fi
  exit 0
fi

if [ "$action" = "disablePodkopAutostart" ]; then
  if /etc/init.d/podkop disable >/tmp/podkop-curator-disable.$$ 2>&1; then
    sleep 1
    rm -f /tmp/podkop-curator-disable.$$
    json_ok "Podkop autostart disabled"
  else
    msg="$(cat /tmp/podkop-curator-disable.$$ 2>/dev/null)"
    rm -f /tmp/podkop-curator-disable.$$
    json_err "500 Internal Server Error" "Podkop autostart disable failed: $msg"
  fi
  exit 0
fi


if [ "$action" = "rebootRouter" ]; then
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n'
  printf '{"ok":true,"message":"Router reboot requested"}\n'
  ( sleep 1; reboot ) >/dev/null 2>&1 &
  exit 0
fi

if [ "$action" = "globalCheck" ]; then
  out=""
  passed=0

  if /etc/init.d/podkop check >/tmp/podkop-curator-check.$$ 2>&1; then
    passed=1
    out="$(cat /tmp/podkop-curator-check.$$ 2>/dev/null)"
  else
    out="$(cat /tmp/podkop-curator-check.$$ 2>/dev/null)"
    if [ -z "$out" ]; then
      if command -v podkop >/dev/null 2>&1; then
        if podkop check >/tmp/podkop-curator-check.$$ 2>&1; then
          passed=1
        fi
        out="$(cat /tmp/podkop-curator-check.$$ 2>/dev/null)"
      elif [ -x /usr/share/podkop/podkop ]; then
        if /usr/share/podkop/podkop check >/tmp/podkop-curator-check.$$ 2>&1; then
          passed=1
        fi
        out="$(cat /tmp/podkop-curator-check.$$ 2>/dev/null)"
      else
        out="Global check command is not available on this Podkop installation."
      fi
    fi
  fi
  rm -f /tmp/podkop-curator-check.$$

  out="$(printf '%s' "$out" | tail -n 80)"
  out_json="$(json_escape "$out")"
  if [ "$passed" = "1" ]; then message="Global check passed"; else message="Global check finished"; fi
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n'
  printf '{"ok":true,"passed":%s,"message":"%s","output":"%s"}\n' "$passed" "$message" "$out_json"
  exit 0
fi


if [ "$action" = "status" ]; then
  raw_domains_json="$(printf '%s\n' "$currentDomains" | raw_lines | json_array_from_lines)"
  raw_subnets_json="$(printf '%s\n' "$currentSubnets" | raw_lines | json_array_from_lines)"
  domains_json="$(printf '%s\n' "$currentDomains" | clean_domain_lines | json_array_from_lines)"
  subnets_json="$(printf '%s\n' "$currentSubnets" | clean_subnet_lines | json_array_from_lines)"
  printf 'Status: 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n\r\n'
  printf '{"ok":true,"domains":%s,"subnets":%s,"rawDomains":%s,"rawSubnets":%s}\n' "$domains_json" "$subnets_json" "$raw_domains_json" "$raw_subnets_json"
  exit 0
fi

if [ "$action" = "setLists" ]; then
  acquire_lock
  prevDomains="$(printf '%s\n' "$currentDomains" | clean_domain_lines)"
  prevSubnets="$(printf '%s\n' "$currentSubnets" | clean_subnet_lines)"
  newDomains="$(printf '%s\n' "$setDomains" | clean_domain_lines)"
  newSubnets="$(printf '%s\n' "$setSubnets" | clean_subnet_lines)"

  if [ "$newDomains" = "$prevDomains" ] && [ "$newSubnets" = "$prevSubnets" ]; then
    release_lock
    json_ok "Podkop lists unchanged"
    exit 0
  fi

  write_podkop_lists "$newDomains" "$newSubnets" || json_err "500 Internal Server Error" "Failed to write Podkop lists"
  apply_podkop_changes "$prevDomains" "$prevSubnets"
  release_lock
  json_ok "Podkop lists replaced"
  exit 0
fi

acquire_lock
prevDomains="$(printf '%s\n' "$currentDomains" | clean_domain_lines)"
prevSubnets="$(printf '%s\n' "$currentSubnets" | clean_subnet_lines)"
newDomains="$currentDomains"
newSubnets="$currentSubnets"

[ -n "$removeDomains" ] && newDomains="$(remove_domain_lines "$newDomains" "$removeDomains")"
[ -n "$removeSubnets" ] && newSubnets="$(remove_subnet_lines "$newSubnets" "$removeSubnets")"
[ -n "$addDomains" ] && newDomains="$(merge_domain_lines "$newDomains" "$addDomains")"
[ -n "$addSubnets" ] && newSubnets="$(merge_subnet_lines "$newSubnets" "$addSubnets")"

hasDomainChange=0
hasSubnetChange=0
[ -n "$addDomains$removeDomains" ] && hasDomainChange=1
[ -n "$addSubnets$removeSubnets" ] && hasSubnetChange=1

if [ "$hasDomainChange" = 1 ]; then
  uci set podkop.main.user_domain_list_type='text' || json_err "500 Internal Server Error" "Failed to set user_domain_list_type"
  uci set podkop.main.user_domains_text="$newDomains" || json_err "500 Internal Server Error" "Failed to set user_domains_text"
fi

if [ "$hasSubnetChange" = 1 ]; then
  if [ -n "$newSubnets" ]; then
    uci set podkop.main.user_subnet_list_type='text' || json_err "500 Internal Server Error" "Failed to set user_subnet_list_type"
    uci set podkop.main.user_subnets_text="$newSubnets" || json_err "500 Internal Server Error" "Failed to set user_subnets_text"
  else
    uci set podkop.main.user_subnet_list_type='disabled' || json_err "500 Internal Server Error" "Failed to disable user_subnet_list_type"
    uci -q delete podkop.main.user_subnets_text
  fi
fi

[ "$hasDomainChange" = 1 ] || [ "$hasSubnetChange" = 1 ] || { release_lock; json_ok "Nothing to update"; exit 0; }

uci commit podkop || json_err "500 Internal Server Error" "uci commit failed"

apply_podkop_changes "$prevDomains" "$prevSubnets"
release_lock
json_ok "Podkop lists updated"
