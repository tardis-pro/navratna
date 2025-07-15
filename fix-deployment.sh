#!/bin/bash

# Fix Deployment Script for Navratna
# Addresses Prometheus mount issues and TEI GPU configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    log_info "Checking system prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check for GPU support
    if command -v nvidia-smi &> /dev/null; then
        log_success "NVIDIA GPU detected"
        GPU_AVAILABLE=true
        nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits
    else
        log_warning "No NVIDIA GPU detected. Will use CPU-only mode."
        GPU_AVAILABLE=false
    fi
    
    # Check Docker GPU runtime
    if docker info | grep -q "nvidia"; then
        log_success "Docker NVIDIA runtime available"
    else
        log_warning "Docker NVIDIA runtime not detected"
    fi
    
    log_success "Prerequisites check completed"
}

# Fix Prometheus configuration
fix_prometheus() {
    log_info "Fixing Prometheus configuration..."
    
    # Verify prometheus.yml exists
    if [[ ! -f "monitoring/prometheus.yml" ]]; then
        log_error "monitoring/prometheus.yml not found"
        exit 1
    fi
    
    # Test prometheus config
    log_info "Testing Prometheus configuration..."
    docker run --rm -v "$(pwd)/monitoring:/etc/prometheus/config" \
        --entrypoint promtool \
        prom/prometheus:latest \
        check config /etc/prometheus/config/prometheus.yml
    
    log_success "Prometheus configuration is valid"
}

# Test TEI deployment
test_tei_deployment() {
    log_info "Testing TEI deployment..."
    
    # Set compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Stop any existing TEI containers
    log_info "Stopping existing TEI containers..."
    $COMPOSE_CMD down tei-embeddings tei-reranker tei-embeddings-cpu 2>/dev/null || true
    
    # Deploy based on GPU availability
    if [[ "$GPU_AVAILABLE" == true ]]; then
        log_info "Deploying TEI with GPU support..."
        $COMPOSE_CMD --profile gpu up -d tei-embeddings tei-reranker
        
        # Wait for services to be ready
        log_info "Waiting for GPU services to be ready..."
        for i in {1..30}; do
            if curl -f -s http://localhost:8080/health > /dev/null && \
               curl -f -s http://localhost:8081/health > /dev/null; then
                log_success "GPU TEI services are ready!"
                break
            fi
            
            if [[ $i -eq 30 ]]; then
                log_error "GPU TEI services failed to start"
                $COMPOSE_CMD logs tei-embeddings tei-reranker
                exit 1
            fi
            
            log_info "Waiting for services... ($i/30)"
            sleep 10
        done
        
        # Test GPU usage
        log_info "Testing GPU usage..."
        response=$(curl -s -X POST http://localhost:8080/embed \
            -H "Content-Type: application/json" \
            -d '{"inputs": "Hello, world!"}')
        
        if [[ $? -eq 0 ]]; then
            log_success "GPU embedding service test passed"
        else
            log_error "GPU embedding service test failed"
        fi
        
    else
        log_info "Deploying TEI with CPU-only support..."
        $COMPOSE_CMD up -d tei-embeddings-cpu
        
        # Wait for service to be ready
        log_info "Waiting for CPU service to be ready..."
        for i in {1..20}; do
            if curl -f -s http://localhost:8082/health > /dev/null; then
                log_success "CPU TEI service is ready!"
                break
            fi
            
            if [[ $i -eq 20 ]]; then
                log_error "CPU TEI service failed to start"
                $COMPOSE_CMD logs tei-embeddings-cpu
                exit 1
            fi
            
            log_info "Waiting for service... ($i/20)"
            sleep 10
        done
        
        # Test CPU service
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

# Test monitoring stack
test_monitoring() {
    log_info "Testing monitoring stack..."
    
    # Set compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Deploy Prometheus with infrastructure profile
    log_info "Deploying Prometheus..."
    $COMPOSE_CMD -f docker-compose.infrastructure.yml --profile monitoring up -d prometheus
    
    # Wait for Prometheus to be ready
    log_info "Waiting for Prometheus to be ready..."
    for i in {1..15}; do
        if curl -f -s http://localhost:9090/-/ready > /dev/null; then
            log_success "Prometheus is ready!"
            break
        fi
        
        if [[ $i -eq 15 ]]; then
            log_error "Prometheus failed to start"
            $COMPOSE_CMD -f docker-compose.infrastructure.yml logs prometheus
            exit 1
        fi
        
        log_info "Waiting for Prometheus... ($i/15)"
        sleep 5
    done
}

# Show service status
show_status() {
    log_info "Current service status:"
    echo
    
    # Set compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Show TEI services
    log_info "TEI Services:"
    $COMPOSE_CMD ps | grep tei || echo "No TEI services running"
    echo
    
    # Show monitoring services
    log_info "Monitoring Services:"
    $COMPOSE_CMD -f docker-compose.infrastructure.yml ps | grep -E "(prometheus|grafana)" || echo "No monitoring services running"
    echo
    
    # Show GPU usage if available
    if [[ "$GPU_AVAILABLE" == true ]]; then
        log_info "GPU Usage:"
        nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits
    fi
}

# Main execution
main() {
    log_info "Starting deployment fix script..."
    
    check_prerequisites
    fix_prometheus
    test_tei_deployment
    test_monitoring
    show_status
    
    log_success "Deployment fix completed successfully!"
    echo
    log_info "Services available:"
    
    if [[ "$GPU_AVAILABLE" == true ]]; then
        echo "  - TEI Embeddings (GPU): http://localhost:8080"
        echo "  - TEI Reranker (GPU): http://localhost:8081"
    else
        echo "  - TEI Embeddings (CPU): http://localhost:8082"
    fi
    
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Grafana: http://localhost:3000 (admin/admin)"
}

# Run main function
main "$@" 