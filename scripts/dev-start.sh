#!/bin/bash

# Navratna - Enhanced Development Environment Manager
# Supports hot reloading, daemon mode, and selective service management

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# Service groups
INFRASTRUCTURE_SERVICES="postgres neo4j redis qdrant"
BACKEND_SERVICES="agent-intelligence orchestration-pipeline capability-registry security-gateway discussion-orchestration artifact-service llm-service"
FRONTEND_SERVICES="frontend"
MONITORING_SERVICES="prometheus grafana"
GATEWAY_SERVICES="api-gateway"
TEI_GPU_SERVICES="tei-embeddings tei-reranker"
TEI_CPU_SERVICES="tei-embeddings-cpu"

ALL_SERVICES="$INFRASTRUCTURE_SERVICES $BACKEND_SERVICES $FRONTEND_SERVICES $MONITORING_SERVICES $GATEWAY_SERVICES"

# Default values
MODE="interactive"
ACTION="start"
SERVICES="all"
REBUILD_BACKEND=false
FORCE_RECREATE=false
FOLLOW_LOGS=""
GPU_AVAILABLE=""
CPU_ONLY=false
CLEAN_BUILD=false

# Utility functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "${PURPLE}🚀 $1${NC}"
    echo "=================================================="
}

# Check GPU availability
check_gpu_availability() {
    if [ "$CPU_ONLY" = true ]; then
        GPU_AVAILABLE=false
        log_info "CPU-only mode requested, skipping GPU detection"
        return
    fi
    
    log_info "Detecting GPU availability..."
    
    # Check if nvidia-docker runtime is available
    if docker info 2>/dev/null | grep -q "nvidia"; then
        log_info "  ✓ NVIDIA Docker runtime detected"
        GPU_AVAILABLE=true
    elif command -v nvidia-smi > /dev/null 2>&1; then
        # Check if nvidia-smi works and shows GPUs
        if nvidia-smi > /dev/null 2>&1; then
            log_info "  ✓ NVIDIA GPU detected via nvidia-smi"
            GPU_AVAILABLE=true
        else
            log_warning "  ⚠️ nvidia-smi found but no GPUs detected"
            GPU_AVAILABLE=false
        fi
    else
        log_info "  ℹ️ No NVIDIA GPU detected"
        GPU_AVAILABLE=false
    fi
    
    if [ "$GPU_AVAILABLE" = true ]; then
        log_success "GPU services will be used (default)"
    else
        log_info "Falling back to CPU services"
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose > /dev/null 2>&1; then
        log_error "docker-compose is not installed. Please install docker-compose first."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Validate environment variables with security checks
validate_environment() {
    log_info "Validating environment configuration..."
    
    # Source the .env file if it exists
    if [ -f "$ENV_FILE" ]; then
        set -a  # Export all variables
        source "$ENV_FILE"
        set +a  # Stop exporting
    fi
    
    # Check for placeholder API keys - SECURITY CONCERN
    if [ "${OPENAI_API_KEY:-}" = "your-openai-key-here" ]; then
        log_warning "OPENAI_API_KEY is still set to placeholder value"
        log_info "  → AI services will not function without valid API key"
    fi
    
    if [ "${ANTHROPIC_API_KEY:-}" = "your-anthropic-key-here" ]; then
        log_warning "ANTHROPIC_API_KEY is still set to placeholder value"
        log_info "  → Claude integration will not function"
    fi
    
    # Validate critical environment variables
    local required_vars=(
        "POSTGRES_DB"
        "POSTGRES_USER" 
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        log_info "Please check your .env file or set these variables manually"
        exit 1
    fi
    
    # SECURITY: Validate JWT_SECRET strength
    local jwt_secret="${JWT_SECRET:-}"
    if [ -z "$jwt_secret" ]; then
        log_error "JWT_SECRET is not set"
        log_info "Generate a secure secret: openssl rand -base64 32"
        exit 1
    fi
    
    if [ ${#jwt_secret} -lt 32 ]; then
        log_error "JWT_SECRET is too short (minimum 32 characters)"
        log_info "Current length: ${#jwt_secret} characters"
        log_info "Generate a secure secret: openssl rand -base64 32"
        exit 1
    fi
    
    # SECURITY: Warn if using default dev secrets in non-dev environment
    if [ "${NODE_ENV:-development}" != "development" ]; then
        if [[ "$jwt_secret" == *"dev"* ]] || [[ "$jwt_secret" == *"secret"* ]] || [[ "$jwt_secret" == *"password"* ]]; then
            log_error "JWT_SECRET appears to be a default/weak value in production"
            log_info "Please generate a proper secret: openssl rand -base64 32"
            exit 1
        fi
    fi
    
    # SECURITY: Check for default/insecure database passwords
    local db_password="${POSTGRES_PASSWORD:-}"
    if [[ "$db_password" == "uaip_password" ]] || [ ${#db_password} -lt 12 ]; then
        log_warning "POSTGRES_PASSWORD appears weak (minimum 12 characters recommended)"
        log_info "Consider using a stronger password for production"
    fi
    
    # SECURITY: Warn about API key exposure
    if [ -n "${OPENAI_API_KEY:-}" ] && [ "${OPENAI_API_KEY:-}" != "your-openai-key-here" ]; then
        log_info "  ✓ OPENAI_API_KEY is configured (will be masked in logs)"
    fi
    
    log_success "Environment validation passed"
}

# Create .env file if it doesn't exist
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating .env file with default development values..."
        cat > "$ENV_FILE" << 'EOF'
# =============================================================================
# Navratna - Development Environment Variables
# =============================================================================

# Application Environment
NODE_ENV=development

# =============================================================================
# Database Configuration
# =============================================================================

# PostgreSQL Configuration
POSTGRES_DB=uaip
POSTGRES_USER=uaip_user
POSTGRES_PASSWORD=uaip_password
POSTGRES_MULTIPLE_DATABASES=uaip,uaip_test

# Neo4j Configuration
NEO4J_AUTH=neo4j/uaip_dev_password
NEO4J_USER=neo4j
NEO4J_PASSWORD=uaip_dev_password

# Redis Configuration
REDIS_PASSWORD=uaip_redis_password

# =============================================================================
# Security Configuration
# =============================================================================

# JWT Secret for authentication
JWT_SECRET=uaip_dev_jwt_secret_key_change_in_production

# LLM Provider Encryption Key
LLM_PROVIDER_ENCRYPTION_KEY=dev-encryption-key-change-in-production

# =============================================================================
# LLM Service Configuration
# =============================================================================

# API Keys (Replace with your actual keys)
OPENAI_API_KEY=your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here

# Local LLM Services
OLLAMA_URL=http://localhost:11434
LLM_STUDIO_URL=http://localhost:1234

# =============================================================================
# Frontend Configuration
# =============================================================================

# Development URLs
VITE_API_URL=http://localhost:8081

# Hot Reloading Configuration
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true

# =============================================================================
# Optional Overrides
# =============================================================================

# Uncomment and modify these if you need different values:
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# NEO4J_HOST=localhost
# NEO4J_BOLT_PORT=7687
# NEO4J_HTTP_PORT=7474
# REDIS_HOST=localhost
# REDIS_PORT=6379
# QDRANT_HOST=localhost
# QDRANT_PORT=6333
EOF
        log_success "Created .env file with comprehensive environment variables."
        log_warning "Please update the API keys with your actual values before starting services."
    fi
}

# Service status and URLs
show_service_status() {
    echo ""
    log_header "Service Status & URLs"
    echo ""
    echo -e "${CYAN}🌐 Application Access:${NC}"
    echo "=================="
    echo "🌐 Frontend (React + Vite HMR): http://localhost:8081"
    echo "🔌 API Gateway: http://localhost:8081/api"
    echo ""
    echo -e "${CYAN}🔧 Backend Services:${NC}"
    echo "=================="
    echo "🧠 Agent Intelligence: http://localhost:3001"
    echo "🔄 Orchestration Pipeline: http://localhost:3002"
    echo "📋 Capability Registry: http://localhost:3003"
    echo "🔒 Security Gateway: http://localhost:3004"
    echo "💬 Discussion Orchestration: http://localhost:3005"
    echo "🎨 Artifact Service: http://localhost:3006"
    echo "🤖 LLM Service: http://localhost:3007"
    echo ""
    echo -e "${CYAN}🤖 AI Services:${NC}"
    echo "==============="
    if [ "$GPU_AVAILABLE" = true ]; then
        echo "🔤 TEI Embeddings (GPU): http://localhost:8080"
        echo "🔄 TEI Reranker (GPU): http://localhost:8083"
        echo "🔤 TEI Embeddings (CPU): http://localhost:8082 [fallback]"
    else
        echo "🔤 TEI Embeddings (CPU): http://localhost:8082"
        echo "🔄 TEI Reranker (GPU): http://localhost:8083 [GPU not available]"
        echo "🔤 TEI Embeddings (GPU): http://localhost:8080 [GPU not available]"
    fi
    echo ""
    echo -e "${CYAN}📊 Monitoring & Admin:${NC}"
    echo "======================"
    echo "📈 Grafana: http://localhost:3000 (admin/admin)"
    echo "📊 Prometheus: http://localhost:9090"
    echo "🕸️ Neo4j Browser: http://localhost:7474 (${NEO4J_USER:-neo4j}/${NEO4J_PASSWORD:-uaip_dev_password})"
    echo ""
}

# Wait for services to be healthy
wait_for_services() {
    local services_to_wait="$1"
    log_info "Waiting for services to be ready: $services_to_wait"
    
    # Wait for infrastructure services first
    if [[ "$services_to_wait" == *"postgres"* ]]; then
        log_info "  📊 Waiting for PostgreSQL..."
        timeout 120 bash -c 'until docker-compose ps postgres | grep -q "healthy"; do sleep 2; done' || {
            log_error "PostgreSQL failed to start"
            return 1
        }
    fi
    
    if [[ "$services_to_wait" == *"neo4j"* ]]; then
        log_info "  🕸️ Waiting for Neo4j..."
        timeout 120 bash -c 'until docker-compose ps neo4j | grep -q "healthy"; do sleep 2; done' || {
            log_error "Neo4j failed to start"
            return 1
        }
    fi
    
    if [[ "$services_to_wait" == *"redis"* ]]; then
        log_info "  🔴 Waiting for Redis..."
        timeout 60 bash -c 'until docker-compose ps redis | grep -q "healthy"; do sleep 2; done' || {
            log_error "Redis failed to start"
            return 1
        }
    fi
    
    # Wait for API Gateway if included
    if [[ "$services_to_wait" == *"api-gateway"* ]]; then
        log_info "  🌐 Waiting for API Gateway..."
        timeout 60 bash -c 'until curl -s http://localhost:8081/health > /dev/null 2>&1; do sleep 2; done' || {
            log_warning "API Gateway health check failed, but continuing..."
        }
    fi
    
    log_success "Services are ready!"
}

# Validate service name to prevent command injection
validate_service_name() {
    local service_name="$1"
    
    # Reject if contains dangerous characters
    if echo "$service_name" | grep -q '[;&|>$`\\]'; then
        log_error "Invalid service name: contains forbidden characters"
        exit 1
    fi
    
    # Reject if starts with dash (would be interpreted as option)
    if [[ "$service_name" == -* ]]; then
        log_error "Invalid service name: cannot start with dash"
        exit 1
    fi
    
    # Reject empty or too long names
    if [ -z "$service_name" ] || [ ${#service_name} -gt 100 ]; then
        log_error "Invalid service name: empty or too long"
        exit 1
    fi
}

# Get services based on filter
get_services() {
    local filter="$1"
    local tei_services=""
    
    # Validate input to prevent injection
    validate_service_name "$filter"
    
    # Determine which TEI services to use based on GPU availability
    if [ "$GPU_AVAILABLE" = true ]; then
        tei_services="$TEI_GPU_SERVICES"
    else
        tei_services="$TEI_CPU_SERVICES"
    fi
    
    case "$filter" in
        "all")
            echo "$ALL_SERVICES $tei_services"
            ;;
        "infrastructure"|"infra")
            echo "$INFRASTRUCTURE_SERVICES $tei_services"
            ;;
        "backend")
            echo "$BACKEND_SERVICES"
            ;;
        "frontend")
            echo "$FRONTEND_SERVICES"
            ;;
        "monitoring")
            echo "$MONITORING_SERVICES"
            ;;
        "gateway")
            echo "$GATEWAY_SERVICES"
            ;;
        "tei")
            echo "$tei_services"
            ;;
        "gpu")
            if [ "$GPU_AVAILABLE" = true ]; then
                echo "$TEI_GPU_SERVICES"
            else
                log_warning "GPU not available, using CPU TEI services instead"
                echo "$TEI_CPU_SERVICES"
            fi
            ;;
        "cpu")
            echo "$TEI_CPU_SERVICES"
            ;;
        *)
            # Check if it's a specific service name
            local all_possible_services="$ALL_SERVICES $TEI_GPU_SERVICES $TEI_CPU_SERVICES"
            if [[ "$all_possible_services" == *"$filter"* ]]; then
                echo "$filter"
            else
                log_error "Unknown service filter: $filter"
                log_info "Available filters: all, infrastructure, backend, frontend, monitoring, gateway, tei, gpu, cpu"
                log_info "Or specific service names: $all_possible_services"
                exit 1
            fi
            ;;
    esac
}

