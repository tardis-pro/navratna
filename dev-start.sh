#!/bin/bash

# Council of Nycea - Enhanced Development Environment Manager
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
INFRASTRUCTURE_SERVICES="postgres neo4j redis qdrant rabbitmq"
BACKEND_SERVICES="agent-intelligence orchestration-pipeline capability-registry security-gateway discussion-orchestration artifact-service llm-service"
FRONTEND_SERVICES="frontend"
MONITORING_SERVICES="prometheus grafana"
GATEWAY_SERVICES="api-gateway"

ALL_SERVICES="$INFRASTRUCTURE_SERVICES $BACKEND_SERVICES $FRONTEND_SERVICES $MONITORING_SERVICES $GATEWAY_SERVICES"

# Default values
MODE="interactive"
ACTION="start"
SERVICES="all"
REBUILD_BACKEND=false
FORCE_RECREATE=false
FOLLOW_LOGS=""

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

# Create .env file if it doesn't exist
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating .env file with default development values..."
        cat > "$ENV_FILE" << 'EOF'
# Development Environment Variables
NODE_ENV=development

# LLM Service Configuration
OPENAI_API_KEY=your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
OLLAMA_URL=http://localhost:11434
LLM_STUDIO_URL=http://localhost:1234
LLM_PROVIDER_ENCRYPTION_KEY=dev-encryption-key-change-in-production

# Development URLs
VITE_API_URL=http://localhost:8081

# Hot Reloading Configuration
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true
EOF
        log_success "Created .env file. Please update with your API keys if needed."
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
    echo -e "${CYAN}📊 Monitoring & Admin:${NC}"
    echo "======================"
    echo "📈 Grafana: http://localhost:3000 (admin/admin)"
    echo "📊 Prometheus: http://localhost:9090"
    echo "🐰 RabbitMQ Management: http://localhost:15672 (uaip_user/uaip_password)"
    echo "🕸️ Neo4j Browser: http://localhost:7474 (neo4j/uaip_dev_password)"
    echo ""
}

# Wait for services to be healthy
wait_for_services() {
    local services_to_wait="$1"
    log_info "Waiting for services to be ready: $services_to_wait"
    
    # Wait for infrastructure services first
    if [[ "$services_to_wait" == *"postgres"* ]]; then
        log_info "  📊 Waiting for PostgreSQL..."
        timeout 120 bash -c 'until docker-compose ps postgres | grep -q "healthy\|Up"; do sleep 2; done' || {
            log_error "PostgreSQL failed to start"
            return 1
        }
    fi
    
    if [[ "$services_to_wait" == *"neo4j"* ]]; then
        log_info "  🕸️ Waiting for Neo4j..."
        timeout 120 bash -c 'until docker-compose ps neo4j | grep -q "healthy\|Up"; do sleep 2; done' || {
            log_error "Neo4j failed to start"
            return 1
        }
    fi
    
    if [[ "$services_to_wait" == *"redis"* ]]; then
        log_info "  🔴 Waiting for Redis..."
        timeout 60 bash -c 'until docker-compose ps redis | grep -q "healthy\|Up"; do sleep 2; done' || {
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

# Get services based on filter
get_services() {
    local filter="$1"
    case "$filter" in
        "all")
            echo "$ALL_SERVICES"
            ;;
        "infrastructure"|"infra")
            echo "$INFRASTRUCTURE_SERVICES"
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
        *)
            # Check if it's a specific service name
            if [[ "$ALL_SERVICES" == *"$filter"* ]]; then
                echo "$filter"
            else
                log_error "Unknown service filter: $filter"
                log_info "Available filters: all, infrastructure, backend, frontend, monitoring, gateway"
                log_info "Or specific service names: $ALL_SERVICES"
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
        docker-compose up -d $compose_args $services
        
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
        
        docker-compose up $compose_args $services
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
    log_header "Rebuilding Backend Services"
    
    log_info "Stopping backend services..."
    docker-compose stop $BACKEND_SERVICES
    
    log_info "Rebuilding backend Docker images..."
    docker-compose build $BACKEND_SERVICES
    
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
    echo "Council of Nycea - Development Environment Manager"
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
    echo "                          Options: all, infrastructure, backend, frontend, monitoring, gateway"
    echo "                          Or specific service names"
    echo "  --daemon, -d            Run in daemon mode (background)"
    echo "  --rebuild, -r           Rebuild Docker images"
    echo "  --force-recreate        Force recreate containers"
    echo "  --follow, -f            Follow logs (for logs action)"
    echo ""
    echo "EXAMPLES:"
    echo "  $0                                    # Start all services interactively"
    echo "  $0 --daemon                          # Start all services in background"
    echo "  $0 --services backend --daemon       # Start only backend services in background"
    echo "  $0 restart --services frontend       # Restart only frontend"
    echo "  $0 rebuild-backend                   # Rebuild only backend services"
    echo "  $0 logs agent-intelligence --follow  # Follow logs for specific service"
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
    log_header "Council of Nycea Development Environment"
    
    check_prerequisites
    create_env_file
    
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
            rebuild_backend
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