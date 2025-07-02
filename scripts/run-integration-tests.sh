#!/bin/bash

# Integration Test Runner Script
# This script sets up the test environment and runs integration tests

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_ENV_FILE=".env.integration-test"
LOCAL_ENV_FILE=".env.local"
DOCKER_COMPOSE_FILE="docker-compose.test.yml"
TEST_DB_NAME="council_integration_test"
REQUIRED_SERVICES=("postgres" "redis" "rabbitmq")

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_commands=()
    
    if ! command_exists node; then
        missing_commands+=("node")
    fi
    
    if ! command_exists pnpm; then
        missing_commands+=("pnpm")
    fi
    
    if ! command_exists docker; then
        missing_commands+=("docker")
    fi
    
    if ! command_exists docker-compose; then
        missing_commands+=("docker-compose")
    fi
    
    if [ ${#missing_commands[@]} -ne 0 ]; then
        print_error "Missing required commands: ${missing_commands[*]}"
        echo "Please install the missing commands and try again."
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Function to check environment configuration
check_environment() {
    print_status "Checking environment configuration..."
    
    if [ ! -f "$LOCAL_ENV_FILE" ]; then
        if [ -f "$TEST_ENV_FILE" ]; then
            print_warning "No $LOCAL_ENV_FILE found. Copying from $TEST_ENV_FILE"
            cp "$TEST_ENV_FILE" "$LOCAL_ENV_FILE"
            print_warning "Please edit $LOCAL_ENV_FILE with your OAuth credentials before running tests"
            return 1
        else
            print_error "Neither $LOCAL_ENV_FILE nor $TEST_ENV_FILE found"
            return 1
        fi
    fi
    
    # Source the environment file
    set -a
    source "$LOCAL_ENV_FILE"
    set +a
    
    # Check for required OAuth credentials
    local missing_vars=()
    
    if [ -z "$GITHUB_CLIENT_ID" ] || [ "$GITHUB_CLIENT_ID" = "your_github_client_id_here" ]; then
        missing_vars+=("GITHUB_CLIENT_ID")
    fi
    
    if [ -z "$GITHUB_CLIENT_SECRET" ] || [ "$GITHUB_CLIENT_SECRET" = "your_github_client_secret_here" ]; then
        missing_vars+=("GITHUB_CLIENT_SECRET")
    fi
    
    if [ -z "$OAUTH_ENCRYPTION_KEY" ] || [ "$OAUTH_ENCRYPTION_KEY" = "your_64_character_encryption_key_here" ]; then
        missing_vars+=("OAUTH_ENCRYPTION_KEY")
    fi
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_warning "Missing or placeholder OAuth credentials: ${missing_vars[*]}"
        print_warning "Some OAuth integration tests may be skipped"
    else
        print_success "OAuth credentials configured"
    fi
}

# Function to start infrastructure services
start_infrastructure() {
    print_status "Starting infrastructure services..."
    
    # Create docker-compose file if it doesn't exist
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        create_docker_compose_file
    fi
    
    # Start services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d "${REQUIRED_SERVICES[@]}"
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "PostgreSQL failed to start within timeout"
            return 1
        fi
        
        sleep 2
        ((attempt++))
    done
    
    # Wait for Redis
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T redis redis-cli ping >/dev/null 2>&1; then
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Redis failed to start within timeout"
            return 1
        fi
        
        sleep 2
        ((attempt++))
    done
    
    print_success "Infrastructure services are ready"
}

# Function to create docker-compose file for testing
create_docker_compose_file() {
    print_status "Creating $DOCKER_COMPOSE_FILE..."
    
    cat > "$DOCKER_COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:17.5
    environment:
      POSTGRES_DB: council_integration_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5433:5432"
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    volumes:
      - redis_test_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5673:5672"
      - "15673:15672"
    volumes:
      - rabbitmq_test_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  postgres_test_data:
  redis_test_data:
  rabbitmq_test_data:
EOF
    
    print_success "Created $DOCKER_COMPOSE_FILE"
}

# Function to setup test database
setup_database() {
    print_status "Setting up test database..."
    
    # Create test database if it doesn't exist
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres createdb -U postgres "$TEST_DB_NAME" 2>/dev/null || true
    
    print_success "Test database ready"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    pnpm install --frozen-lockfile
    
    print_success "Dependencies installed"
}

# Function to run integration tests
run_tests() {
    print_status "Running integration tests..."
    
    # Set test environment variables
    export NODE_ENV=test
    export TEST_DB_HOST=localhost
    export TEST_DB_PORT=5433
    export TEST_DB_USERNAME=postgres
    export TEST_DB_PASSWORD=postgres
    export TEST_DB_NAME="$TEST_DB_NAME"
    export REDIS_HOST=localhost
    export REDIS_PORT=6380
    export RABBITMQ_URL=amqp://guest:guest@localhost:5673
    
    # Run tests based on arguments
    local test_pattern=""
    local test_options="--runInBand --forceExit --detectOpenHandles"
    
    if [ "$1" = "oauth" ]; then
        test_pattern="oauth-flow.integration.test.ts"
        print_status "Running OAuth integration tests..."
    elif [ "$1" = "security" ]; then
        test_pattern="security-validation.integration.test.ts"
        print_status "Running security validation tests..."
    elif [ "$1" = "coverage" ]; then
        test_options="$test_options --coverage --coverageReporters=text --coverageReporters=html"
        print_status "Running all integration tests with coverage..."
    elif [ "$1" = "verbose" ]; then
        test_options="$test_options --verbose"
        print_status "Running all integration tests with verbose output..."
    else
        print_status "Running all integration tests..."
    fi
    
    # Navigate to security gateway service
    cd backend/services/security-gateway
    
    # Run the tests
    if [ -n "$test_pattern" ]; then
        npx jest "src/__tests__/integration/$test_pattern" $test_options
    else
        npx jest "src/__tests__/integration/" $test_options
    fi
    
    local test_exit_code=$?
    
    # Return to root directory
    cd ../../..
    
    if [ $test_exit_code -eq 0 ]; then
        print_success "Integration tests completed successfully"
    else
        print_error "Integration tests failed with exit code $test_exit_code"
        return $test_exit_code
    fi
}

# Function to cleanup test environment
cleanup() {
    print_status "Cleaning up test environment..."
    
    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" down -v
        print_success "Test services stopped and cleaned up"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  setup     - Setup test environment (install deps, start services)"
    echo "  test      - Run integration tests"
    echo "  oauth     - Run OAuth integration tests only"
    echo "  security  - Run security validation tests only"
    echo "  coverage  - Run tests with coverage report"
    echo "  verbose   - Run tests with verbose output"
    echo "  cleanup   - Stop and cleanup test services"
    echo "  help      - Show this help message"
    echo ""
    echo "Options:"
    echo "  --skip-setup    Skip environment setup"
    echo "  --keep-running  Keep services running after tests"
    echo ""
    echo "Examples:"
    echo "  $0 setup              # Setup test environment"
    echo "  $0 test               # Run all integration tests"
    echo "  $0 oauth              # Run OAuth tests only"
    echo "  $0 test --keep-running # Run tests and keep services running"
}

# Main execution logic
main() {
    local command="${1:-test}"
    local skip_setup=false
    local keep_running=false
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-setup)
                skip_setup=true
                shift
                ;;
            --keep-running)
                keep_running=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case $command in
        setup)
            check_prerequisites
            check_environment
            install_dependencies
            start_infrastructure
            setup_database
            print_success "Test environment setup complete"
            ;;
        test|oauth|security|coverage|verbose)
            if [ "$skip_setup" = false ]; then
                check_prerequisites
                check_environment || true  # Continue even if OAuth creds missing
                install_dependencies
                start_infrastructure
                setup_database
            fi
            
            run_tests "$command"
            local exit_code=$?
            
            if [ "$keep_running" = false ]; then
                cleanup
            else
                print_status "Services are still running. Use '$0 cleanup' to stop them."
            fi
            
            exit $exit_code
            ;;
        cleanup)
            cleanup
            ;;
        help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Trap to cleanup on script exit
trap cleanup EXIT

# Run main function with all arguments
main "$@"