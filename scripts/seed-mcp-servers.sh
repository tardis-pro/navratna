#!/usr/bin/env bash
# Seeds the verified free MCP servers into a running Navratna gateway.
#
# Every entry below was validated with a live JSON-RPC handshake (initialize →
# notifications/initialized → tools/list) before being listed here. The stdio
# entries all launch via `bunx` because the production Fly container image
# (oven/bun:1) ships ONLY bun and bunx — there is no node, npx, uvx, python3 or
# docker, so an npx/uvx-based config would fail at spawn time.
#
# Usage:
#   scripts/seed-mcp-servers.sh                      # seed against production
#   API_BASE=http://localhost:3002 scripts/seed-mcp-servers.sh
#   INCLUDE_BROWSER=1 scripts/seed-mcp-servers.sh    # also seed playwright/puppeteer
#
# Browser servers are opt-in: they download a browser binary on first launch,
# which is slow and large inside an ephemeral container.

set -uo pipefail

API_BASE="${API_BASE:-https://api.navratna.tardis.digital}"
INCLUDE_BROWSER="${INCLUDE_BROWSER:-0}"
AUTH_HEADER=()
if [[ -n "${NAVRATNA_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${NAVRATNA_TOKEN}")
fi

install_server() {
  local name="$1" payload="$2"
  local response status body

  response=$(curl -sS -m 180 -w $'\n%{http_code}' \
    -X POST "${API_BASE}/api/v1/mcp/servers/${name}/install" \
    -H 'Content-Type: application/json' \
    -H 'x-user-role: admin' \
    "${AUTH_HEADER[@]}" \
    -d "${payload}" 2>&1)

  status="${response##*$'\n'}"
  body="${response%$'\n'*}"

  if [[ "${status}" == "200" ]]; then
    printf '  \033[32mOK\033[0m      %-22s %s\n' "${name}" "${body:0:80}"
    return 0
  fi
  printf '  \033[31mFAIL\033[0m    %-22s HTTP %s %s\n' "${name}" "${status}" "${body:0:160}"
  return 1
}

stdio_payload() {
  printf '{"transportType":"stdio","command":"bunx","args":%s}' "$1"
}

echo "Seeding MCP servers -> ${API_BASE}"
echo

failed=0

install_server "ddg-search" \
  "$(stdio_payload '["-y","@oevortex/ddg_search"]')" || failed=$((failed + 1))

install_server "sequential-thinking" \
  "$(stdio_payload '["-y","@modelcontextprotocol/server-sequential-thinking"]')" || failed=$((failed + 1))

install_server "memory" \
  "$(stdio_payload '["-y","@modelcontextprotocol/server-memory"]')" || failed=$((failed + 1))

install_server "fetch" \
  "$(stdio_payload '["-y","@tokenizin/mcp-npx-fetch"]')" || failed=$((failed + 1))

install_server "everything" \
  "$(stdio_payload '["-y","@modelcontextprotocol/server-everything"]')" || failed=$((failed + 1))

install_server "gitmcp" \
  '{"transportType":"streamable-http","httpUrl":"https://gitmcp.io/docs"}' || failed=$((failed + 1))

if [[ "${INCLUDE_BROWSER}" == "1" ]]; then
  install_server "playwright" \
    "$(stdio_payload '["-y","@playwright/mcp@latest","--headless","--isolated"]')" || failed=$((failed + 1))
  install_server "puppeteer" \
    "$(stdio_payload '["-y","@modelcontextprotocol/server-puppeteer"]')" || failed=$((failed + 1))
else
  echo
  echo "  skipped playwright/puppeteer (set INCLUDE_BROWSER=1 to seed them)"
fi

echo
echo "Registered servers:"
curl -sS -m 30 "${API_BASE}/api/v1/mcp/servers" "${AUTH_HEADER[@]}" | head -c 2000
echo

if [[ "${failed}" -gt 0 ]]; then
  echo
  echo "${failed} server(s) failed to install."
  exit 1
fi
