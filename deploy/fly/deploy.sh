#!/bin/bash
# =============================================================================
# Navratna - Fly.io Deployment Script
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# All backend services
SERVICES=(
  "agent-intelligence:3001"
  "orchestration-pipeline:3002"
  "capability-registry:3003"
  "security-gateway:3004"
  "discussion-orchestration:3005"
  "artifact-service:3006"
  "llm-service:3007"
)

# Parse arguments
COMMAND="${1:-help}"
SERVICE="${2:-all}"
REGION="${FLY_REGION:-iad}"

usage() {
  echo -e "${BLUE}Navratna Fly.io Deployment${NC}"
  echo ""
  echo "Usage: $0 <command> [service]"
  echo ""
  echo "Commands:"
  echo "  setup       - Create Fly apps for all services"
  echo "  deploy      - Deploy service(s) to Fly"
  echo "  secrets     - Set secrets for service(s)"
  echo "  logs        - View logs for a service"
  echo "  status      - Check status of all services"
  echo "  scale       - Scale a service"
  echo "  destroy     - Destroy a service (careful!)"
  echo ""
  echo "Services: all, agent-intelligence, security-gateway, etc."
  echo ""
  echo "Examples:"
  echo "  $0 setup                    # Create all apps"
  echo "  $0 deploy all               # Deploy all services"
  echo "  $0 deploy security-gateway  # Deploy one service"
  echo "  $0 secrets all              # Set secrets for all"
  echo "  $0 logs agent-intelligence  # View logs"
}

check_flyctl() {
  if ! command -v fly &> /dev/null; then
    echo -e "${YELLOW}Installing flyctl...${NC}"
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
  fi

  if ! fly auth whoami &> /dev/null; then
    echo -e "${YELLOW}Please log in to Fly.io:${NC}"
    fly auth login
  fi
}

get_app_name() {
  local service="$1"
  echo "navratna-${service}"
}

# =============================================================================
# Setup: Create Fly apps
# =============================================================================
setup_service() {
  local service="$1"
  local port="$2"
  local app_name=$(get_app_name "$service")

  echo -e "${BLUE}Setting up ${app_name}...${NC}"

  # Check if app exists
  if fly apps list | grep -q "$app_name"; then
    echo -e "${GREEN}App ${app_name} already exists${NC}"
    return 0
  fi

  # Create app
  fly apps create "$app_name" --org personal || {
    echo -e "${YELLOW}App may already exist, continuing...${NC}"
  }

  echo -e "${GREEN}Created ${app_name}${NC}"
}

setup_all() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Setting up Fly.io apps${NC}"
  echo -e "${BLUE}========================================${NC}"

  for service_port in "${SERVICES[@]}"; do
    IFS=':' read -r service port <<< "$service_port"
    setup_service "$service" "$port"
  done

  echo -e "\n${GREEN}All apps created!${NC}"
  echo -e "${YELLOW}Next: Run '$0 secrets all' to set environment variables${NC}"
}

# =============================================================================
# Deploy: Build and deploy services
# =============================================================================
deploy_service() {
  local service="$1"
  local port="$2"
  local app_name=$(get_app_name "$service")

  echo -e "${BLUE}Deploying ${app_name}...${NC}"

  cd "$ROOT_DIR"

  # Deploy with build args
  fly deploy \
    --app "$app_name" \
    --dockerfile deploy/fly/Dockerfile.fly.service \
    --build-arg SERVICE_NAME="$service" \
    --build-arg SERVICE_PORT="$port" \
    --region "$REGION" \
    --ha=false \
    --vm-memory 512 \
    --vm-cpus 1

  echo -e "${GREEN}Deployed ${app_name}${NC}"
}

deploy_all() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Deploying all services to Fly.io${NC}"
  echo -e "${BLUE}========================================${NC}"

  for service_port in "${SERVICES[@]}"; do
    IFS=':' read -r service port <<< "$service_port"
    deploy_service "$service" "$port"
  done

  echo -e "\n${GREEN}All services deployed!${NC}"
}

