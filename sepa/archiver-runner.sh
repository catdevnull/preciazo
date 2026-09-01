#!/bin/sh
set -u

interval_seconds="${ARCHIVER_INTERVAL_SECONDS:-7200}"
retry_seconds="${ARCHIVER_RETRY_SECONDS:-300}"

trap 'exit 0' INT TERM

run_archiver() {
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$started_at] Starting SEPA archiver"

  if bun run /app/archiver.ts; then
    finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "[$finished_at] SEPA archiver completed"

    if [ -n "${UPTIME_KUMA_PUSH_URL:-}" ]; then
      curl --fail --silent --show-error \
        --connect-timeout 10 \
        --max-time 30 \
        --retry 5 \
        --retry-delay 5 \
        --retry-max-time 180 \
        --retry-all-errors \
        "$UPTIME_KUMA_PUSH_URL"
    fi
    return 0
  fi

  failed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$failed_at] SEPA archiver failed" >&2
  return 1
}

while true; do
  if run_archiver; then
    sleep "$interval_seconds" &
  else
    sleep "$retry_seconds" &
  fi
  wait $!
done
