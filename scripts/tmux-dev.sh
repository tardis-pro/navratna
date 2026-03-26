#!/usr/bin/env bash
# Navratna dev tmux workspace manager
# Usage:
#   ./tmux-dev.sh          → start all sessions
#   ./tmux-dev.sh kill     → kill all navratna sessions
#   ./tmux-dev.sh attach   → attach to root session (default entry point)
#   ./tmux-dev.sh dup <session> <new-name>  → duplicate a session
#   ./tmux-dev.sh ls       → list all navratna sessions
#   ./tmux-dev.sh go <session>              → switch to session (from inside tmux)

ROOT=/home/pronit/workspace/tardis/bmad-navratna/navratna

SESSIONS=(
  "nav-root:$ROOT"
  "nav-frontend:$ROOT/apps/frontend"
  "nav-backend:$ROOT/apps/backend"
  "nav-shared:$ROOT/apps/shared"
  "nav-packages:$ROOT/apps/packages"
)

# Services get their own windows inside nav-backend
BACKEND_SERVICES=(
  agent-intelligence
  artifact-service
  basebench-meta
  capability-registry
  discussion-orchestration
  llm-service
  marketplace-service
  navratna-core
  navratna-gateway
  orchestration-pipeline
  questionforge
  security-gateway
)

start_sessions() {
  for entry in "${SESSIONS[@]}"; do
    name="${entry%%:*}"
    dir="${entry##*:}"

    if tmux has-session -t "$name" 2>/dev/null; then
      echo "Session $name already exists, skipping."
      continue
    fi

    tmux new-session -d -s "$name" -c "$dir" -x 220 -y 50
    echo "Created session: $name → $dir"
  done

  # Add per-service windows to nav-backend
  if tmux has-session -t "nav-backend" 2>/dev/null; then
    for svc in "${BACKEND_SERVICES[@]}"; do
      svc_dir="$ROOT/apps/backend/services/$svc"
      if [ -d "$svc_dir" ]; then
        # Window name capped at 12 chars for readability
        win="${svc:0:12}"
        tmux new-window -t "nav-backend" -n "$win" -c "$svc_dir" 2>/dev/null || true
      fi
    done
    echo "Added service windows to nav-backend"
  fi

  echo ""
  echo "All sessions ready. Teleport shortcuts:"
  echo "  tmux switch-client -t nav-root"
  echo "  tmux switch-client -t nav-frontend"
  echo "  tmux switch-client -t nav-backend"
  echo "  tmux switch-client -t nav-shared"
  echo "  tmux switch-client -t nav-packages"
  echo ""
  echo "Or run: ./tmux-dev.sh attach"
}

kill_sessions() {
  for entry in "${SESSIONS[@]}"; do
    name="${entry%%:*}"
    tmux kill-session -t "$name" 2>/dev/null && echo "Killed: $name"
  done
}

dup_session() {
  local src="$1"
  local dst="$2"
  if [ -z "$src" ] || [ -z "$dst" ]; then
    echo "Usage: $0 dup <source-session> <new-session-name>"
    exit 1
  fi
  if ! tmux has-session -t "$src" 2>/dev/null; then
    echo "Source session '$src' not found."
    exit 1
  fi
  src_dir=$(tmux display-message -p -t "$src" '#{pane_current_path}')
  tmux new-session -d -s "$dst" -c "$src_dir" -x 220 -y 50
  echo "Duplicated '$src' → '$dst' (starting in $src_dir)"
}

list_sessions() {
  tmux ls 2>/dev/null | grep "nav-" || echo "No navratna sessions running."
}

go_session() {
  local target="$1"
  if [ -z "$target" ]; then
    echo "Usage: $0 go <session-name>"
    exit 1
  fi
  if [ -z "$TMUX" ]; then
    tmux attach -t "$target"
  else
    tmux switch-client -t "$target"
  fi
}

case "${1:-start}" in
  start)   start_sessions ;;
  kill)    kill_sessions ;;
  attach)  tmux attach -t "nav-root" 2>/dev/null || (start_sessions && tmux attach -t "nav-root") ;;
  dup)     dup_session "$2" "$3" ;;
  ls)      list_sessions ;;
  go)      go_session "$2" ;;
  *)       echo "Unknown command: $1"; exit 1 ;;
esac
