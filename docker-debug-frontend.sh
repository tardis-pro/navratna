#!/bin/bash

# Frontend Docker Debugging Script
# This script helps debug frontend Docker issues

set -e

echo "🔍 Frontend Docker Debugging Script"
echo "=================================="

# Function to check Docker status
check_docker() {
    echo "📋 Checking Docker status..."
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
    echo "✅ Docker is running"
}

# Function to check shared packages
check_shared_packages() {
    echo "📦 Checking shared packages..."
    
    if [ ! -d "packages/shared-types/dist" ]; then
        echo "❌ shared-types not built. Building now..."
        cd packages/shared-types && pnpm build && cd ../..
    else
        echo "✅ shared-types is built"
    fi
    
    if [ ! -d "packages/shared-utils/dist" ]; then
        echo "❌ shared-utils not built. Building now..."
        cd packages/shared-utils && pnpm build && cd ../..
    else
        echo "✅ shared-utils is built"
    fi
}

# Function to build frontend image
build_frontend() {
    echo "🔨 Building frontend Docker image..."
    docker build -f apps/frontend/Dockerfile -t council-frontend:debug .
    echo "✅ Frontend image built successfully"
}

# Function to run frontend container with debugging
run_frontend_debug() {
    echo "🚀 Running frontend container in debug mode..."
    
    # Stop existing container if running
    docker stop council-frontend-debug 2>/dev/null || true
    docker rm council-frontend-debug 2>/dev/null || true
    
    # Run with interactive mode and debugging
    docker run -it --rm \
        --name council-frontend-debug \
        -p 5173:5173 \
        -e NODE_ENV=development \
        -e VITE_API_URL=http://localhost:8081 \
        -e VITE_API_TARGET=http://host.docker.internal:8081 \
        -e CHOKIDAR_USEPOLLING=true \
        -e WATCHPACK_POLLING=true \
        -v "$(pwd)/apps/frontend/src:/app/apps/frontend/src" \
        -v "$(pwd)/apps/frontend/public:/app/apps/frontend/public" \
        -v "$(pwd)/packages:/app/packages" \
        council-frontend:debug
}

# Function to check frontend logs
check_logs() {
    echo "📝 Checking frontend container logs..."
    docker logs council-frontend 2>&1 | tail -50
}

# Function to exec into container
exec_into_container() {
    echo "🔧 Entering frontend container for debugging..."
    docker exec -it council-frontend /bin/sh
}

# Function to test frontend connectivity
test_connectivity() {
    echo "🌐 Testing frontend connectivity..."
    
    echo "Testing localhost:5173..."
    curl -f http://localhost:5173 || echo "❌ Frontend not responding on localhost:5173"
    
    echo "Testing API proxy..."
    curl -f http://localhost:5173/api/health || echo "❌ API proxy not working"
}

# Parse command line arguments
case "${1:-help}" in
    "check")
        check_docker
        check_shared_packages
        ;;
    "build")
        check_docker
        check_shared_packages
        build_frontend
        ;;
    "run")
        check_docker
        check_shared_packages
        build_frontend
        run_frontend_debug
        ;;
    "logs")
        check_logs
        ;;
    "exec")
        exec_into_container
        ;;
    "test")
        test_connectivity
        ;;
    "help"|*)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  check    - Check Docker and shared packages status"
        echo "  build    - Build frontend Docker image"
        echo "  run      - Run frontend container in debug mode"
        echo "  logs     - Show frontend container logs"
        echo "  exec     - Enter frontend container for debugging"
        echo "  test     - Test frontend connectivity"
        echo "  help     - Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 check     # Check prerequisites"
        echo "  $0 build     # Build frontend image"
        echo "  $0 run       # Run frontend in debug mode"
        ;;
esac 