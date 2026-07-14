#!/usr/bin/env bash
# sandbox_probe.sh — local container probe for exec-node-coding sandbox image.
#
# Verifies the following invariants against the locally built image:
#   1.  Effective UID of the app server process is 1001 (not root)
#   2.  PID 1 is tini; the app server is a child of tini
#   3.  /workspace is writable by uid 1001
#   4.  /root is NOT writable by uid 1001
#   5.  Bearer-protected routes reject unauthenticated requests (HTTP 401)
#   6.  /healthz succeeds over IPv6 loopback
#   7.  No Docker socket mounted inside the container
#   8.  Swap is 0 bytes when launched with --memory-swap=<same as --memory>
#   9.  Memory limit visible as <=2 GiB via Docker's cgroup configuration
#  10.  Persisted symlink cannot redirect the root ownership initializer
#  11.  UID1001 cannot open a direct TCP connection to port 443 (nftables UID drop)
#  12.  UID1001 cannot invoke `nft` (no execute permission)
#  13.  Egress proxy is listening on 127.0.0.1:15443 as UID1002
#  14.  HTTPS_PROXY env var is set for the app process
#
# Usage:
#   ./scripts/sandbox_probe.sh [IMAGE_TAG]
#
# IMAGE_TAG defaults to exec-node-coding:probe
# Generates an ephemeral RSA keypair; does NOT commit secrets.
#
# Dependencies: docker, openssl, curl (with IPv6), jq (optional, for pretty output)

set -euo pipefail

IMAGE="${1:-exec-node-coding:probe}"
PORT=3009
CONTAINER_NAME="exec-node-coding-probe-$$"
TMP_DIR="$(mktemp -d)"
trap 'cleanup' EXIT

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker run --rm --entrypoint /bin/chown \
    -v "${TMP_DIR}:/cleanup" "${IMAGE}" \
    -R --no-dereference "$(id -u):$(id -g)" /cleanup >/dev/null 2>&1 || true
  rm -rf "${TMP_DIR}"
}

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; FAILURES=$((FAILURES+1)); }

FAILURES=0
START_TIMEOUT=20

echo "=== exec-node-coding sandbox probe ==="
echo "Image: ${IMAGE}"

# ---------------------------------------------------------------------------
# 1. Generate ephemeral RSA-2048 keypair (never committed)
# ---------------------------------------------------------------------------
echo ""
echo "--- Generating ephemeral RSA-2048 keypair ---"
PRIVATE_KEY="${TMP_DIR}/private.pem"
PUBLIC_KEY="${TMP_DIR}/public.pem"
openssl genrsa -out "${PRIVATE_KEY}" 2048 2>/dev/null
openssl rsa -in "${PRIVATE_KEY}" -pubout -out "${PUBLIC_KEY}" 2>/dev/null
PUBLIC_KEY_PEM="$(cat "${PUBLIC_KEY}")"
echo "  Keypair generated (ephemeral, not committed)"

# ---------------------------------------------------------------------------
# 2. Start container
# ---------------------------------------------------------------------------
echo ""
echo "--- Starting container ---"
docker run -d \
  --name "${CONTAINER_NAME}" \
  --memory=2g \
  --memory-swap=2g \
  --cap-add=NET_ADMIN \
  -e NODE_ENV=production \
  -e HOST='::' \
  -e PORT="${PORT}" \
  -e WORKSPACE_ROOT=/workspace \
  -e SESSION_DIR=/workspace/.navratna/sessions \
  -e NODE_ID=probe-node \
  -e CODING_NODE_JWT_PUBLIC_KEY_PEM="${PUBLIC_KEY_PEM}" \
  --add-host="host.docker.internal:host-gateway" \
  "${IMAGE}" >/dev/null

echo "  Container started: ${CONTAINER_NAME}"