# Start services
start_services() {
    local services="$1"
    local mode="$2"
    local rebuild="$3"
    
    log_header "Starting Services: $services"
    
    local compose_args=""
    local profile_args=""
    
    # Check if GPU services are included and GPU is available
    if [[ "$services" == *"tei-embeddings"* ]] && [[ "$services" != *"tei-embeddings-cpu"* ]]; then
        if [ "$GPU_AVAILABLE" = true ]; then
            profile_args="--profile gpu"
            log_info "Using GPU TEI services (GPU detected)"
        else
            log_warning "GPU services requested but GPU not available - please check your setup"
        fi
    elif [[ "$services" == *"tei-reranker"* ]]; then
        if [ "$GPU_AVAILABLE" = true ]; then
            profile_args="--profile gpu"
            log_info "Using GPU TEI services (GPU detected)"
        else
            log_warning "GPU services requested but GPU not available - please check your setup"
        fi
    elif [[ "$services" == *"tei-embeddings-cpu"* ]]; then
        log_info "Using CPU TEI services"
    fi
    
    if [ "$rebuild" = true ]; then
        compose_args="--build"
        log_info "Rebuilding Docker images..."
    fi
    
    if [ "$FORCE_RECREATE" = true ]; then
        compose_args="$compose_args --force-recreate"
        log_info "Force recreating containers..."
    fi
    
    if [ "$mode" = "daemon" ]; then
        log_info "Starting services in daemon mode..."
        docker-compose $profile_args up -d $compose_args $services
        
        wait_for_services "$services"
        show_service_status
        
        log_success "Services started in daemon mode!"
        log_info "💡 Use './dev-start.sh logs [service]' to view logs"
        log_info "💡 Use './dev-start.sh stop' to stop services"
        
    else
        log_info "Starting services in interactive mode..."
        log_info "💡 Press Ctrl+C to stop all services"
        
        # Trap Ctrl+C to gracefully shutdown
        trap 'echo ""; log_info "🛑 Shutting down services..."; docker-compose down; exit 0' INT
        
        docker-compose $profile_args up $compose_args $services
    fi
}

