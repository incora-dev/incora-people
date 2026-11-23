#!/usr/bin/env bash
set -u

url_file="${INCORA_TUNNEL_URL_FILE:-/run/user/1000/incora-people-tunnel-url}"

if ! /usr/bin/curl --fail --silent --show-error --max-time 15 \
  http://127.0.0.1:3000/roadmap >/dev/null; then
  /usr/bin/systemctl --user restart incora-people.service incora-people-tunnel.service
  exit 0
fi

if [[ ! -s "$url_file" ]]; then
  /usr/bin/systemctl --user restart incora-people-tunnel.service
  exit 0
fi

public_url="$(<"$url_file")"
for attempt in 1 2 3; do
  if /usr/bin/curl --fail --silent --show-error --max-time 12 \
    "${public_url%/}/roadmap" >/dev/null; then
    exit 0
  fi
  if [[ "$attempt" -lt 3 ]]; then
    /usr/bin/sleep 3
  fi
done

/usr/bin/systemctl --user restart incora-people-tunnel.service