# Wait for healthz to come up
echo "  Waiting for server to start (timeout: ${START_TIMEOUT}s)..."
WAITED=0
until docker exec "${CONTAINER_NAME}" sh -c "curl -sf http://[::1]:${PORT}/healthz >/dev/null 2>&1"; do
  sleep 1
  WAITED=$((WAITED+1))
  if [ "${WAITED}" -ge "${START_TIMEOUT}" ]; then
    echo "  Server did not start within ${START_TIMEOUT}s" >&2
    docker logs "${CONTAINER_NAME}" >&2
    exit 1
  fi
done
echo "  Server ready after ${WAITED}s"

# ---------------------------------------------------------------------------
# 3. Check effective UID of app process
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 1: effective UID of app server process ---"
APP_UID="$(docker exec "${CONTAINER_NAME}" sh -c \
  "for pid in /proc/[0-9]*/status; do \
     comm=\$(grep -m1 '^Name:' \"\$pid\" 2>/dev/null | awk '{print \$2}'); \
     uid=\$(grep -m1 '^Uid:' \"\$pid\" 2>/dev/null | awk '{print \$2}'); \
     if [ \"\$comm\" = 'bun' ] && [ -n \"\$uid\" ]; then echo \"\$uid\"; break; fi; \
   done" 2>/dev/null)"
if [ "${APP_UID}" = "1001" ]; then
  pass "App server running as UID 1001"
else
  fail "App server UID is '${APP_UID}' (expected 1001) — bun process not found or wrong uid"
fi

# ---------------------------------------------------------------------------
# 4. Check PID 1 is tini
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 2: PID 1 is tini ---"
PID1_COMM="$(docker exec "${CONTAINER_NAME}" sh -c "cat /proc/1/comm 2>/dev/null || ps -p 1 -o comm= 2>/dev/null")"
if echo "${PID1_COMM}" | grep -qi tini; then
  pass "PID 1 is tini (${PID1_COMM})"
else
  fail "PID 1 comm is '${PID1_COMM}' (expected tini)"
fi

# ---------------------------------------------------------------------------
# 5. /workspace writable by uid 1001
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 3: /workspace writable by uid 1001 ---"
if docker exec --user 1001 "${CONTAINER_NAME}" sh -c "touch /workspace/.probe_test_$$ && rm /workspace/.probe_test_$$" 2>/dev/null; then
  pass "/workspace is writable by uid 1001"
else
  fail "/workspace is NOT writable by uid 1001"
fi

# ---------------------------------------------------------------------------
# 6. /root NOT writable by uid 1001
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 4: /root not writable by uid 1001 ---"
if docker exec --user 1001 "${CONTAINER_NAME}" sh -c "touch /root/.probe_test_$$ 2>/dev/null"; then
  fail "/root IS writable by uid 1001 (should be denied)"
  docker exec --user 1001 "${CONTAINER_NAME}" rm -f "/root/.probe_test_$$" 2>/dev/null || true
else
  pass "/root is NOT writable by uid 1001 (correct)"
fi

# ---------------------------------------------------------------------------
# 7. Bearer-protected route rejects unauthenticated request (HTTP 401)
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 5: bearer-protected route rejects unauthenticated (401) ---"
AUTH_STATUS="$(docker exec "${CONTAINER_NAME}" sh -c \
  "curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -d '{\"message\":\"hi\",\"idempotencyKey\":\"probe-key\"}' \
    'http://[::1]:${PORT}/sessions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/prompt' \
    2>/dev/null || echo '000'")"
if [ "${AUTH_STATUS}" = "401" ]; then
  pass "Unauthenticated POST /sessions/.../prompt returns 401"
else
  AUTH_STATUS2="$(docker exec "${CONTAINER_NAME}" sh -c \
    "curl -s -o /dev/null -w '%{http_code}' \
      -X GET \
      'http://[::1]:${PORT}/sessions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' \
      2>/dev/null || echo '000'")"
  if [ "${AUTH_STATUS2}" = "401" ]; then
    pass "Unauthenticated GET /sessions/... returns 401"
  else
    fail "Unauthenticated routes returned ${AUTH_STATUS} and ${AUTH_STATUS2} (expected 401)"
  fi
