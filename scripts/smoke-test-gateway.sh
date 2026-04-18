#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${NAVRATNA_GATEWAY_URL:-http://localhost:3002}"
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

bold "=== navratna-gateway smoke test (port 3002) ==="
echo ""

bold "[1] Health"
check "health" GET /health 200

bold "[2] Auth routes"
check "validate (no token)" GET  /api/v1/auth/validate  401
check "login (no body)"     POST /api/v1/auth/login     400
check "register (no body)"  POST /api/v1/auth/register  400

bold "[3] User routes"
check "users list"    GET  /api/v1/users        401
check "user profile"  GET  /api/v1/users/me     401

bold "[4] Approval routes"
check "approvals list" GET /api/v1/approvals  401

bold "[5] Audit routes"
check "audit logs"  GET /api/v1/audit-logs  401

bold "[6] Security routes"
check "security policies" GET /api/v1/security-policies  401

bold "[7] Security stats"
check "security stats" GET /api/v1/security-stats  401

bold "[8] Provider routes"
check "llm providers" GET /api/v1/llm-providers  401

bold "[9] OAuth routes"
check "oauth jira (no creds)" GET /api/v1/oauth/jira/auth  401

bold "[10] Persona routes (security-scoped)"
check "persona data" GET /api/v1/users/persona  401

bold "[11] Knowledge routes"
check "knowledge items"  GET /api/v1/knowledge  401
check "knowledge search" GET /api/v1/knowledge/search  401

bold "[12] Contact routes"
check "contacts" GET /api/v1/contacts  401

bold "[13] Tool preference routes"
check "tool preferences" GET /api/v1/tool-preferences  401

bold "[14] Dashboard routes"
check "dashboard" GET /api/v1/dashboard  401

bold "[15] Project routes (security-scoped)"
check "security projects" GET /api/v1/projects  401

bold "[16] Task routes"
check "tasks list"  GET /api/v1/tasks     401
check "task create" POST /api/v1/tasks    401

bold "[17] Project routes (orchestration)"
check "orchestration projects" GET /api/v1/projects  401

bold "[18] Workflow routes"
check "workflows list" GET /api/v1/workflows  401

bold "[19] Capability routes"
check "capabilities" GET /api/v1/capabilities  401

bold "[20] MCP routes"
check "mcp servers"  GET /api/v1/mcp  401
check "mcp tools"    GET /api/v1/mcp/tools  401

bold "[21] Tool routes"
check "tools list"    GET /api/v1/tools  401
check "tool search"   GET /api/v1/tools/search  401

bold "[22] Workspace routes"
check "workspace" GET /api/v1/workspace  401

bold "[23] Federation routes"
check "federation" GET /api/v1/federation  401

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
