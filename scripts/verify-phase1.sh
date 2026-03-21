#!/bin/bash

set -e

MODE="${1:-all}"
PASS=0
FAIL=0

log_pass() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
log_fail() { echo "[FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "========================================"
echo "Navratna Phase 1 Verification"
echo "Mode: $MODE"
echo "========================================"

check_file() {
  local file=$1
  local desc=$2
  if [ -f "$file" ]; then
    log_pass "$desc ($file)"
    return 0
  else
    log_fail "$desc ($file not found)"
    return 1
  fi
}

check_api() {
  local url=$1
  local desc=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    log_pass "$desc ($url)"
    return 0
  else
    log_fail "$desc ($url)"
    return 1
  fi
}

echo ""
echo "--- Frontend Components ---"

if [[ "$MODE" == "all" ]] || [[ "$MODE" == "frontend" ]]; then
  check_file "apps/frontend/src/components/IntentField/IntentField.tsx" "IntentField component"
  check_file "apps/frontend/src/components/IntentField/IntentField.types.ts" "IntentField types"
  check_file "apps/frontend/src/components/IntentField/useIntentDetection.ts" "IntentField hook"
  check_file "apps/frontend/src/components/MaterializableBlock/MaterializableBlock.tsx" "MaterializableBlock HOC"
  check_file "apps/frontend/src/components/MaterializableBlock/MaterializableBlock.types.ts" "MaterializableBlock types"
  check_file "apps/frontend/src/types/microexpression.ts" "Microexpression types"
  check_file "apps/frontend/src/hooks/useMicroexpression.ts" "useMicroexpression hook"
  check_file "apps/frontend/src/components/Microexpression/Microexpression.tsx" "Microexpression indicator"

  if grep -q "lazy(" "apps/frontend/src/components/DesktopUnified.tsx" 2>/dev/null; then
    log_pass "DesktopUnified uses React.lazy()"
  else
    log_fail "DesktopUnified missing React.lazy()"
  fi

  if grep -q "Suspense" "apps/frontend/src/components/DesktopUnified.tsx" 2>/dev/null; then
    log_pass "DesktopUnified has Suspense boundaries"
  else
    log_fail "DesktopUnified missing Suspense boundaries"
  fi
fi

echo ""
echo "--- Backend Services ---"

if [[ "$MODE" == "all" ]] || [[ "$MODE" == "backend" ]]; then
  check_file "backend/services/agent-intelligence/src/services/relevance.ts" "relevance() service"
  check_file "backend/services/llm-service/src/config/agentModels.json" "Agent models config"
  check_file "backend/services/llm-service/src/services/modelRouting.service.ts" "Model routing service"
  check_file "backend/services/orchestration-pipeline/src/sops/sop-registry.ts" "SOP registry"
  check_file "backend/services/orchestration-pipeline/src/services/sopImport.service.ts" "SOP import service"
  check_file "backend/services/capability-registry/src/services/skillImport.service.ts" "Skill import service"
  check_file "backend/services/capability-registry/src/skills/openclaw-skills.json" "OpenClaw skills manifest"
fi

echo ""
echo "--- Database Seeding ---"

if [[ "$MODE" == "all" ]] || [[ "$MODE" == "database" ]]; then
  check_file "database/seed/agents/00-seed-agents.sql" "14 agent personas seed"

  AGENT_COUNT=$(grep -c '"origin": "openclaw"' "database/seed/agents/00-seed-agents.sql" 2>/dev/null || echo "0")
  if [ "$AGENT_COUNT" -ge 14 ]; then
    log_pass "Seed contains $AGENT_COUNT agent inserts"
  else
    log_fail "Seed contains only $AGENT_COUNT agents (expected 14)"
  fi

  if grep -q "openclaw" "database/seed/agents/00-seed-agents.sql" 2>/dev/null; then
    log_pass "Agents marked with OpenClaw origin"
  else
    log_fail "Agents missing OpenClaw origin marker"
  fi
fi

echo ""
echo "--- API Endpoints ---"

if [[ "$MODE" == "all" ]] || [[ "$MODE" == "backend" ]]; then
  echo "(API checks require running services - skip for file-only verification)"
fi

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -eq 0 ]; then
  echo "Phase 1: READY"
  exit 0
else
  echo "Phase 1: INCOMPLETE"
  echo ""
  echo "Missing or incomplete components."
  echo "Review failed checks above."
  exit 1
fi
