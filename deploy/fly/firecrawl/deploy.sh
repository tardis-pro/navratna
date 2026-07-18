#!/usr/bin/env bash
# Self-hosted Firecrawl on Fly.io — 2 apps + reused Upstash Redis.
# Single-URL /v1/scrape runs synchronously in-process (skipNuq), so NO
# nuq-postgres / rabbitmq / dedicated redis is needed. The api runs the
# single-process server (node dist/src/index.js) via [experimental] cmd in
# fly.api.toml, overriding the default full-compose harness entrypoint.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORG="${FLY_ORG:-personal}"

# Reuse the same Upstash Redis as navratna-core:
#   REDIS_URL=$(fly ssh console --app navratna-core -C "printenv REDIS_URL")
REDIS_URL="${FIRECRAWL_REDIS_URL:-}"
if [ -z "$REDIS_URL" ]; then
  echo "!! Set FIRECRAWL_REDIS_URL to the Upstash rediss:// URL (same as navratna-core)."
  exit 1
fi

create_app () { fly apps create "$1" --org "$ORG" 2>/dev/null || echo "  ($1 already exists)"; }

echo "=== 1/3 create apps ==="
create_app navratna-fc-playwright
create_app navratna-fc-api

echo "=== 2/3 deploy playwright ==="
fly deploy --config "$DIR/fly.playwright.toml" --app navratna-fc-playwright --ha=false --yes

echo "=== 3/3 deploy api (Upstash Redis, single-process mode) ==="
fly secrets set REDIS_URL="$REDIS_URL" REDIS_RATE_LIMIT_URL="$REDIS_URL" --app navratna-fc-api --stage
fly deploy --config "$DIR/fly.api.toml" --app navratna-fc-api --ha=false --yes

echo ""
echo "=== DONE. Wire the gateway: ==="
echo "  fly secrets set FIRECRAWL_API_URL=https://navratna-fc-api.fly.dev --app navratna-gateway"
