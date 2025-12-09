#!/usr/bin/env bash
set -euo pipefail

# Deploys the Vite frontend to Cloudflare Pages.
# Required env: CF_PAGES_PROJECT_NAME, CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID),
# CLOUDFLARE_API_TOKEN (or CF_API_TOKEN), and VITE_API_BASE_URL (or API_BASE_URL).
# Optional env: CF_PAGES_BRANCH, CF_PAGES_DIR, WRANGLER_CMD.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/apps/frontend"
DIST_DIR="${CF_PAGES_DIR:-${FRONTEND_DIR}/dist}"

PROJECT_NAME="${CF_PAGES_PROJECT_NAME:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT_ID:-}}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
API_BASE_URL="${VITE_API_BASE_URL:-${API_BASE_URL:-}}"
BRANCH="${CF_PAGES_BRANCH:-$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")}"
WRANGLER_CMD="${WRANGLER_CMD:-}"

log_info() { printf "[INFO] %s\n" "$1"; }
log_error() { printf "[ERROR] %s\n" "$1" >&2; }

require_value() {
  local label="$1"
  local value="$2"
  local hint="$3"
  if [[ -z "${value}" ]]; then
    log_error "${label} is required. ${hint}"
    exit 1
  fi
}

detect_wrangler() {
  if [[ -n "${WRANGLER_CMD}" ]]; then
    return
  fi

  if command -v wrangler >/dev/null 2>&1; then
    WRANGLER_CMD="wrangler"
  else
    WRANGLER_CMD="pnpm dlx wrangler"
  fi
}

check_prerequisites() {
  command -v pnpm >/dev/null 2>&1 || { log_error "pnpm is required"; exit 1; }
  command -v git >/dev/null 2>&1 || log_info "git not found; using 'main' for branch name"
  detect_wrangler
  log_info "Using wrangler command: ${WRANGLER_CMD}"
}

build_frontend() {
  log_info "Installing workspace dependencies..."
  (cd "${ROOT_DIR}" && pnpm install --frozen-lockfile)

  log_info "Building shared packages..."
  (cd "${ROOT_DIR}" && pnpm build:shared)

  log_info "Building frontend with API base URL: ${API_BASE_URL}"
  (cd "${FRONTEND_DIR}" \
    && API_BASE_URL="${API_BASE_URL}" VITE_API_BASE_URL="${API_BASE_URL}" NODE_ENV=production pnpm build)

  if [[ ! -d "${DIST_DIR}" ]]; then
    log_error "Build output missing at ${DIST_DIR}"
    exit 1
  fi
}

deploy_to_cloudflare() {
  export CLOUDFLARE_ACCOUNT_ID="${ACCOUNT_ID}"
  export CLOUDFLARE_API_TOKEN="${API_TOKEN}"

  log_info "Deploying to Cloudflare Pages project '${PROJECT_NAME}' (branch: ${BRANCH})"
  ${WRANGLER_CMD} pages deploy "${DIST_DIR}" \
    --project-name "${PROJECT_NAME}" \
    --branch "${BRANCH}" \
    --commit-dirty
}

main() {
  require_value "CF_PAGES_PROJECT_NAME" "${PROJECT_NAME}" "Set the target Pages project."
  require_value "CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID" "${ACCOUNT_ID}" "Provide the Cloudflare account ID."
  require_value "CLOUDFLARE_API_TOKEN/CF_API_TOKEN" "${API_TOKEN}" "Provide an API token with Pages access."
  require_value "VITE_API_BASE_URL/API_BASE_URL" "${API_BASE_URL}" "Set the public API base URL for the frontend."

  check_prerequisites
  build_frontend
  deploy_to_cloudflare
  log_info "Deployment complete."
}

main "$@"
