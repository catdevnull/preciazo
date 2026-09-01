#!/bin/sh
set -eu

env_file="${1:-sepa/.env}"
item_name="${BW_ARCHIVER_ITEM_ID:-preciazo-archiver}"

if ! command -v bw >/dev/null 2>&1; then
  echo "Bitwarden CLI (bw) is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "Environment file not found: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

for field_name in GITHUB_TOKEN B2_BUCKET_NAME B2_BUCKET_KEY_ID B2_BUCKET_KEY; do
  eval "field_value=\${$field_name:-}"
  if [ -z "$field_value" ]; then
    echo "Missing required value in $env_file: $field_name" >&2
    exit 1
  fi
done

existing_id="$(bw get item "$item_name" 2>/dev/null | jq -r '.id // empty' || true)"
export BW_ARCHIVER_ITEM_NAME="$item_name"

make_item() {
  jq -n '{
    type: 2,
    name: env.BW_ARCHIVER_ITEM_NAME,
    secureNote: {type: 0},
    notes: "Managed by preciazo/scripts/bitwarden-import-archiver-env.sh",
    fields: [
      {name: "GITHUB_TOKEN", value: env.GITHUB_TOKEN, type: 1},
      {name: "B2_BUCKET_NAME", value: env.B2_BUCKET_NAME, type: 1},
      {name: "B2_BUCKET_KEY_ID", value: env.B2_BUCKET_KEY_ID, type: 1},
      {name: "B2_BUCKET_KEY", value: env.B2_BUCKET_KEY, type: 1},
      {name: "UPTIME_KUMA_PUSH_URL", value: (env.UPTIME_KUMA_PUSH_URL // ""), type: 1}
    ]
  }'
}

if [ -n "$existing_id" ]; then
  bw get item "$existing_id" \
    | jq '{
        id,
        organizationId,
        folderId,
        type: 2,
        name: env.BW_ARCHIVER_ITEM_NAME,
        secureNote: {type: 0},
        notes: "Managed by preciazo/scripts/bitwarden-import-archiver-env.sh",
        fields: [
          {name: "GITHUB_TOKEN", value: env.GITHUB_TOKEN, type: 1},
          {name: "B2_BUCKET_NAME", value: env.B2_BUCKET_NAME, type: 1},
          {name: "B2_BUCKET_KEY_ID", value: env.B2_BUCKET_KEY_ID, type: 1},
          {name: "B2_BUCKET_KEY", value: env.B2_BUCKET_KEY, type: 1},
          {name: "UPTIME_KUMA_PUSH_URL", value: (env.UPTIME_KUMA_PUSH_URL // ""), type: 1}
        ],
        favorite,
        reprompt
      }' \
    | bw encode \
    | bw edit item "$existing_id" >/dev/null
  echo "Updated Bitwarden item: $item_name"
else
  make_item \
    | bw encode \
    | bw create item >/dev/null
  echo "Created Bitwarden item: $item_name"
fi