# =============================================================================
# Secrets: Set environment variables
# =============================================================================
set_secrets() {
  local app_name="$1"

  echo -e "${BLUE}Setting secrets for ${app_name}...${NC}"

  # Check for .env.fly file
  local env_file="$SCRIPT_DIR/.env.fly"
  if [ ! -f "$env_file" ]; then
    echo -e "${YELLOW}No .env.fly found. Creating template...${NC}"
    cat > "$env_file" << 'EOF'
# =============================================================================
# Fly.io Secrets - Copy and fill in values
# =============================================================================

# PostgreSQL (Neon)
POSTGRES_URL=postgresql://user:pass@ep-xxx.neon.tech/navratna?sslmode=require

# Neo4j (Aura)
NEO4J_URL=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@us1-xxx.upstash.io:6379

# RabbitMQ (CloudAMQP)
RABBITMQ_URL=amqps://user:pass@puffin.rmq2.cloudamqp.com/vhost

# Qdrant (Cloud)
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=

# Storage (R2)
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=navratna-storage-prod

# Application
JWT_SECRET=generate-a-long-random-string
FRONTEND_URL=https://navratna.pages.dev
CORS_ORIGINS=https://navratna.pages.dev,https://navratna.app

# LLM (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
EOF
    echo -e "${YELLOW}Edit ${env_file} and run this command again${NC}"
    return 1
  fi

  # Read secrets from file and set them
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    # Skip if value is empty or placeholder
    [[ -z "$value" ]] && continue
    [[ "$value" == *"xxx"* ]] && continue

    echo "  Setting $key..."
    fly secrets set "$key=$value" --app "$app_name" --stage
  done < "$env_file"

  # Deploy staged secrets
  fly secrets deploy --app "$app_name"
  echo -e "${GREEN}Secrets set for ${app_name}${NC}"
}

secrets_all() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Setting secrets for all services${NC}"
  echo -e "${BLUE}========================================${NC}"

  for service_port in "${SERVICES[@]}"; do
    IFS=':' read -r service port <<< "$service_port"
    set_secrets "$(get_app_name "$service")"
  done
}

# =============================================================================
# Status: Check all services
# =============================================================================
status_all() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Fly.io Services Status${NC}"
  echo -e "${BLUE}========================================${NC}"

  printf "%-30s %-15s %-20s\n" "SERVICE" "STATUS" "URL"
  printf "%-30s %-15s %-20s\n" "-------" "------" "---"

  for service_port in "${SERVICES[@]}"; do
    IFS=':' read -r service port <<< "$service_port"
    local app_name=$(get_app_name "$service")

    local status=$(fly status --app "$app_name" 2>/dev/null | grep -E "^app\s+" | awk '{print $2}' || echo "not found")
    local url="https://${app_name}.fly.dev"

    printf "%-30s %-15s %-20s\n" "$app_name" "$status" "$url"
  done
}

# =============================================================================
# Logs: View service logs
# =============================================================================
view_logs() {
  local service="$1"
  local app_name=$(get_app_name "$service")

  echo -e "${BLUE}Logs for ${app_name}${NC}"
  fly logs --app "$app_name"
}

# =============================================================================
# Scale: Adjust resources
# =============================================================================
scale_service() {
  local service="$1"
  local app_name=$(get_app_name "$service")

  echo -e "${BLUE}Current scale for ${app_name}:${NC}"
  fly scale show --app "$app_name"

  echo ""
  echo "To scale, run:"
  echo "  fly scale count 2 --app $app_name     # 2 instances"
  echo "  fly scale memory 1024 --app $app_name # 1GB RAM"
  echo "  fly scale vm shared-cpu-2x --app $app_name"
}

# =============================================================================
# Main
# =============================================================================
check_flyctl

case "$COMMAND" in
  setup)
    if [ "$SERVICE" = "all" ]; then
      setup_all
    else
      for service_port in "${SERVICES[@]}"; do
        IFS=':' read -r s p <<< "$service_port"
        if [ "$s" = "$SERVICE" ]; then
          setup_service "$s" "$p"
          exit 0
        fi
      done
      echo -e "${RED}Unknown service: $SERVICE${NC}"
      exit 1
    fi
    ;;

  deploy)
    if [ "$SERVICE" = "all" ]; then
      deploy_all
    else
      for service_port in "${SERVICES[@]}"; do
        IFS=':' read -r s p <<< "$service_port"
        if [ "$s" = "$SERVICE" ]; then
          deploy_service "$s" "$p"
          exit 0
        fi
      done
      echo -e "${RED}Unknown service: $SERVICE${NC}"
      exit 1
    fi
    ;;

  secrets)
    if [ "$SERVICE" = "all" ]; then
      secrets_all
    else
      set_secrets "$(get_app_name "$SERVICE")"
    fi
    ;;

  status)
    status_all
    ;;

  logs)
    if [ "$SERVICE" = "all" ]; then
      echo "Specify a service to view logs"
      exit 1
    fi
    view_logs "$SERVICE"
    ;;

  scale)
    if [ "$SERVICE" = "all" ]; then
      echo "Specify a service to scale"
      exit 1
    fi
    scale_service "$SERVICE"
    ;;

  *)
    usage
    ;;
esac
