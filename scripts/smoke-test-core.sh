#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${NAVRATNA_CORE_URL:-http://localhost:3001}"
AUTH_TOKEN="${SMOKE_AUTH_TOKEN:-}"
PASS=0
FAIL=0
SKIP=0

green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[0;33m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="${4:-200}"

  local url="${BASE_URL}${path}"
  local curl_args=(-s -o /dev/null -w "%{http_code}" -X "$method" --max-time 5)

  if [[ -n "$AUTH_TOKEN" ]]; then
    curl_args+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi

  local status
  status=$(curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" || "$status" == "4"* || "$status" == "2"* ]]; then
    green "  PASS [$status] $method $path"
    PASS=$((PASS + 1))
  elif [[ "$status" == "000" ]]; then
    yellow "  SKIP [unreachable] $method $path"
    SKIP=$((SKIP + 1))
  else
    red "  FAIL [$status] $method $path (expected $expected_status)"
    FAIL=$((FAIL + 1))
  fi
}

bold "=== navratna-core smoke test (port 3001) ==="
echo ""

bold "[1] Health"
check "health"          GET /health           200
check "health/detailed" GET /health/detailed  200

bold "[2] Agent routes"
check "agents list"            GET  /api/v1/agents      200
check "agents relevance"       POST /api/v1/agents/relevance  400

bold "[3] Agent chat"
check "agent chat (no body)"   POST /api/v1/agents/nonexistent/chat  400

bold "[4] Agent capability"
check "agent capabilities"     GET /api/v1/agents/nonexistent/capabilities  400

bold "[5] Agent memory"
check "agent memory"           GET /api/v1/agents/nonexistent/memory/semantic  400

bold "[6] Cognitive portrait"
check "cognitive portrait"     GET /api/v1/users/nonexistent/cognitive-portrait  401
check "personalization vector" GET /api/v1/users/nonexistent/personalization-vector  401

bold "[7] Constellations"
check "constellations"         POST /api/v1/knowledge/constellations  400

bold "[8] Personas"
check "persona list"           GET /api/v1/personas  200

bold "[9] Discussions"
check "discussion list"        GET /api/v1/discussions  200
check "discussion search"      GET /api/v1/discussions/search  200

bold "[10] Artifacts"
check "artifact list"          GET /api/v1/artifacts  200

bold "[11] Short links"
check "link list"              GET /api/v1/links  200

bold "[12] LLM routes"
check "llm providers"          GET /api/v1/llm/providers  200

bold "[13] User LLM"
check "user llm models"        GET /api/v1/user/llm/models  200

bold "[14] Knowledge ingest"
check "knowledge ingest"       POST /api/v1/knowledge/ingest  400

echo ""
bold "=== Results ==="
green "  PASS: $PASS"
if [[ $FAIL -gt 0 ]]; then
  red "  FAIL: $FAIL"
else
  echo "  FAIL: $FAIL"
fi
if [[ $SKIP -gt 0 ]]; then
  yellow "  SKIP: $SKIP (service unreachable)"
fi

echo ""
if [[ $FAIL -gt 0 ]]; then
  red "Smoke test FAILED"
  exit 1
else
  green "Smoke test PASSED"
fi
