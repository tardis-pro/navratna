#!/usr/bin/env bash
# exec-node-mcp — one-shot BYO-node bootstrap for a fresh EC2 / VM.
#
# Registers this machine as a Navratna execution node. Copy the command from the
# "Add a node" panel, or run:
#
#   curl -fsSL https://YOUR-NAVRATNA-HOST/api/v1/mesh/nodes/bootstrap.sh \
#     | NAVRATNA_API_URL=https://YOUR-NAVRATNA-HOST NAVRATNA_NODE_TOKEN=<token> bash
#
# It installs Docker if missing, then runs the node-agent container which
# self-detects its runtimes (python3, bash, sqlite3, ...) and enrolls.
set -euo pipefail

: "${NAVRATNA_API_URL:?NAVRATNA_API_URL is required}"
: "${NAVRATNA_NODE_TOKEN:?NAVRATNA_NODE_TOKEN is required}"

IMAGE="${NAVRATNA_EXEC_NODE_IMAGE:-uaip/exec-node-mcp:latest}"
CONTAINER_NAME="${NAVRATNA_NODE_NAME:-navratna-exec-node}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] Docker not found — installing via get.docker.com ..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$(whoami)" || true
fi

echo "[bootstrap] Pulling ${IMAGE} ..."
docker pull "${IMAGE}" || echo "[bootstrap] pull failed; assuming image is local"

echo "[bootstrap] Removing any previous ${CONTAINER_NAME} ..."
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

echo "[bootstrap] Starting node-agent ..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e NAVRATNA_API_URL="${NAVRATNA_API_URL}" \
  -e NAVRATNA_NODE_TOKEN="${NAVRATNA_NODE_TOKEN}" \
  "${IMAGE}"

echo "[bootstrap] Done. Your node should appear as 'online' in the Add-a-node panel shortly."
echo "[bootstrap] Logs: docker logs -f ${CONTAINER_NAME}"