# Stop services
stop_services() {
    local services="$1"
    
    if [ "$services" = "all" ]; then
        log_info "Stopping all services..."
        docker-compose down
    else
        log_info "Stopping services: $services"
        docker-compose stop $services
    fi
    
    log_success "Services stopped"
}

# Restart services
restart_services() {
    local services="$1"
    local rebuild="$2"
    
    log_header "Restarting Services: $services"
    
    if [ "$rebuild" = true ]; then
        log_info "Rebuilding and restarting services..."
        docker-compose up -d --build $services
    else
        log_info "Restarting services..."
        docker-compose restart $services
    fi
    
    wait_for_services "$services"
    log_success "Services restarted!"
}

# Rebuild backend services only
rebuild_backend() {
    local clean=${1:-false}
    log_header "Rebuilding Backend Services"
    
    if [ "$clean" = true ]; then
        log_info "Stopping and removing backend containers..."
        docker-compose down $BACKEND_SERVICES 2>/dev/null || true
        log_info "Building WITHOUT cache (--no-cache --pull)..."
        docker-compose build --no-cache --pull $BACKEND_SERVICES
    else
        log_info "Stopping backend services..."
        docker-compose stop $BACKEND_SERVICES
        log_info "Rebuilding backend Docker images (using cache)..."
        docker-compose build $BACKEND_SERVICES
    fi
    
    log_info "Starting backend services..."
    docker-compose up -d $BACKEND_SERVICES
    
    wait_for_services "$BACKEND_SERVICES"
    log_success "Backend services rebuilt and restarted!"
}

