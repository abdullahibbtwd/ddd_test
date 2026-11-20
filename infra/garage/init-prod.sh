#!/usr/bin/env bash
# One-time (re-runnable) Garage layout + bucket + key setup for production compose.
#
# Usage (from repo root, stack already up enough for the garage service):
#   ./infra/garage/init-prod.sh
#
# Optional environment:
#   COMPOSE_FILE  ENV_FILE  GARAGE_SERVICE  S3_BUCKET  GARAGE_KEY_NAME
#   GARAGE_ZONE   GARAGE_CAPACITY
#   S3_ACCESS_KEY S3_SECRET_KEY  — when both set, imported as that key id/secret
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/infra/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
GARAGE_SERVICE="${GARAGE_SERVICE:-garage}"
S3_BUCKET="${S3_BUCKET:-ddcrm}"
GARAGE_KEY_NAME="${GARAGE_KEY_NAME:-ddcrm-app}"
ZONE="${GARAGE_ZONE:-dc1}"
CAPACITY="${GARAGE_CAPACITY:-1G}"

compose() {
  local args=(-f "$COMPOSE_FILE")
  if [[ -f "$ENV_FILE" ]]; then
    args+=(--env-file "$ENV_FILE")
  fi
  docker compose "${args[@]}" "$@"
}

g() {
  compose exec -T "$GARAGE_SERVICE" /garage "$@"
}

echo "==> Waiting for Garage..."
for _ in $(seq 1 60); do
  if g status >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

STATUS="$(g status)"
echo "$STATUS" | head -n 20

if echo "$STATUS" | grep -q "NO ROLE ASSIGNED"; then
  NODE_ID="$(echo "$STATUS" | awk '/^[0-9a-f]/{print $1; exit}')"
  if [[ -z "${NODE_ID:-}" ]]; then
    echo "Could not parse node id from garage status" >&2
    exit 1
  fi
  echo "==> Assigning layout (zone=$ZONE capacity=$CAPACITY node=${NODE_ID:0:12}…)"
  g layout assign -z "$ZONE" -c "$CAPACITY" "$NODE_ID"
  # Staged layout: first apply is version 1; re-runs skip via the NO ROLE check above.
  if ! g layout apply --version 1; then
    CURRENT="$(g layout show 2>/dev/null | sed -nE 's/.*[Vv]ersion[[:space:]:]*([0-9]+).*/\1/p' | head -n 1 || true)"
    NEXT=$(( ${CURRENT:-0} + 1 ))
    g layout apply --version "$NEXT"
  fi
else
  echo "==> Layout already assigned — skipping"
fi

if g bucket info "$S3_BUCKET" >/dev/null 2>&1; then
  echo "==> Bucket '$S3_BUCKET' already exists — skipping create"
else
  echo "==> Creating bucket '$S3_BUCKET'"
  g bucket create "$S3_BUCKET"
fi

if g key info "$GARAGE_KEY_NAME" >/dev/null 2>&1; then
  echo "==> Key '$GARAGE_KEY_NAME' already exists — skipping create/import"
else
  if [[ -n "${S3_ACCESS_KEY:-}" && -n "${S3_SECRET_KEY:-}" ]]; then
    echo "==> Importing key from S3_ACCESS_KEY / S3_SECRET_KEY"
    # Garage v2: `garage key import <key-id> <secret-key> --yes`
    # Then rename so the friendly name matches GARAGE_KEY_NAME.
    if g key import "$S3_ACCESS_KEY" "$S3_SECRET_KEY" --yes; then
      g key rename "$S3_ACCESS_KEY" "$GARAGE_KEY_NAME" 2>/dev/null \
        || g key rename "$GARAGE_KEY_NAME" "$S3_ACCESS_KEY" 2>/dev/null \
        || true
    else
      echo "Import failed; creating a new key instead." >&2
      g key create "$GARAGE_KEY_NAME"
      g key info "$GARAGE_KEY_NAME"
      echo "Update S3_ACCESS_KEY / S3_SECRET_KEY in .env.production from the values above." >&2
    fi
  else
    echo "==> Creating key '$GARAGE_KEY_NAME'"
    g key create "$GARAGE_KEY_NAME"
    g key info "$GARAGE_KEY_NAME"
    echo "Copy Key ID / Secret key into S3_ACCESS_KEY / S3_SECRET_KEY in .env.production"
  fi
fi

echo "==> Allowing read/write/owner on bucket '$S3_BUCKET' for key '$GARAGE_KEY_NAME'"
g bucket allow --read --write --owner "$S3_BUCKET" --key "$GARAGE_KEY_NAME" 2>/dev/null \
  || g bucket allow --read --write "$S3_BUCKET" --key "$GARAGE_KEY_NAME"

echo "==> Garage init complete."
