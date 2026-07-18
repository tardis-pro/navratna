#!/usr/bin/env bash
# =============================================================================
# Navratna — fast Fly.io deploy for the two consolidated apps (core + gateway)
#
# WHY this exists: the previous manual command used `--no-cache`, which discarded
# ALL Docker layer cache on every deploy, forcing a cold pnpm install + two full
# Nx compile passes each time. The multi-stage Dockerfiles now use BuildKit cache
# mounts (pnpm store + Nx cache) and are cache-friendly — so we deploy WITHOUT
# --no-cache to reuse those layers. A code-only change then skips apt, pnpm
# install, and the library-layer compile entirely.
#
# Usage:
#   ./deploy/fly/fast-deploy.sh            # deploy both core + gateway
#   ./deploy/fly/fast-deploy.sh core       # deploy only navratna-core
#   ./deploy/fly/fast-deploy.sh gateway    # deploy only navratna-gateway
#   NO_CACHE=1 ./deploy/fly/fast-deploy.sh  # force a cold build (troubleshooting)
#
# Notes:
#   - Runs from the repo root (script cd's there).
#   - --local-only builds with your local BuildKit (Fly remote builder is flaky).
#   - Cache mounts persist on THIS machine across deploys.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

# BuildKit is required for the `--mount=type=cache` and `# syntax=` directives.
export DOCKER_BUILDKIT=1

TARGET="${1:-all}"
CACHE_FLAG=""
if [[ "${NO_CACHE:-0}" == "1" ]]; then
  CACHE_FLAG="--no-cache"
  echo "⚠️  NO_CACHE=1 — forcing a cold build (slow)."
fi

deploy_one() {
  local app="$1" toml="$2" dockerfile="$3"
  echo "🚀 Deploying ${app} ..."
  fly deploy \
    --config "deploy/fly/${toml}" \
    --dockerfile "deploy/fly/${dockerfile}" \
    --local-only \
    ${CACHE_FLAG}
  echo "✅ ${app} deployed."
}

case "$TARGET" in
  core)    deploy_one navratna-core    fly.core.toml    Dockerfile.core ;;
  gateway) deploy_one navratna-gateway fly.gateway.toml Dockerfile.gateway ;;
  all)
    deploy_one navratna-core    fly.core.toml    Dockerfile.core
    deploy_one navratna-gateway fly.gateway.toml Dockerfile.gateway
    ;;
  *)
    echo "Unknown target: $TARGET (expected: core | gateway | all)" >&2
    exit 1
    ;;
esac

echo "🎉 Done."
