#!/bin/bash

# 🚀 UAIP Portal System Startup Script
# This script launches all necessary services for the portal system

echo "🌟 Starting UAIP Portal System..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to check if a port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}Port $port is already in use${NC}"
        return 1
    else
        return 0
    fi
}

# Function to start a service
start_service() {
    local service_name=$1
    local service_path=$2
    local port=$3
    local color=$4
    
    echo -e "${color}Starting $service_name on port $port...${NC}"
    
    if check_port $port; then
        cd "$service_path" 2>/dev/null
        if [ $? -eq 0 ]; then
            # Start the service in background
            npm run dev > "../logs/${service_name}.log" 2>&1 &
            local pid=$!
            echo $pid > "../logs/${service_name}.pid"
            echo -e "${GREEN}✅ $service_name started (PID: $pid)${NC}"
            cd - > /dev/null
        else
            echo -e "${RED}❌ Directory $service_path not found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  $service_name port $port already in use, skipping...${NC}"
    fi
}

# Create logs directory
mkdir -p backend/logs

echo -e "${BLUE}🔧 Starting Backend Services...${NC}"
echo "=================================="

# Start backend services
start_service "Agent Intelligence" "backend/services/agent-intelligence" "3001" "$PURPLE"
start_service "LLM Service" "backend/services/llm-service" "3002" "$CYAN"
start_service "Capability Registry" "backend/services/capability-registry" "3003" "$GREEN"
start_service "Security Gateway" "backend/services/security-gateway" "3004" "$RED"
start_service "Discussion Orchestration" "backend/services/discussion-orchestration" "3005" "$YELLOW"
start_service "Artifact Service" "backend/services/artifact-service" "3006" "$BLUE"

echo ""
echo -e "${BLUE}🎨 Starting Frontend...${NC}"
echo "=================================="

# Check if frontend is already running
if check_port 3000; then
    echo -e "${CYAN}Starting Frontend on port 3000...${NC}"
    cd apps/frontend 2>/dev/null
    if [ $? -eq 0 ]; then
        npm run dev > "../../backend/logs/frontend.log" 2>&1 &
        local frontend_pid=$!
        echo $frontend_pid > "../../backend/logs/frontend.pid"
        echo -e "${GREEN}✅ Frontend started (PID: $frontend_pid)${NC}"
        cd - > /dev/null
    else
        echo -e "${RED}❌ Frontend directory not found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Frontend port 3000 already in use, skipping...${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Portal System Status${NC}"
echo "=================================="

# Wait a moment for services to start
sleep 3

# Check service status
services=(
    "Agent Intelligence:3001"
    "LLM Service:3002" 
    "Capability Registry:3003"
    "Security Gateway:3004"
    "Discussion Orchestration:3005"
    "Artifact Service:3006"
    "Frontend:3000"
)

for service in "${services[@]}"; do
    IFS=':' read -r name port <<< "$service"
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ $name (http://localhost:$port)${NC}"
    else
        echo -e "${RED}❌ $name (port $port not responding)${NC}"
    fi
done

echo ""
echo -e "${CYAN}🌐 Access URLs:${NC}"
echo "=================================="
echo -e "${BLUE}Portal System:${NC} http://localhost:3000"
echo -e "${PURPLE}Agent Intelligence:${NC} http://localhost:3001"
echo -e "${CYAN}LLM Service:${NC} http://localhost:3002"
echo -e "${GREEN}Capability Registry:${NC} http://localhost:3003"
echo -e "${RED}Security Gateway:${NC} http://localhost:3004"
echo -e "${YELLOW}Discussion Orchestration:${NC} http://localhost:3005"

echo ""
echo -e "${GREEN}🎮 Portal System Commands:${NC}"
echo "=================================="
echo -e "${BLUE}• Open Portal Workspace:${NC} Navigate to http://localhost:3000"
echo -e "${PURPLE}• Spawn Agent Portal:${NC} Click 'Users' icon in sidebar"
echo -e "${CYAN}• Configure Models:${NC} Click 'Settings' icon in sidebar"
echo -e "${GREEN}• Start Chat:${NC} Click 'Message Circle' icon in sidebar"
echo -e "${YELLOW}• View Intelligence:${NC} Click 'Brain' icon in sidebar"
echo -e "${RED}• Control Discussions:${NC} Click 'Message Square' icon in sidebar"

echo ""
echo -e "${GREEN}📋 Management Commands:${NC}"
echo "=================================="
echo -e "${BLUE}• View logs:${NC} tail -f backend/logs/[service-name].log"
echo -e "${PURPLE}• Stop all services:${NC} ./stop-portal-system.sh"
echo -e "${CYAN}• Restart services:${NC} ./restart-portal-system.sh"
echo -e "${GREEN}• Check status:${NC} ./check-portal-status.sh"

echo ""
echo -e "${YELLOW}⚡ Quick Start:${NC}"
echo "=================================="
echo "1. Open http://localhost:3000 in your browser"
echo "2. Click any portal icon in the left sidebar"
echo "3. Start creating agents and exploring!"

echo ""
echo -e "${GREEN}🎊 Portal System is now LIVE!${NC}"
echo -e "${CYAN}Happy agent spawning! 🤖✨${NC}" 