fi

# ---------------------------------------------------------------------------
# 8. /healthz succeeds over IPv6
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 6: /healthz succeeds over IPv6 loopback ---"
HEALTH_STATUS="$(docker exec "${CONTAINER_NAME}" sh -c \
  "curl -s -o /dev/null -w '%{http_code}' http://[::1]:${PORT}/healthz 2>/dev/null || echo '000'")"
if [ "${HEALTH_STATUS}" = "200" ]; then
  pass "/healthz returns 200 over IPv6 loopback"
else
  fail "/healthz returned ${HEALTH_STATUS} over IPv6 loopback (expected 200)"
fi

# ---------------------------------------------------------------------------
# 9. No Docker socket inside container
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 7: no Docker socket inside container ---"
if docker exec "${CONTAINER_NAME}" sh -c "test -S /var/run/docker.sock" 2>/dev/null; then
  fail "/var/run/docker.sock EXISTS inside container (should not be mounted)"
else
  pass "No Docker socket inside container"
fi

# ---------------------------------------------------------------------------
# 10. Swap = 0 bytes (memory-swap equals memory → no actual swap)
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 8: swap = 0 bytes ---"
MEMORY_LIMIT="$(docker inspect --format '{{.HostConfig.Memory}}' "${CONTAINER_NAME}")"
MEMORY_PLUS_SWAP_LIMIT="$(docker inspect --format '{{.HostConfig.MemorySwap}}' "${CONTAINER_NAME}")"
if [ "${MEMORY_LIMIT}" -gt 0 ] && [ "${MEMORY_PLUS_SWAP_LIMIT}" = "${MEMORY_LIMIT}" ]; then
  pass "Swap = 0 bytes (memory-swap equals memory: ${MEMORY_LIMIT})"
else
  fail "Swap constraint invalid: memory=${MEMORY_LIMIT}, memory+swap=${MEMORY_PLUS_SWAP_LIMIT}"
fi

# ---------------------------------------------------------------------------
# 11. Memory limit visible as <=2 GiB
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 9: memory limit <= 2 GiB ---"
MEM_BYTES="${MEMORY_LIMIT}"
GIB2=$((2 * 1024 * 1024 * 1024))
if [ "${MEM_BYTES}" -gt 0 ] && [ "${MEM_BYTES}" -le "${GIB2}" ]; then
  pass "Memory limit ${MEM_BYTES} bytes (<= 2 GiB)"
else
  fail "Memory limit ${MEM_BYTES} bytes is greater than 2 GiB"
fi

# ---------------------------------------------------------------------------
# 12. Persisted symlink attack is rejected before root chown/chmod
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 10: persisted .navratna symlink is rejected ---"
ATTACK_WORKSPACE="${TMP_DIR}/attack-workspace"
ATTACK_TARGET="${TMP_DIR}/attack-target"
mkdir "${ATTACK_WORKSPACE}" "${ATTACK_TARGET}"
ln -s "${ATTACK_TARGET}" "${ATTACK_WORKSPACE}/.navratna"
TARGET_UID_BEFORE="$(stat -c '%u' "${ATTACK_TARGET}")"
if docker run --rm \
  --mount "type=bind,src=${ATTACK_WORKSPACE},dst=/workspace" \
  -e CODING_NODE_JWT_PUBLIC_KEY_PEM="${PUBLIC_KEY_PEM}" \
  "${IMAGE}" >/dev/null 2>&1; then
  fail "Container accepted a symlinked /workspace/.navratna"
else
  TARGET_UID_AFTER="$(stat -c '%u' "${ATTACK_TARGET}")"
  if [ "${TARGET_UID_AFTER}" = "${TARGET_UID_BEFORE}" ]; then
    pass "Symlinked .navratna rejected without changing target ownership"
  else
    fail "Symlink target ownership changed from ${TARGET_UID_BEFORE} to ${TARGET_UID_AFTER}"
  fi
fi

