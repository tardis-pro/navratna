#!/bin/bash

# Council of Nycea - Development Hot Reloading Startup Script
# This script starts the entire development environment with hot reloading

set -e

echo "🚀 Starting Council of Nycea Development Environment with Hot Reloading"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file with default development values..."
    cat > .env << EOF
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
EOF
    echo "✅ Created .env file. Please update with your API keys if needed."
fi

# Function to show service status
show_status() {
    echo ""
    echo "📊 Service Status:"
    echo "=================="
    echo "🌐 Frontend (React + Vite HMR): http://localhost:8081"
    echo "🔌 API Gateway: http://localhost:8081/api"
    echo "🧠 Agent Intelligence: http://localhost:3001"
    echo "🔄 Orchestration Pipeline: http://localhost:3002"
    echo "📋 Capability Registry: http://localhost:3003"
    echo "🔒 Security Gateway: http://localhost:3004"
    echo "💬 Discussion Orchestration: http://localhost:3005"
    echo "🎨 Artifact Service: http://localhost:3006"
    echo "🤖 LLM Service: http://localhost:3007"
    echo ""
    echo "📊 Monitoring & Admin:"
    echo "======================"
    echo "📈 Grafana: http://localhost:3000 (admin/admin)"
    echo "📊 Prometheus: http://localhost:9090"
    echo "🐰 RabbitMQ Management: http://localhost:15672 (uaip_user/uaip_password)"
    echo "🕸️ Neo4j Browser: http://localhost:7474 (neo4j/uaip_dev_password)"
    echo ""
}

# Function to wait for services
wait_for_services() {
    echo "⏳ Waiting for services to be ready..."
    
    # Wait for databases first
    echo "  📊 Waiting for databases..."
    timeout 120 bash -c 'until docker-compose ps | grep -q "healthy.*postgres"; do sleep 2; done' || {
        echo "❌ PostgreSQL failed to start"
        exit 1
    }
    
    timeout 120 bash -c 'until docker-compose ps | grep -q "healthy.*neo4j"; do sleep 2; done' || {
        echo "❌ Neo4j failed to start"
        exit 1
    }
    
    # Wait for API Gateway
    echo "  🌐 Waiting for API Gateway..."
    timeout 60 bash -c 'until curl -s http://localhost:8081/health > /dev/null; do sleep 2; done' || {
        echo "❌ API Gateway failed to start"
        exit 1
    }
    
    echo "✅ All services are ready!"
}

# Parse command line arguments
SERVICES="all"
DETACHED=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --services)
            SERVICES="$2"
            shift 2
            ;;
        --detached|-d)
            DETACHED=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --services <list>  Start specific services (comma-separated)"
            echo "                     Options: all, frontend, backend, databases"
            echo "  --detached, -d     Run in detached mode"
            echo "  --help, -h         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                 # Start all services"
            echo "  $0 --detached      # Start all services in background"
            echo "  $0 --services backend  # Start only backend services"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Build and start services
echo "🔨 Building and starting services..."

if [ "$DETACHED" = true ]; then
    echo "🚀 Starting in detached mode..."
    docker-compose up -d --build
    
    wait_for_services
    show_status
    
    echo "🎉 Development environment is ready!"
    echo "💡 Use 'docker-compose logs -f [service-name]' to view logs"
    echo "💡 Use 'docker-compose down' to stop all services"
else
    echo "🚀 Starting in interactive mode..."
    echo "💡 Press Ctrl+C to stop all services"
    
    # Trap Ctrl+C to gracefully shutdown
    trap 'echo ""; echo "🛑 Shutting down services..."; docker-compose down; exit 0' INT
    
    docker-compose up --build
fi 