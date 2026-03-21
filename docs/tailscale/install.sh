#!/bin/bash
# Navratna Tailscale Installation Script
# Usage: ./install.sh [pc-a|pc-b|mac]

set -e

MACHINE="${1:-pc-a}"
TAILSCALE_AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"

echo "Installing Tailscale on $MACHINE..."

# Detect OS and install Tailscale
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  brew install tailscale
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

# Configure hostname based on machine role
case "$MACHINE" in
  pc-a)
    HOSTNAME="pc-a-navratna"
    ;;
  pc-b)
    HOSTNAME="pc-b-navratna"
    ;;
  mac)
    HOSTNAME="mac-navratna"
    ;;
  *)
    echo "Unknown machine: $MACHINE"
    echo "Usage: $0 [pc-a|pc-b|mac]"
    exit 1
    ;;
esac

# Start Tailscale
if [ -n "$TAILSCALE_AUTH_KEY" ]; then
  sudo tailscale up --hostname="$HOSTNAME" --authkey="$TAILSCALE_AUTH_KEY" --accept-routes --accept-dns
else
  sudo tailscale up --hostname="$HOSTNAME" --accept-routes --accept-dns
  echo ""
  echo "IMPORTANT: Approve this machine in the Tailscale admin console:"
  echo "  https://login.tailscale.com/admin/machines"
fi

echo ""
echo "Machine: $HOSTNAME.tailnet"
echo ""
echo "Services available on $MACHINE:"
case "$MACHINE" in
  pc-a)
    echo "  - PostgreSQL: pc-a-navratna.tailnet:5432"
    echo "  - Neo4j: pc-a-navratna.tailnet:7687"
    echo "  - Qdrant: pc-a-navratna.tailnet:6333"
    echo "  - Redis: pc-a-navratna.tailnet:6379"
    echo "  - Ollama: pc-a-navratna.tailnet:11434"
    echo "  - Navratna Core: pc-a-navratna.tailnet:3001"
    ;;
  pc-b)
    echo "  - Navratna Gateway: pc-b-navratna.tailnet:3002"
    echo "  - Nginx: pc-b-navratna.tailnet:8081"
    ;;
  mac)
    echo "  - Telescope: mac-navratna.tailnet:5173"
    ;;
esac
