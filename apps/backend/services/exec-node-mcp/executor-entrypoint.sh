#!/usr/bin/env bash
# Boot-time workspace hydration for an OpenClaw executor node.
#
# Three kinds of state, three mechanisms (see the workspaces design):
#   - config/identity → git (versioned; capability-evolver commits back)
#   - work product    → R2 via rclone (durable; the workflow's own last step pushes back)
#   - DB state        → NOT here; a PocketBase/Postgres service the workflows curl
#
# All optional and env-driven: with nothing set, this is a no-op and the node just boots.
#
#   OPENCLAW_CONFIG_REPO   git URL for SOUL.md/TOOLS.md/skills  → cloned/pulled to /opt/openclaw
#   OPENCLAW_AGENT         agent name, selects the R2 prefix     (e.g. "growth")
#   R2_REMOTE              rclone remote name (rclone.conf mounted at /root/.config/rclone)
#   R2_BUCKET              bucket holding per-agent work product  (e.g. "openclaw-workspaces")
set -euo pipefail

CONFIG_DIR="${OPENCLAW_CONFIG:-/opt/openclaw/config}"
WORKSPACE="${WORKSPACE:-/workspace}"

# 1. Config/identity — git pull (versioned so the weekly capability-evolver has history).
if [[ -n "${OPENCLAW_CONFIG_REPO:-}" ]]; then
  if [[ -d "$CONFIG_DIR/.git" ]]; then
    git -C "$CONFIG_DIR" pull --ff-only || echo "config pull failed (using cached)"
  else
    git clone --depth 1 "$OPENCLAW_CONFIG_REPO" "$CONFIG_DIR" || echo "config clone failed"
  fi
fi

# 2. Work product — pull this agent's slice from R2 into local disk (POSIX-correct writes;
#    the workflow's final R2 step pushes it back). Agent-affinity keeps a single writer.
if [[ -n "${R2_REMOTE:-}" && -n "${R2_BUCKET:-}" && -n "${OPENCLAW_AGENT:-}" ]]; then
  mkdir -p "$WORKSPACE"
  rclone sync "${R2_REMOTE}:${R2_BUCKET}/${OPENCLAW_AGENT}" "$WORKSPACE" \
    || echo "workspace pull failed (starting empty)"
fi

exec "$@"