# Show logs
show_logs() {
    local service="$1"
    local follow="$2"
    
    if [ -z "$service" ]; then
        if [ "$follow" = true ]; then
            docker-compose logs -f
        else
            docker-compose logs --tail=100
        fi
    else
        if [ "$follow" = true ]; then
            docker-compose logs -f "$service"
        else
            docker-compose logs --tail=100 "$service"
        fi
    fi
}

# Show service status
service_status() {
    log_header "Service Status"
    docker-compose ps
    echo ""
    show_service_status
}

# Show help
show_help() {
    echo "Navratna - Development Environment Manager"
    echo ""
    echo "Usage: $0 [ACTION] [OPTIONS]"
    echo ""
    echo "ACTIONS:"
    echo "  start              Start services (default)"
    echo "  stop               Stop services"
    echo "  restart            Restart services"
    echo "  rebuild-backend    Rebuild only backend services"
    echo "  logs               Show service logs"
    echo "  status             Show service status"
    echo "  help               Show this help message"
    echo ""
    echo "OPTIONS:"
    echo "  --services <list>       Services to operate on (default: all)"
    echo "                          Options: all, infrastructure, backend, frontend, monitoring, gateway, tei, gpu, cpu"
    echo "                          Or specific service names"
    echo "  --daemon, -d            Run in daemon mode (background)"
    echo "  --rebuild, -r           Rebuild Docker images"
    echo "  --force-recreate        Force recreate containers"
    echo "  --follow, -f            Follow logs (for logs action)"
    echo "  --cpu-only, -c          Force CPU-only mode (disable GPU detection)"
    echo ""
    echo "TEI SERVICES:"
    echo "  By default, GPU TEI services are used if GPU is detected, otherwise CPU fallback is used."
    echo "  Use --cpu-only to explicitly force CPU services even if GPU is available."
    echo ""
    echo "EXAMPLES:"
    echo "  $0                                    # Start all services (GPU if available, CPU fallback)"
    echo "  $0 --daemon                          # Start all services in background"
    echo "  $0 --daemon --cpu-only               # Start all services with CPU-only TEI"
    echo "  $0 --services tei --daemon           # Start only TEI services (auto-detect GPU/CPU)"
    echo "  $0 --services gpu --daemon           # Start only GPU TEI services (if available)"
    echo "  $0 --services cpu --daemon           # Start only CPU TEI services"
    echo "  $0 --services backend --daemon       # Start only backend services"
    echo "  $0 restart --services frontend       # Restart only frontend"
    echo "  $0 rebuild-backend                   # Rebuild only backend services"
    echo "  $0 rebuild-backend --clean           # Clean rebuild (no cache, remove containers first)"
    echo "  $0 logs tei-embeddings --follow      # Follow logs for TEI embeddings service"
    echo "  $0 stop --services monitoring        # Stop only monitoring services"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        start|stop|restart|rebuild-backend|logs|status|help)
            ACTION="$1"
            shift
            ;;
        --services)
            SERVICES="$2"
            shift 2
            ;;
        --daemon|-d)
            MODE="daemon"
            shift
            ;;
        --rebuild|-r)
            REBUILD_BACKEND=true
            shift
            ;;
        --force-recreate)
            FORCE_RECREATE=true
            shift
            ;;
        --follow|-f)
            FOLLOW_LOGS=true
            shift
            ;;
        --cpu-only|-c)
            CPU_ONLY=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            # Check if it's a service name for logs
            if [ "$ACTION" = "logs" ] && [[ "$ALL_SERVICES" == *"$1"* ]]; then
                FOLLOW_LOGS="$1"
                shift
            else
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
            fi
            ;;
    esac
done

# Main execution
main() {
    log_header "Navratna Development Environment"
    
    check_prerequisites
    check_gpu_availability
    create_env_file
    validate_environment
    
    # Get actual services to operate on
    local target_services
    target_services=$(get_services "$SERVICES")
    
    case "$ACTION" in
        "start")
            start_services "$target_services" "$MODE" "$REBUILD_BACKEND"
            ;;
        "stop")
            stop_services "$target_services"
            ;;
        "restart")
            restart_services "$target_services" "$REBUILD_BACKEND"
            ;;
        "rebuild-backend")
            rebuild_backend "$CLEAN_BUILD"
            ;;
        "logs")
            show_logs "$FOLLOW_LOGS" "$FOLLOW_LOGS"
            ;;
        "status")
            service_status
            ;;
        "help")
            show_help
            ;;
        *)
            log_error "Unknown action: $ACTION"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main 