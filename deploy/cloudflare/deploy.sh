#!/bin/bash
# =============================================================================
# Navratna - Cloudflare Deployment Script
# =============================================================================
# This script deploys Navratna infrastructure to Cloudflare:
# - Frontend to Cloudflare Pages
# - API Gateway Worker
# - R2 Storage buckets
# - KV Namespaces
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default environment
ENV="${1:-staging}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Navratna Cloudflare Deployment${NC}"
echo -e "${BLUE}Environment: ${ENV}${NC}"
echo -e "${BLUE}========================================${NC}"

# Validate environment
if [[ ! "$ENV" =~ ^(development|staging|production)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Use: development, staging, or production${NC}"
    exit 1
fi

# Check for wrangler
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Installing wrangler...${NC}"
    npm install -g wrangler
fi

# Check if logged in to Cloudflare
echo -e "${BLUE}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Please log in to Cloudflare:${NC}"
    wrangler login
fi

# =============================================================================
# Step 1: Create R2 Buckets (if not exists)
# =============================================================================
echo -e "\n${BLUE}Step 1: Setting up R2 Storage Buckets${NC}"

create_r2_bucket() {
    local bucket_name="$1"
    echo -e "${YELLOW}Creating R2 bucket: ${bucket_name}${NC}"

    if wrangler r2 bucket list | grep -q "$bucket_name"; then
        echo -e "${GREEN}Bucket ${bucket_name} already exists${NC}"
    else
        wrangler r2 bucket create "$bucket_name" || {
            echo -e "${RED}Failed to create bucket ${bucket_name}${NC}"
            return 1
        }
        echo -e "${GREEN}Created bucket: ${bucket_name}${NC}"
    fi
}

case "$ENV" in
    development)
        create_r2_bucket "navratna-storage-dev"
        ;;
    staging)
        create_r2_bucket "navratna-storage-staging"
        ;;
    production)
        create_r2_bucket "navratna-storage-prod"
        ;;
esac

# =============================================================================
# Step 2: Create KV Namespaces
# =============================================================================
echo -e "\n${BLUE}Step 2: Setting up KV Namespaces${NC}"

create_kv_namespace() {
    local ns_name="$1"
    local env_suffix="$2"
    local full_name="${ns_name}_${env_suffix}"

    echo -e "${YELLOW}Creating KV namespace: ${full_name}${NC}"

    # Try to create and capture the ID
    local result
    result=$(wrangler kv:namespace create "$ns_name" --env "$env_suffix" 2>&1) || true

    if echo "$result" | grep -q "already exists"; then
        echo -e "${GREEN}Namespace ${full_name} already exists${NC}"
    elif echo "$result" | grep -q "id = "; then
        local kv_id=$(echo "$result" | grep "id = " | awk -F'"' '{print $2}')
        echo -e "${GREEN}Created namespace with ID: ${kv_id}${NC}"
        echo -e "${YELLOW}Update wrangler.toml with: id = \"${kv_id}\"${NC}"
    else
        echo -e "${YELLOW}Result: ${result}${NC}"
    fi
}

cd "$SCRIPT_DIR"

case "$ENV" in
    development)
        create_kv_namespace "CACHE" "development"
        ;;
    staging)
        create_kv_namespace "CACHE" "staging"
        ;;
    production)
        create_kv_namespace "CACHE" "production"
        ;;
esac

# =============================================================================
# Step 3: Install Worker Dependencies
# =============================================================================
echo -e "\n${BLUE}Step 3: Installing Worker dependencies${NC}"
cd "$SCRIPT_DIR"

if [ -f "package.json" ]; then
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
fi

# =============================================================================
# Step 4: Deploy Worker
# =============================================================================
echo -e "\n${BLUE}Step 4: Deploying API Gateway Worker${NC}"

deploy_worker() {
    local env="$1"
    echo -e "${YELLOW}Deploying worker to ${env}...${NC}"

    if [ "$env" = "development" ]; then
        echo -e "${YELLOW}Skipping worker deployment for development (use 'wrangler dev' for local testing)${NC}"
        return 0
    fi

    wrangler deploy --env "$env" || {
        echo -e "${RED}Worker deployment failed${NC}"
        return 1
    }
    echo -e "${GREEN}Worker deployed successfully to ${env}${NC}"
}

deploy_worker "$ENV"

