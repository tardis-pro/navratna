#!/usr/bin/env bash
# =============================================================================
# TARDIS Platform - Cloudflare DNS Automation
# =============================================================================
# Configures Cloudflare DNS records for the tardis.digital domain,
# including wildcard subdomain routing for the TARDIS multi-app platform.
#
# Required environment variables:
#   CF_API_TOKEN  - Cloudflare API token with DNS edit permissions
#   CF_ZONE_ID    - Cloudflare Zone ID for tardis.digital
#
# Usage:
#   ./setup-cloudflare-dns.sh init              # Create base DNS records
#   ./setup-cloudflare-dns.sh add <sub> <target> # Add a subdomain CNAME
#   ./setup-cloudflare-dns.sh list               # List all subdomain records
#   ./setup-cloudflare-dns.sh remove <sub>       # Remove a subdomain record
# =============================================================================

set -euo pipefail

CF_API="https://api.cloudflare.com/client/v4"
DOMAIN="tardis.digital"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "ERROR: CF_API_TOKEN is not set." >&2
  echo "Create a token at https://dash.cloudflare.com/profile/api-tokens" >&2
  echo "Required permissions: Zone > DNS > Edit" >&2
  exit 1
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "ERROR: CF_ZONE_ID is not set." >&2
  echo "Find it on the Cloudflare dashboard under your domain's Overview page." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Helper: Cloudflare API call
# ---------------------------------------------------------------------------
cf_api() {
  local method="$1"
  local endpoint="$2"
  shift 2
  curl -s -X "$method" \
    "${CF_API}${endpoint}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ---------------------------------------------------------------------------
# Helper: Create or update a DNS record
# ---------------------------------------------------------------------------
upsert_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="${4:-true}"
  local ttl="${5:-1}" # 1 = automatic

  echo "  Upserting ${type} record: ${name} -> ${content} (proxied=${proxied})"

  # Check if record already exists
  local existing
  existing=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?type=${type}&name=${name}")

  local count
  count=$(echo "$existing" | python3 -c "import sys,json; print(json.load(sys.stdin)['result_info']['count'])" 2>/dev/null || echo "0")

  if [[ "$count" -gt 0 ]]; then
    # Update existing record
    local record_id
    record_id=$(echo "$existing" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
    local result
    result=$(cf_api PUT "/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
      -d "{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"proxied\":${proxied},\"ttl\":${ttl}}")
    local success
    success=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])")
    if [[ "$success" == "True" ]]; then
      echo "    Updated existing record."
    else
      echo "    ERROR: Failed to update record." >&2
      echo "$result" | python3 -c "import sys,json; [print(f'    {e[\"message\"]}') for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null
      return 1
    fi
  else
    # Create new record
    local result
    result=$(cf_api POST "/zones/${CF_ZONE_ID}/dns_records" \
      -d "{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"proxied\":${proxied},\"ttl\":${ttl}}")
    local success
    success=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])")
    if [[ "$success" == "True" ]]; then
      echo "    Created new record."
    else
      echo "    ERROR: Failed to create record." >&2
      echo "$result" | python3 -c "import sys,json; [print(f'    {e[\"message\"]}') for e in json.load(sys.stdin).get('errors',[])]" 2>/dev/null
      return 1
    fi
  fi
}

# ---------------------------------------------------------------------------
# Command: init - Create base DNS records for the TARDIS platform
# ---------------------------------------------------------------------------
cmd_init() {
  echo "=== Initializing DNS records for ${DOMAIN} ==="
  echo ""

  # Root domain -> Cloudflare Pages (CNAME flattened at zone apex)
  echo "[1/3] Root domain (${DOMAIN} -> Cloudflare Pages)"
  upsert_record "CNAME" "${DOMAIN}" "tardis-digital.pages.dev" "true"

  # API subdomain -> backend (Fly.io or self-hosted)
  echo ""
  echo "[2/3] API subdomain (api.${DOMAIN} -> backend)"
  upsert_record "CNAME" "api.${DOMAIN}" "${BACKEND_TARGET:-tardis-api.fly.dev}" "true"

  # Wildcard subdomain -> edge gateway
  # Note: Wildcard DNS with Cloudflare proxy requires an Enterprise plan.
  # On free/pro plans, the wildcard record will be DNS-only (grey cloud).
  echo ""
  echo "[3/3] Wildcard subdomain (*.${DOMAIN} -> edge gateway)"
  upsert_record "CNAME" "*.${DOMAIN}" "${WILDCARD_TARGET:-tardis-api.fly.dev}" "false"

  echo ""
  echo "=== Base DNS initialization complete ==="
  echo ""
  echo "NOTES:"
  echo "  - Wildcard proxy (orange cloud) requires Cloudflare Enterprise."
  echo "  - On free/pro plans, add individual proxied CNAMEs for each subdomain."
  echo "  - TLS for wildcard: use Advanced Certificate Manager or setup-wildcard-tls.sh"
}

