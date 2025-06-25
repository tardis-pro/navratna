#!/bin/bash

# TEI Deployment Script
# Automates the setup and deployment of Text Embeddings Inference services

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/sample.env"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check for GPU support (optional)
    if command -v nvidia-smi &> /dev/null; then
        log_success "NVIDIA GPU detected"
        GPU_AVAILABLE=true
    else
        log_warning "No NVIDIA GPU detected. Will use CPU-only mode."
        GPU_AVAILABLE=false
    fi
    
    log_success "Prerequisites check completed"
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    # Data directories are managed by Docker volumes
    log_info "TEI data will be stored in Docker volumes"
    
    # Copy environment file if it doesn't exist
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_EXAMPLE" ]]; then
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            log_info "Created $ENV_FILE from example. Please review and modify as needed."
        else
            log_warning "No environment example file found. Using defaults."
        fi
    fi
    
    log_success "Environment setup completed"
}

# Deploy services
deploy_services() {
    log_info "Deploying TEI services..."
    
    cd "$SCRIPT_DIR"
    
    # Set compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Pull latest images
    log_info "Pulling latest TEI images..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" pull
    
    # Deploy based on GPU availability
    if [[ "$GPU_AVAILABLE" == true ]]; then
        log_info "Deploying with GPU support..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" --profile gpu up -d tei-embeddings tei-reranker
    else
        log_info "Deploying CPU-only services..."
        $COMPOSE_CMD -f "$COMPOSE_FILE" up -d tei-embeddings-cpu
    fi
    
    log_success "TEI services deployed"
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if [[ "$GPU_AVAILABLE" == true ]]; then
            # Check GPU services
            if curl -f -s http://localhost:8080/health > /dev/null && \
               curl -f -s http://localhost:8081/health > /dev/null; then
                log_success "All services are ready!"
                return 0
            fi
        else
            # Check CPU service
            if curl -f -s http://localhost:8082/health > /dev/null; then
                log_success "CPU service is ready!"
                return 0
            fi
        fi
        
        log_info "Attempt $attempt/$max_attempts - Services not ready yet, waiting..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Services failed to become ready within expected time"
    return 1
}

# Test services
test_services() {
    log_info "Testing TEI services..."
    
    if [[ "$GPU_AVAILABLE" == true ]]; then
        # Test embedding service
        log_info "Testing embedding service..."
        response=$(curl -s -X POST http://localhost:8080/embed \
            -H "Content-Type: application/json" \
            -d '{"inputs": "Hello, world!"}')
        
        if [[ $? -eq 0 ]]; then
            log_success "Embedding service test passed"
        else
            log_error "Embedding service test failed"
        fi
        
        # Test reranker service
        log_info "Testing reranker service..."
        response=$(curl -s -X POST http://localhost:8081/rerank \
            -H "Content-Type: application/json" \
            -d '{"query": "machine learning", "texts": ["AI and ML", "cooking recipes"]}')
        
        if [[ $? -eq 0 ]]; then
            log_success "Reranker service test passed"
        else
            log_error "Reranker service test failed"
        fi
    else
        # Test CPU embedding service
        log_info "Testing CPU embedding service..."
        response=$(curl -s -X POST http://localhost:8082/embed \
            -H "Content-Type: application/json" \
            -d '{"inputs": "Hello, world!"}')
        
        if [[ $? -eq 0 ]]; then
            log_success "CPU embedding service test passed"
        else
            log_error "CPU embedding service test failed"
        fi
    fi
}

# Show service status
show_status() {
    log_info "Service Status:"
    echo
    
    cd "$SCRIPT_DIR"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose -f "$COMPOSE_FILE" ps
    else
        docker compose -f "$COMPOSE_FILE" ps
    fi
    
    echo
    log_info "Service URLs:"
    if [[ "$GPU_AVAILABLE" == true ]]; then
        echo "  Embedding Service: http://localhost:8080"
        echo "  Reranker Service:  http://localhost:8081"
        echo "  Metrics (Embedding): http://localhost:9080/metrics"
        echo "  Metrics (Reranker):  http://localhost:9081/metrics"
    else
        echo "  CPU Embedding Service: http://localhost:8082"
        echo "  Metrics (CPU): http://localhost:9082/metrics"
    fi
    echo "  Health endpoints: Add /health to any service URL"
    echo "  API docs: Add /docs to any service URL"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up TEI services..."
    
    cd "$SCRIPT_DIR"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose -f "$COMPOSE_FILE" down
    else
        docker compose -f "$COMPOSE_FILE" down
    fi
    
    log_success "TEI services stopped"
}

# Main deployment function
main() {
    case "${1:-deploy}" in
        "deploy")
            log_info "Starting TEI deployment..."
            check_prerequisites
            setup_environment
            deploy_services
            wait_for_services
            test_services
            show_status
            log_success "TEI deployment completed successfully!"
            ;;
        "stop")
            cleanup
            ;;
        "status")
            show_status
            ;;
        "test")
            test_services
            ;;
        "logs")
            cd "$SCRIPT_DIR"
            if command -v docker-compose &> /dev/null; then
                docker-compose -f "$COMPOSE_FILE" logs -f "${2:-}"
            else
                docker compose -f "$COMPOSE_FILE" logs -f "${2:-}"
            fi
            ;;
        *)
            echo "Usage: $0 {deploy|stop|status|test|logs [service_name]}"
            echo
            echo "Commands:"
            echo "  deploy  - Deploy TEI services (default)"
            echo "  stop    - Stop all TEI services"
            echo "  status  - Show service status and URLs"
            echo "  test    - Test service endpoints"
            echo "  logs    - Show service logs (optionally for specific service)"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@" 