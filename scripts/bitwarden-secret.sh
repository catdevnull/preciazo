#!/bin/sh
set -eu

field_name="${1:?usage: bitwarden-secret.sh FIELD_NAME}"
item_id="${BW_ARCHIVER_ITEM_ID:-preciazo-archiver}"
env_file="${ARCHIVER_ENV_FILE:-sepa/.env}"

if command -v bw >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  if [ "$(bw status 2>/dev/null | jq -r '.status // empty')" = "unlocked" ]; then
    bitwarden_value="$(
      bw get item "$item_id" 2>/dev/null \
        | jq -er --arg field_name "$field_name" \
          '.fields[] | select(.name == $field_name) | .value' \
        || true
    )"
    if [ -n "$bitwarden_value" ]; then
      printf '%s\n' "$bitwarden_value"
      exit 0
    fi
  fi
fi

if [ ! -f "$env_file" ]; then
  echo "Secret unavailable in Bitwarden and environment file not found: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
eval "field_value=\${$field_name:-}"
if [ -z "$field_value" ]; then
  echo "Secret is empty: $field_name" >&2
  exit 1
fi
printf '%s\n' "$field_value"