# ---------------------------------------------------------------------------
# Command: add - Add a subdomain CNAME record
# ---------------------------------------------------------------------------
cmd_add() {
  local subdomain="${1:-}"
  local target="${2:-}"

  if [[ -z "$subdomain" || -z "$target" ]]; then
    echo "Usage: $0 add <subdomain> <target>" >&2
    echo "Example: $0 add chess chess-app.fly.dev" >&2
    exit 1
  fi

  local fqdn="${subdomain}.${DOMAIN}"
  echo "Adding subdomain: ${fqdn} -> ${target}"
  upsert_record "CNAME" "${fqdn}" "${target}" "true"
  echo ""
  echo "Done. ${fqdn} is now proxied through Cloudflare to ${target}."
  echo "TLS is handled automatically when proxied (orange cloud)."
}

# ---------------------------------------------------------------------------
# Command: list - List all DNS records for the zone
# ---------------------------------------------------------------------------
cmd_list() {
  echo "=== DNS records for ${DOMAIN} ==="
  echo ""

  local page=1
  local total_pages=1

  while [[ "$page" -le "$total_pages" ]]; do
    local result
    result=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?per_page=50&page=${page}&order=name")

    total_pages=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['result_info']['total_pages'])")

    echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['result']:
    proxied = 'proxied' if r['proxied'] else 'dns-only'
    print(f\"  {r['type']:6s}  {r['name']:40s}  ->  {r['content']:40s}  [{proxied}]\")
"
    page=$((page + 1))
  done

  echo ""
}

# ---------------------------------------------------------------------------
# Command: remove - Remove a subdomain DNS record
# ---------------------------------------------------------------------------
cmd_remove() {
  local subdomain="${1:-}"

  if [[ -z "$subdomain" ]]; then
    echo "Usage: $0 remove <subdomain>" >&2
    echo "Example: $0 remove chess" >&2
    exit 1
  fi

  local fqdn="${subdomain}.${DOMAIN}"
  echo "Removing DNS records for: ${fqdn}"

  local result
  result=$(cf_api GET "/zones/${CF_ZONE_ID}/dns_records?name=${fqdn}")
  local count
  count=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['result_info']['count'])" 2>/dev/null || echo "0")

  if [[ "$count" -eq 0 ]]; then
    echo "  No records found for ${fqdn}."
    return 0
  fi

  echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['result']:
    print(r['id'])
" | while read -r record_id; do
    echo "  Deleting record ${record_id}..."
    local del_result
    del_result=$(cf_api DELETE "/zones/${CF_ZONE_ID}/dns_records/${record_id}")
    local success
    success=$(echo "$del_result" | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])")
    if [[ "$success" == "True" ]]; then
      echo "    Deleted."
    else
      echo "    ERROR: Failed to delete." >&2
    fi
  done

  echo ""
  echo "Done."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-help}" in
  init)
    cmd_init
    ;;
  add)
    cmd_add "${2:-}" "${3:-}"
    ;;
  list)
    cmd_list
    ;;
  remove)
    cmd_remove "${2:-}"
    ;;
  help|--help|-h)
    echo "TARDIS Platform - Cloudflare DNS Automation"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init                    Create base DNS records (root, api, wildcard)"
    echo "  add <subdomain> <target>  Add a proxied CNAME for a subdomain"
    echo "  list                    List all DNS records in the zone"
    echo "  remove <subdomain>      Remove a subdomain's DNS records"
    echo ""
    echo "Environment variables:"
    echo "  CF_API_TOKEN    (required) Cloudflare API token"
    echo "  CF_ZONE_ID      (required) Cloudflare Zone ID for tardis.digital"
    echo "  BACKEND_TARGET  (optional) Backend CNAME target (default: tardis-api.fly.dev)"
    echo "  WILDCARD_TARGET (optional) Wildcard CNAME target (default: tardis-api.fly.dev)"
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run '$0 help' for usage." >&2
    exit 1
    ;;
esac