# =============================================================================
# Step 5: Deploy Frontend to Cloudflare Pages
# =============================================================================
echo -e "\n${BLUE}Step 5: Building and Deploying Frontend${NC}"

deploy_frontend() {
    local env="$1"

    cd "$ROOT_DIR"

    echo -e "${YELLOW}Building frontend...${NC}"

    # Set environment-specific variables
    case "$env" in
        staging)
            export VITE_API_URL="https://api-staging.navratna.app"
            ;;
        production)
            export VITE_API_URL="https://api.navratna.app"
            ;;
        *)
            export VITE_API_URL="http://localhost:8081"
            ;;
    esac

    # Build frontend
    pnpm run build:frontend || {
        echo -e "${RED}Frontend build failed${NC}"
        return 1
    }

    echo -e "${YELLOW}Deploying to Cloudflare Pages...${NC}"

    # Deploy to Cloudflare Pages
    local project_name="navratna"
    local branch=""

    case "$env" in
        staging)
            branch="staging"
            ;;
        production)
            branch="main"
            ;;
        *)
            echo -e "${YELLOW}Skipping Pages deployment for development${NC}"
            return 0
            ;;
    esac

    # Use wrangler pages deploy
    wrangler pages deploy apps/frontend/dist \
        --project-name="$project_name" \
        --branch="$branch" \
        --commit-dirty=true || {
            echo -e "${YELLOW}Note: Run 'wrangler pages project create ${project_name}' if project doesn't exist${NC}"
            return 1
        }

    echo -e "${GREEN}Frontend deployed successfully${NC}"
}

deploy_frontend "$ENV"

# =============================================================================
# Step 6: Set Secrets (interactive)
# =============================================================================
echo -e "\n${BLUE}Step 6: Configure Secrets${NC}"

configure_secrets() {
    local env="$1"

    echo -e "${YELLOW}Do you want to configure secrets? (y/n)${NC}"
    read -r answer

    if [ "$answer" = "y" ]; then
        echo -e "${YELLOW}Setting JWT_SECRET...${NC}"
        echo "Enter JWT_SECRET (or press Enter to skip):"
        read -rs jwt_secret
        if [ -n "$jwt_secret" ]; then
            echo "$jwt_secret" | wrangler secret put JWT_SECRET --env "$env"
        fi

        echo -e "${YELLOW}Setting API_KEY...${NC}"
        echo "Enter API_KEY (or press Enter to skip):"
        read -rs api_key
        if [ -n "$api_key" ]; then
            echo "$api_key" | wrangler secret put API_KEY --env "$env"
        fi

        echo -e "${GREEN}Secrets configured${NC}"
    else
        echo -e "${YELLOW}Skipping secrets configuration${NC}"
    fi
}

if [ "$ENV" != "development" ]; then
    configure_secrets "$ENV"
fi

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\n${BLUE}Deployed Components:${NC}"
echo -e "  - R2 Storage Bucket: navratna-storage-${ENV/production/prod}"
echo -e "  - KV Namespace: CACHE"
echo -e "  - API Gateway Worker: navratna-api-gateway${ENV:+-}${ENV}"
echo -e "  - Frontend: Cloudflare Pages (navratna)"

echo -e "\n${BLUE}URLs:${NC}"
case "$ENV" in
    staging)
        echo -e "  - Frontend: https://staging.navratna.app"
        echo -e "  - API Gateway: https://api-staging.navratna.app"
        ;;
    production)
        echo -e "  - Frontend: https://navratna.app"
        echo -e "  - API Gateway: https://api.navratna.app"
        ;;
    *)
        echo -e "  - Frontend: http://localhost:5173"
        echo -e "  - Worker Dev: wrangler dev"
        ;;
esac

echo -e "\n${BLUE}Next Steps:${NC}"
echo -e "  1. Configure DNS records in Cloudflare dashboard"
echo -e "  2. Set up SSL certificates (automatic with Cloudflare)"
echo -e "  3. Configure backend service URL in wrangler.toml"
echo -e "  4. Set up monitoring and alerts"

echo -e "\n${YELLOW}Note: Backend services (PostgreSQL, Neo4j, Redis, etc.) must be deployed separately${NC}"
echo -e "${YELLOW}See: deploy/infrastructure/README.md for backend deployment options${NC}"
