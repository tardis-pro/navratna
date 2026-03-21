#!/bin/bash
# =============================================================================
# Navratna Phase 0 Verification Script
# =============================================================================
# Usage: ./scripts/verify-phase0.sh [pc-a|pc-b|mac|standalone]
#
# This script verifies that Phase 0 infrastructure is correctly installed.
# =============================================================================

set -e

MACHINE="${1:-standalone}"
PASS=0
FAIL=0

log_pass() { echo "✓ $1"; ((PASS++)); }
log_fail() { echo "✗ $1"; ((FAIL++)); }

echo "========================================"
echo "Navratna Phase 0 Verification: $MACHINE"
echo "========================================"

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

check_service() {
  local name=$1
  local port=$2
  local endpoint=${3:-/health}
  local host=${4:-localhost}

  if curl -sf "http://${host}:${port}${endpoint}" > /dev/null 2>&1; then
    log_pass "$name (${host}:${port})"
  else
    log_fail "$name (${host}:${port})"
  fi
}

check_postgres_query() {
  local query=$1
  docker exec navratna-dev-postgres psql -U uaip_user -d uaip -t -c "$query" > /dev/null 2>&1
}

check_redis_command() {
  local cmd=$1
  docker exec navratna-dev-redis redis-cli -a uaip_redis_password --no-auth-warning $cmd > /dev/null 2>&1
}

# -----------------------------------------------------------------------------
# Infrastructure Checks
# -----------------------------------------------------------------------------

echo ""
echo "--- Infrastructure Services ---"

case "$MACHINE" in
  pc-a)
    echo "(PC-A: Memory + Intelligence)"
    check_service "PostgreSQL" 5432
    check_service "Neo4j" 7474
    check_service "Redis" 6379
    check_service "Qdrant" 6333
    check_service "Ollama" 11434 "/api/version"
    check_service "Navratna Core" 3001
    ;;
  pc-b)
    echo "(PC-B: Control + Compute)"
    check_service "Navratna Gateway" 3002
    check_service "Nginx" 8081
    ;;
  mac)
    echo "(Mac: Interface + Overflow)"
    check_service "Telescope" 5173
    check_service "Nginx" 8081
    ;;
  standalone)
    echo "(Standalone: All-in-One)"
    check_service "PostgreSQL" 5432
    check_service "Neo4j" 7474
    check_service "Redis" 6379
    check_service "Qdrant" 6333
    check_service "Ollama" 11434 "/api/version"
    check_service "Navratna Core" 3001
    check_service "Navratna Gateway" 3002
    check_service "Nginx" 8081
    ;;
  *)
    echo "Unknown machine: $MACHINE"
    echo "Usage: $0 [pc-a|pc-b|mac|standalone]"
    exit 1
    ;;
esac

# -----------------------------------------------------------------------------
# Database Checks
# -----------------------------------------------------------------------------

echo ""
echo "--- Database Initialization ---"

# Check PostgreSQL is accessible
if docker exec navratna-dev-postgres pg_isready -U uaip_user -d uaip > /dev/null 2>&1; then
  log_pass "PostgreSQL: accessible"
else
  log_fail "PostgreSQL: not accessible"
fi

# Check schemas exist
if check_postgres_query "SELECT 1 FROM agents.agent_definitions LIMIT 1"; then
  log_pass "PostgreSQL: agents schema"
else
  log_fail "PostgreSQL: agents schema"
fi

if check_postgres_query "SELECT 1 FROM capabilities.capability_definitions LIMIT 1"; then
  log_pass "PostgreSQL: capabilities schema"
else
  log_fail "PostgreSQL: capabilities schema"
fi

# Check Navratna agent personas were seeded
if check_postgres_query "SELECT 1 FROM agents.agent_definitions WHERE name IN ('Bhagwan', 'Veda', 'Rana', 'Sharma') LIMIT 1"; then
  log_pass "PostgreSQL: Navratna agent personas"
else
  log_fail "PostgreSQL: Navratna agent personas (may not be seeded yet)"
fi

# Check Redis
if check_redis_command "PING" > /dev/null 2>&1; then
  log_pass "Redis: accessible"
else
  log_fail "Redis: not accessible"
fi

# -----------------------------------------------------------------------------
# Deprecated Components Check (should NOT exist)
# -----------------------------------------------------------------------------

echo ""
echo "--- Deprecated Components (should NOT exist) ---"

# Check RabbitMQ is removed
if docker ps -a --format '{{.Names}}' | grep -q "rabbitmq\|navratna.*rabbitmq"; then
  log_fail "RabbitMQ: still present (should be removed)"
else
  log_pass "RabbitMQ: removed"
fi

# Check MinIO is removed
if docker ps -a --format '{{.Names}}' | grep -q "minio\|navratna.*minio"; then
  log_fail "MinIO: still present (should be removed)"
else
  log_pass "MinIO: removed"
fi

# Check TEI is removed
if docker ps -a --format '{{.Names}}' | grep -q "tei-\|navratna.*tei"; then
  log_fail "TEI: still present (should be removed)"
else
  log_pass "TEI: removed"
fi

# -----------------------------------------------------------------------------
# Network Connectivity (if Tailscale available)
# -----------------------------------------------------------------------------

echo ""
echo "--- Network Connectivity ---"

if command -v tailscale &> /dev/null; then
  if tailscale status --json 2>/dev/null | jq -e '.Self.Online' > /dev/null 2>&1; then
    log_pass "Tailscale: connected"

    # Test cross-machine connectivity
    if ping -c 1 pc-a-navratna.tailnet > /dev/null 2>&1; then
      log_pass "Tailscale: pc-a reachable"
    else
      log_fail "Tailscale: pc-a unreachable"
    fi

    if ping -c 1 pc-b-navratna.tailnet > /dev/null 2>&1; then
      log_pass "Tailscale: pc-b reachable"
    else
      log_fail "Tailscale: pc-b unreachable"
    fi
  else
    log_fail "Tailscale: not connected"
  fi
else
  echo "⚠ Tailscale: not installed (skipping)"
fi

# -----------------------------------------------------------------------------
# Docker Version Check
# -----------------------------------------------------------------------------

echo ""
echo "--- Docker Version ---"

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0")
DOCKER_MAJOR=$(echo "$DOCKER_VERSION" | cut -d. -f1)
DOCKER_MINOR=$(echo "$DOCKER_VERSION" | cut -d. -f2)

if [ "$DOCKER_MAJOR" -ge 24 ]; then
  log_pass "Docker version: $DOCKER_VERSION (>= 24.0)"
else
  log_fail "Docker version: $DOCKER_VERSION (< 24.0 required)"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"

if [ $FAIL -eq 0 ]; then
  echo "Phase 0: READY ✓"
  exit 0
else
  echo "Phase 0: INCOMPLETE ✗"
  echo ""
  echo "Next steps:"
  echo "  1. Review failed checks above"
  echo "  2. Check service logs: docker compose logs <service-name>"
  echo "  3. Restart services: docker compose restart <service-name>"
  exit 1
fi