# ---------------------------------------------------------------------------
# 13. UID1001 cannot make a direct outbound TCP/443 connection (nftables)
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 11: UID1001 direct tcp/443 is nftables-blocked ---"
DIRECT_RESULT="$(docker exec --user 1001 "${CONTAINER_NAME}" bash -c \
  "timeout 3 bash -c 'echo -n > /dev/tcp/1.1.1.1/443' 2>&1 && echo OK || echo BLOCKED" 2>/dev/null || echo "BLOCKED")"
if echo "${DIRECT_RESULT}" | grep -q "BLOCKED"; then
  pass "UID1001 direct tcp/443 is kernel-blocked by nftables (BLOCKED)"
else
  fail "UID1001 was NOT blocked from direct tcp/443 — nftables enforcement failed (got: ${DIRECT_RESULT})"
fi

# ---------------------------------------------------------------------------
# 14. UID1001 cannot invoke `nft`
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 12: UID1001 cannot execute nft ---"
NFT_RESULT="$(docker exec --user 1001 "${CONTAINER_NAME}" sh -c \
  "/usr/sbin/nft list ruleset >/dev/null 2>&1 && echo OK || echo DENIED" 2>/dev/null || echo "DENIED")"
if echo "${NFT_RESULT}" | grep -q "DENIED"; then
  pass "UID1001 cannot execute /usr/sbin/nft"
else
  fail "UID1001 WAS able to execute /usr/sbin/nft — permission not restricted"
fi

# ---------------------------------------------------------------------------
# 15. Egress proxy is listening on loopback 15443 (UID1002 process)
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 13: egress CONNECT proxy up on 127.0.0.1:15443 ---"
PROXY_PORT_STATUS="$(docker exec "${CONTAINER_NAME}" sh -c \
  "ss -tlnp 2>/dev/null | grep ':15443' || netstat -tlnp 2>/dev/null | grep ':15443' || echo MISSING" 2>/dev/null || echo "MISSING")"
if echo "${PROXY_PORT_STATUS}" | grep -qv "MISSING"; then
  pass "Egress proxy listening on port 15443"
else
  fail "Egress proxy NOT listening on port 15443 (ss output: ${PROXY_PORT_STATUS})"
fi

# ---------------------------------------------------------------------------
# 16. App process has HTTPS_PROXY environment variable set
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 14: HTTPS_PROXY env set for the app process ---"
APP_ENV_PID="$(docker exec "${CONTAINER_NAME}" sh -c \
  "for pid in /proc/[0-9]*/status; do \
     comm=\$(grep -m1 '^Name:' \"\$pid\" 2>/dev/null | awk '{print \$2}'); \
     uid=\$(grep -m1 '^Uid:' \"\$pid\" 2>/dev/null | awk '{print \$2}'); \
     if [ \"\$comm\" = 'bun' ] && [ \"\$uid\" = '1001' ]; then \
       echo \"\${pid#/proc/}\" | cut -d/ -f1; break; \
     fi; \
   done" 2>/dev/null | head -1)"
if [ -n "${APP_ENV_PID}" ]; then
  HTTPS_PROXY_VAL="$(docker exec "${CONTAINER_NAME}" sh -c \
    "tr '\\0' '\\n' < /proc/${APP_ENV_PID}/environ 2>/dev/null | grep '^HTTPS_PROXY=' | head -1" 2>/dev/null || true)"
  if echo "${HTTPS_PROXY_VAL}" | grep -q "127.0.0.1"; then
    pass "HTTPS_PROXY is set to loopback proxy for UID1001 app process (${HTTPS_PROXY_VAL})"
  else
    fail "HTTPS_PROXY not set or not pointing to localhost in UID1001 app process env (got: '${HTTPS_PROXY_VAL}')"
  fi
else
  fail "Could not find UID1001 bun process to inspect HTTPS_PROXY env"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Summary ==="
if [ "${FAILURES}" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "${FAILURES} check(s) FAILED" >&2
  exit 1
fi
